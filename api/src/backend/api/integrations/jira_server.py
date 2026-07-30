"""Client for self-hosted Jira (Server / Data Center).

Deliberately separate from `prowler.lib.outputs.jira.jira.Jira`: that class is
Jira-Cloud-specific end to end (OAuth 3LO against auth.atlassian.com, cloud-ID
resolution, requests proxied through api.atlassian.com, REST API v3, ADF issue
descriptions). None of that exists on a Server/Data Center instance, which is
reached directly at its own base URL, authenticates with a bearer Personal
Access Token, and only supports REST API v2 with plain-text descriptions.

Lives under `api/src/backend` (not `prowler/lib/outputs`) because the `prowler`
core package is installed at image-build time from
`git+https://github.com/prowler-cloud/prowler.git@master` (see
`api/pyproject.toml`) rather than from this checkout, so new code placed under
`prowler/` would not be included in a custom-built API image.
"""

import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional
from urllib.parse import urljoin

import requests

from prowler.providers.common.models import Connection

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 90

# Jira's `description` field caps at 32,767 characters; stay comfortably under
# it and truncate rather than let issue creation fail.
MAX_DESCRIPTION_CHARS = 30000
# Stop attaching per-resource evidence once the description reaches this size,
# so a check with many resources still lists them all (name + reason) even if
# the raw evidence has to be dropped for the tail.
EVIDENCE_BUDGET_CHARS = 24000
# Cap each resource's raw evidence blob.
MAX_EVIDENCE_CHARS = 1200


class JiraServerError(Exception):
    """Base exception for Jira Server client errors."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class JiraServerAuthenticationError(JiraServerError):
    """The Personal Access Token was rejected by the Jira Server instance."""


class JiraServerConnectionError(JiraServerError):
    """The Jira Server instance could not be reached at all (network/DNS/TLS)."""


class JiraServerNoProjectsError(JiraServerError):
    """The Jira Server instance returned zero visible projects."""


class JiraServerGetProjectsError(JiraServerError):
    """Failed to list projects from the Jira Server instance."""


class JiraServerGetIssueTypesError(JiraServerError):
    """Failed to list issue types for a project on the Jira Server instance."""


@dataclass
class JiraServerConnection(Connection):
    """Result of testing a Jira Server connection.

    Attributes:
        projects: Dict of project key -> project name.
        issue_types: Dict of project key -> list of issue type names.
    """

    projects: dict = None
    issue_types: dict = None


def _format_issue_creation_error(response: requests.Response) -> str:
    try:
        response_json = response.json()
    except ValueError:
        return f"Failed to create Jira issue: Jira returned status code {response.status_code}."

    if not isinstance(response_json, dict):
        return f"Failed to create Jira issue: Jira returned status code {response.status_code}."

    message_parts = []
    errors = response_json.get("errors")
    if isinstance(errors, dict):
        message_parts.extend(
            f"'{field}': '{message}'" for field, message in errors.items() if message
        )

    error_messages = response_json.get("errorMessages")
    if isinstance(error_messages, list):
        message_parts.extend(str(message) for message in error_messages if message)

    if message_parts:
        return f"Failed to create Jira issue: {'; '.join(message_parts)}"

    return f"Failed to create Jira issue: Jira returned status code {response.status_code}."


def _sanitize_summary(summary: str) -> str:
    """Collapse whitespace and cap at Jira's 255-character summary limit."""
    return " ".join(summary.split())[:255]


