# Prowler (Sirion Internal Fork) — Claude Code Context

## What This Is

Internal fork of [Prowler open-source](https://github.com/prowler-cloud/prowler) (Apache 2.0).
We run it as a self-hosted security scanning platform on AWS EC2.
This fork removes cloud-only UI gates, adds Sirion-specific features, and will add IBM Cloud scanning.

**Fork remotes:**
- `origin` → `https://github.com/anant9524/prowler.git` (personal fork, our working branch)
- `upstream` → `https://github.com/prowler-cloud/prowler.git` (sync new OSS releases from here)

---

## Stack

| Component | Tech | Notes |
|-----------|------|-------|
| UI | Next.js 16 (App Router, Turbopack) | `ui/` directory |
| API | Django REST + DRF | `api/` directory |
| Workers | Celery | Background scan jobs |
| DB | PostgreSQL | |
| Cache/Queue | Valkey (Redis-compatible) | |
| Graph DB | Neo4j | Attack Paths feature |
| MCP Server | Custom Python | `mcp-server/` |

All services run via Docker Compose.

---

## EC2 Deployment

- **EC2 is in a private subnet** — access via SSM Session Manager or bastion, not direct SSH
- Source on EC2: `/opt/prowler-src/` (git clone of this fork)
- Deployment dir: `/opt/prowler/` (docker-compose + env files)
- Env file: `/opt/prowler/.env`

**Build & deploy UI** (run on EC2 after `git pull`):
```bash
cd /opt/prowler-src
docker build -f ui/Dockerfile -t prowler-ui-custom:latest ./ui
cd /opt/prowler
docker compose up -d --force-recreate ui
```

**docker-compose.yml** uses `prowler-ui-custom:latest` (not the upstream image).

**Restart all services:**
```bash
cd /opt/prowler && docker compose up -d --force-recreate
```

**View UI logs:**
```bash
cd /opt/prowler && docker compose logs -f --tail=50 ui
```

---

## Git Workflow

Development happens locally (Mac), EC2 is build/run only.

```bash
# local: edit → commit → push
git add -A && git commit -m "..." && git push origin master

# EC2: pull → build → deploy
git pull origin master
docker build -f ui/Dockerfile -t prowler-ui-custom:latest ./ui
cd /opt/prowler && docker compose up -d --force-recreate ui
```

To sync upstream OSS updates:
```bash
git fetch upstream
git merge upstream/master
# resolve conflicts, then push
git push origin master
```

---

## Key Environment Variables (`/opt/prowler/.env`)

```
# UI
UI_CLOUD_ENABLED=            # leave UNSET — we use surgical patches instead

# Lighthouse AI (NVIDIA NIM)
LIGHTHOUSE_API_KEY=<nvidia-api-key>
LIGHTHOUSE_API_BASE_URL=https://integrate.api.nvidia.com/v1
LIGHTHOUSE_MODEL=meta/llama-3.1-8b-instruct   # or another free-tier NIM model
```

---

## Cloud UI Patches Applied

We surgically patch components to remove cloud-gating rather than setting `UI_CLOUD_ENABLED=true`
(which makes broken cloud features appear navigable).

### Files already patched:

| File | What changed |
|------|-------------|
| `ui/components/layout/app-sidebar/sidebar-navigation.tsx` | `CloudUpgradeChild` returns null — removes cloud badge nav items |
| `ui/components/shared/cloud-upgrade-modal.tsx` | Returns null always — suppresses upgrade modal |
| `ui/components/layout/app-sidebar/sidebar-footer.tsx` | Removed "Explore Prowler Cloud" button |
| `ui/components/layout/app-sidebar/app-sidebar-mode-toggle.tsx` | `isCloudUpsell=false`; Home button navigates to `/`; Chat navigates to `/lighthouse` |
| `ui/components/layout/app-sidebar/navigation-config.ts` | `getCloudFeature()` always returns LINK (not CLOUD_UPGRADE); CLI Import item removed |
| `ui/app/(prowler)/alerts/page.tsx` | Removed `if (!isCloud()) redirect("/")` |
| `ui/lib/schedules.ts` | `getScanScheduleCapability()` always returns `ADVANCED` |
| `ui/app/(prowler)/compliance/_components/compliance-page-tabs.tsx` | Multiple Scans tab removed; always renders per-scan view |
| `ui/app/(prowler)/lighthouse/settings/page.tsx` | Uses OSS components (`LLMProvidersTable` + `LighthouseSettings`); no cloud API calls; `ManagedLighthouseCallout` removed |
| `ui/components/findings/table/finding-triage-cells.tsx` | CLOUD_ONLY disabled reason removed; transparent overlay button removed |
| `ui/components/findings/table/finding-note-modal.tsx` | Cloud badge + `openCloudUpgrade` removed from Save button |

### Key pattern: `isCloud()` function
Lives in `ui/lib/shared/env.ts`. Reads `UI_CLOUD_ENABLED` env var.
**Do not set this to true** — it makes cloud-only pages appear available but they fail.
Instead, patch individual components to not call `openCloudUpgrade()` or redirect.

### Key components to know:
- `useCloudUpgradeStore` / `openCloudUpgrade()` — cloud upgrade modal trigger. Search for this to find cloud gates.
- `NAVIGATION_ITEM_KIND.CLOUD_UPGRADE` — nav items that open upgrade modal instead of navigating.
- `CLOUD_UPGRADE_FEATURE.*` — enum of cloud features that trigger the modal.
- `ManagedLighthouseCallout` — "Skip setup with Prowler Cloud" banner, now removed from settings.

---

## Known Remaining Issues (as of last session)

- **Triage**: API may not work in self-hosted even with UI gate removed (backend question)
- **Stop running scan**: No stop button exists in OSS UI — backend-only capability
- **Attack Paths**: Fully functional UI; requires completed scan with Neo4j graph data
- **Alerts**: Created from Findings page (not from Alerts page directly)

---

## Planned Work (Roadmap)

### Phase 1: UI Cleanup ✅ (mostly done)
Remove all cloud-gated UI elements.

### Phase 2: CI/CD
- Create ECR repo in AWS
- Create IAM user `github-actions-ecr` with ECR push permissions
- Add GitHub Actions workflow: push to `master` → build UI image → push to ECR
- EC2 manually pulls from ECR when needed (no auto-deploy)

### Phase 3: Branding
- Replace Prowler logo with Sirion/internal branding
- Update favicon, product name in UI
- Files: `ui/public/`, `ui/components/icons/`, page titles

### Phase 4: MCP Integration
- Prowler has a built-in MCP server (`mcp-server/` directory)
- Route it through ALB so Claude Desktop can connect
- Configure Claude Desktop MCP client

### Phase 5: Shodan Enrichment
- Post-scan: enrich findings with Shodan data for public IPs
- Add IP → Shodan lookup step in scan pipeline

### Phase 6: IBM Cloud via Powerpipe (interim)
- Use Powerpipe + Steampipe IBM Cloud plugin as interim scanner
- Feed results into Prowler findings format

### Phase 7: IBM Cloud Native Provider
- Build full native Prowler provider for IBM Cloud
- Follow existing provider structure in `prowler/providers/`

---

## Useful Commands

```bash
# Find cloud-gated UI elements
grep -r "openCloudUpgrade\|CLOUD_UPGRADE\|isCloud()\|CloudUpgrade\|variant=\"cloud\"" ui/components ui/app --include="*.tsx" -l

# Check which files have cloud references
grep -r "CLOUD_ONLY\|isCloud\|cloudEnabled" ui/lib ui/types --include="*.ts" -l

# Rebuild after changes
cd /opt/prowler-src && docker build -f ui/Dockerfile -t prowler-ui-custom:latest ./ui

# Check build logs
cd /opt/prowler && docker compose logs -f ui
```

---

## Notes

- License: Apache 2.0 — safe for internal use, forking, modification. No trademark issues for internal deployment.
- Upstream updates: merge from `upstream/master` periodically. Our patches may conflict — resolve manually.
- The UI Dockerfile does a full `pnpm build` — build takes ~4 minutes.
- `docker compose restart ui` does NOT re-read env files. Always use `docker compose up -d --force-recreate ui`.
