import api.db_utils
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0097_attack_paths_scan_db_defaults"),
    ]

    operations = [
        migrations.AlterField(
            model_name="integration",
            name="integration_type",
            field=api.db_utils.IntegrationTypeEnumField(
                choices=[
                    ("amazon_s3", "Amazon S3"),
                    ("aws_security_hub", "AWS Security Hub"),
                    ("jira", "JIRA"),
                    ("jira_server", "Jira Server"),
                    ("slack", "Slack"),
                ],
            ),
        ),
        migrations.RunSQL(
            "ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'jira_server';",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