def _build_description(
    *,
    check_id: str,
    check_title: str,
    severity: str,
    status: str,
    status_extended: str,
    provider: str,
    resources: List[dict],
    risk: str,
    recommendation_text: str,
    recommendation_url: str,
    remediation_code_native_iac: str,
    remediation_code_terraform: str,
    remediation_code_cli: str,
    remediation_code_other: str,
    compliance: Optional[dict],
) -> str:
    """Build a plain-text issue description.

    Jira Server/DC's REST API v2 takes a plain string (or wiki markup, not
    ADF) for `description` — this intentionally skips the Atlassian Document
    Format machinery the Cloud client builds, which is v3-only.

    ``resources`` is a list of resource-detail dicts (uid, name, region,
    service, type, account_uid, account_alias, status_extended, tags). One
    entry for a single-finding issue, or many for a grouped
    (one-issue-per-check) issue. Each carries its own ``status_extended`` — the
    specific reason that resource failed — since that varies per resource even
    within one check.
    """
    lines = [
        f"*Check*: {check_title} ({check_id})",
        f"*Severity*: {severity}",
        f"*Status*: {status}",
        f"*Provider*: {provider}",
    ]

    if risk:
        lines.append("")
        lines.append(f"*Risk*: {risk}")
    if recommendation_text:
        lines.append("")
        recommendation = f"*Recommendation*: {recommendation_text}"
        if recommendation_url:
            recommendation += f" ({recommendation_url})"
        lines.append(recommendation)

    remediation_blocks = [
        ("Terraform", remediation_code_terraform),
        ("Native IaC", remediation_code_native_iac),
        ("CLI", remediation_code_cli),
        ("Other", remediation_code_other),
    ]
    for label, code in remediation_blocks:
        if code:
            lines.append("")
            lines.append(f"*Remediation ({label})*:")
            lines.append("{code}")
            lines.append(code)
            lines.append("{code}")

    if resources:
        lines.append("")
        lines.append(f"*Affected resources* ({len(resources)}):")
        # Rough running size so evidence blocks don't blow the description cap.
        approx_len = sum(len(line) + 1 for line in lines)
        for resource in resources:
            name = resource.get("name") or ""
            uid = resource.get("uid") or ""
            heading = name or uid or "(unknown resource)"
            resource_lines = [f"# *{heading}*"]
            if uid and uid != name:
                resource_lines.append(f"** ARN/ID: {uid}")

            account_uid = resource.get("account_uid") or ""
            account_alias = resource.get("account_alias") or ""
            if account_uid or account_alias:
                account = " ".join(
                    part
                    for part in [account_alias, f"({account_uid})" if account_uid else ""]
                    if part
                )
                resource_lines.append(f"** Account: {account}")

            location = " | ".join(
                f"{label}: {value}"
                for label, value in (
                    ("Region", resource.get("region") or ""),
                    ("Service", resource.get("service") or ""),
                    ("Type", resource.get("type") or ""),
                )
                if value
            )
            if location:
                resource_lines.append(f"** {location}")

            status_extended = resource.get("status_extended") or ""
            if status_extended:
                resource_lines.append(f"** Reason: {status_extended}")

            tags = resource.get("tags")
            if tags:
                resource_lines.append(
                    "** Tags: " + ", ".join(f"{k}={v}" for k, v in tags.items())
                )

            # Evidence (the raw check result Prowler records), budget permitting.
            raw_result = resource.get("raw_result")
            if raw_result and approx_len < EVIDENCE_BUDGET_CHARS:
                try:
                    evidence = json.dumps(raw_result, default=str, sort_keys=True)
                except (TypeError, ValueError):
                    evidence = str(raw_result)
                if len(evidence) > MAX_EVIDENCE_CHARS:
                    evidence = evidence[:MAX_EVIDENCE_CHARS] + " …(truncated)"
                resource_lines.append("** Evidence:")
                resource_lines.append("{code}")
                resource_lines.append(evidence)
                resource_lines.append("{code}")

            block = "\n".join(resource_lines)
            approx_len += len(block) + 1
            lines.append(block)

    if compliance:
        lines.append("")
        lines.append(
            "*Compliance*: " + ", ".join(f"{k}: {v}" for k, v in compliance.items())
        )

    description = "\n".join(lines)
    if len(description) > MAX_DESCRIPTION_CHARS:
        description = (
            description[:MAX_DESCRIPTION_CHARS] + "\n\n…(description truncated)"
        )
    return description


class JiraServer:
    """Client for a self-hosted Jira Server / Data Center instance."""

    def __init__(
        self,
        base_url: str,
        personal_access_token: str,
        extra_fields: Optional[dict] = None,
    ):
        if not base_url or not personal_access_token:
            raise JiraServerError(
                "Both base_url and personal_access_token are required."
            )
        self._base_url = base_url.rstrip("/") + "/"
        self._token = personal_access_token
        # Raw Jira `fields` object merged into every created issue. Lets a
        # self-hosted instance satisfy project-mandatory fields (assignee,
        # custom "Pod"/"Task Type"/etc.) that Prowler can't infer. Supplied
        # verbatim in the exact shape Jira's create API expects, e.g.
        # {"assignee": {"name": "user"}, "customfield_10111": {"value": "X"}}.
        self._extra_fields = extra_fields or {}

    def set_extra_fields(self, extra_fields: Optional[dict]) -> None:
        """Replace the extra fields merged into created issues.

        Used per-dispatch to apply the required-fields JSON of the specific
        project being filed into, since a Jira Server integration can target
        several projects, each with its own mandatory fields.
        """
        self._extra_fields = extra_fields or {}

    def _url(self, path: str) -> str:
        return urljoin(self._base_url, path.lstrip("/"))

    def get_headers(self, content_type_json: bool = False) -> dict:
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }
        if content_type_json:
            headers["Content-Type"] = "application/json"
        return headers

    def get_projects(self) -> Dict[str, str]:
        """Return {project_key: project_name} for every visible project."""
        try:
            response = requests.get(
                self._url("rest/api/2/project"),
                headers=self.get_headers(),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as error:
            raise JiraServerConnectionError(
                f"Could not reach Jira Server at {self._base_url}: {error}"
            )

        if response.status_code in (401, 403):
            raise JiraServerAuthenticationError(
                "Jira Server rejected the Personal Access Token."
            )
        if response.status_code != 200:
            raise JiraServerGetProjectsError(
                f"Failed to get projects: {response.status_code} - {response.text}"
            )

        projects = {project["key"]: project["name"] for project in response.json()}
        if not projects:
            raise JiraServerNoProjectsError("No projects found in Jira Server.")
        return projects

    def get_available_issue_types(self, project_key: str) -> List[str]:
        """List issue types available for creating issues in a project.

        Uses the per-project `createmeta/{projectKey}/issuetypes` endpoint
        rather than the old bulk `createmeta?projectKeys=...&expand=...`
        endpoint: Atlassian replaced the bulk form years ago, and some
        Server/Data Center versions no longer route it at all, in which case
        it 404s with a generic "Issue Does Not Exist" (the request falls
        through to the single-issue-lookup handler, which treats "createmeta"
        as an issue key).
        """
        try:
            response = requests.get(
                self._url(f"rest/api/2/issue/createmeta/{project_key}/issuetypes"),
                params={"maxResults": 200},
                headers=self.get_headers(),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as error:
            raise JiraServerConnectionError(
                f"Could not reach Jira Server at {self._base_url}: {error}"
            )

        if response.status_code in (401, 403):
            raise JiraServerAuthenticationError(
                "Jira Server rejected the Personal Access Token."
            )
        if response.status_code == 404:
            raise JiraServerNoProjectsError(
                f"Project '{project_key}' was not found in Jira Server."
            )
        if response.status_code != 200:
            raise JiraServerGetIssueTypesError(
                f"Failed to get issue types: {response.status_code} - {response.text}"
            )

        issue_types = response.json().get("values", [])
        return [issue_type["name"] for issue_type in issue_types]

    @staticmethod
    def test_connection(
        base_url: str = None,
        personal_access_token: str = None,
        raise_on_exception: bool = True,
    ) -> JiraServerConnection:
        try:
            client = JiraServer(
                base_url=base_url, personal_access_token=personal_access_token
            )
            projects = client.get_projects()

            issue_types = {}
            for project_key in projects:
                try:
                    issue_types[project_key] = client.get_available_issue_types(
                        project_key
                    )
                except JiraServerError as error:
                    logger.warning(
                        "Failed to get issue types for project %s: %s",
                        project_key,
                        error,
                    )
                    issue_types[project_key] = []

            return JiraServerConnection(
                is_connected=True, projects=projects, issue_types=issue_types
            )
        except Exception as error:
            if raise_on_exception:
                raise
            return JiraServerConnection(is_connected=False, error=error)

    def send_finding(
        self,
        check_id: str = "",
        check_title: str = "",
        severity: str = "",
        status: str = "",
        status_extended: str = "",
        provider: str = "",
        region: str = "",
        resource_uid: str = "",
        resource_name: str = "",
        risk: str = "",
        recommendation_text: str = "",
        recommendation_url: str = "",
        remediation_code_native_iac: str = "",
        remediation_code_terraform: str = "",
        remediation_code_cli: str = "",
        remediation_code_other: str = "",
        resource_tags: Optional[dict] = None,
        compliance: Optional[dict] = None,
        resources: Optional[List[dict]] = None,
        project_key: str = "",
        issue_type: str = "",
        **_ignored,
    ) -> bool:
        """Create a Jira issue for one finding, or one grouped per-check issue.

        Mirrors the Cloud client's `send_finding` signature/contract (same
        keyword arguments as called from `send_findings_to_jira` in
        `tasks/jobs/integrations.py`, same True/False return for
        success/failure) so that job requires no changes to dispatch to
        either integration type.

        When ``resources`` is provided (grouped dispatch), the issue covers
        every listed resource; otherwise the single resource described by the
        scalar ``resource_*``/``region`` arguments is used.
        """
        if resources is None:
            resources = [
                {
                    "uid": resource_uid,
                    "name": resource_name,
                    "region": region,
                    "status_extended": status_extended,
                    "raw_result": _ignored.get("raw_result") or {},
                    "tags": resource_tags or {},
                }
            ]

        if len(resources) == 1:
            primary = resources[0]
            resource_label = primary.get("name") or primary.get("uid") or ""
            summary = _sanitize_summary(f"{check_title} - {resource_label}")
        else:
            summary = _sanitize_summary(
                f"{check_title} - {len(resources)} affected resources"
            )

        description = _build_description(
            check_id=check_id,
            check_title=check_title,
            severity=severity,
            status=status,
            status_extended=status_extended,
            provider=provider,
            resources=resources,
            risk=risk,
            recommendation_text=recommendation_text,
            recommendation_url=recommendation_url,
            remediation_code_native_iac=remediation_code_native_iac,
            remediation_code_terraform=remediation_code_terraform,
            remediation_code_cli=remediation_code_cli,
            remediation_code_other=remediation_code_other,
            compliance=compliance,
        )

        fields = {
            "project": {"key": project_key},
            "summary": summary,
            "description": description,
            "issuetype": {"name": issue_type},
        }
        # User-supplied extra fields win, so they can populate project-mandatory
        # fields (and even override the defaults above if deliberately set).
        fields.update(self._extra_fields)
        payload = {"fields": fields}

        try:
            response = requests.post(
                self._url("rest/api/2/issue"),
                json=payload,
                headers=self.get_headers(content_type_json=True),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as error:
            logger.error("Failed to send finding %s to Jira Server: %s", check_id, error)
            return False

        if response.status_code != 201:
            logger.error(
                "Failed to send finding %s to Jira Server: %s",
                check_id,
                _format_issue_creation_error(response),
            )
            return False

        return True
