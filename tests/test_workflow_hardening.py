import json
from pathlib import Path

import yaml
from packaging.requirements import Requirement
from packaging.version import Version


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"


def text(name):
    return (WORKFLOWS / name).read_text(encoding="utf-8")


def workflow(name):
    return yaml.load(text(name), Loader=yaml.BaseLoader)


def test_obsolete_mutating_deploy_workflows_are_removed():
    for name in ("direct_pages_redeploy.yml", "force_current_pages.yml", "rebuild_pages_now.yml", "full_validation_status.yml"):
        assert not (WORKFLOWS / name).exists()
    assert not (ROOT / "data" / "daily_scans" / "full_validation_status.json").exists()


def test_daily_workflow_has_explicit_inputs_no_schedule_and_no_bot_push():
    daily = workflow("daily_screening_git_storage.yml")
    triggers = daily["on"]
    assert "schedule" not in triggers
    for trigger in ("workflow_dispatch", "workflow_call"):
        inputs = triggers[trigger]["inputs"]
        assert {"force_full_refresh", "allow_prior_session_backfill", "publish_snapshot", "deploy_pages"} <= set(inputs)
    source = text("daily_screening_git_storage.yml")
    assert "git commit" not in source
    assert "git push" not in source
    assert "validated-scan-snapshot" in source
    assert "retention-days: 90" in source
    assert "--min-chart-coverage 98" in source


def test_feature_branch_cannot_publish_or_deploy_pages():
    daily = text("daily_screening_git_storage.yml")
    frontend = text("frontend_pages.yml")
    reusable = text("pages_deploy.yml")
    assert "inputs.publish_snapshot && github.ref == 'refs/heads/main'" in daily
    assert "inputs.deploy_pages && github.ref == 'refs/heads/main'" in daily
    assert "github.ref == 'refs/heads/main'" in frontend
    assert "if: ${{ github.ref == 'refs/heads/main' }}" in reusable


def test_frontend_build_requires_snapshot_and_never_hydrates_yahoo():
    source = text("frontend_pages.yml")
    assert "No successful, non-expired validated-scan-snapshot" in source
    assert "validate_snapshot_artifact.py" in source
    assert "hydrate_frontend_charts" not in source
    assert "yfinance" not in source


def test_all_pages_deploys_use_one_reusable_job_and_concurrency_group():
    deploy_owners = []
    for path in WORKFLOWS.glob("*.yml"):
        if "actions/deploy-pages@" in path.read_text(encoding="utf-8"):
            deploy_owners.append(path.name)
    assert deploy_owners == ["pages_deploy.yml"]
    reusable = text("pages_deploy.yml")
    assert "group: stockscout-pages-deploy" in reusable
    assert "validate_snapshot_artifact.py" in reusable
    assert "smoke_pages_deploy.py" in reusable


def test_full_validation_uses_explicit_backfill_and_commit_status():
    source = text("stockscout_full_validation.yml")
    assert "allow_prior_session_backfill" in source
    assert 'context="stockscout/full-validation"' in source
    assert "statuses: write" in source
    assert "git commit" not in source
    assert "git push" not in source


def test_python_ci_installs_are_hash_locked():
    for path in WORKFLOWS.glob("*.yml"):
        for line in path.read_text(encoding="utf-8").splitlines():
            if "pip install" in line:
                assert "--require-hashes -r requirements-ci.lock" in line, f"Unlocked install in {path.name}: {line}"
    lock = (ROOT / "requirements-ci.lock").read_text(encoding="utf-8")
    pins = {}
    for line in lock.splitlines():
        if "==" in line and not line.startswith((" ", "#")):
            name, remainder = line.split("==", 1)
            pins[name.lower()] = remainder.split()[0]
    assert pins
    assert "--hash=sha256:" in lock
    for line in (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        requirement = Requirement(line)
        assert requirement.name.lower() in pins
        assert Version(pins[requirement.name.lower()]) in requirement.specifier


def test_each_job_declares_scoped_token_permissions():
    for path in WORKFLOWS.glob("*.yml"):
        parsed = workflow(path.name)
        assert parsed.get("permissions") == {}, f"{path.name} must default to no token permissions"
        for job_name, job in parsed["jobs"].items():
            assert job.get("permissions"), f"{path.name}:{job_name} has implicit token permissions"


def test_dependabot_and_main_ruleset_contracts():
    dependabot = yaml.safe_load((ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8"))
    ecosystems = {entry["package-ecosystem"] for entry in dependabot["updates"]}
    assert ecosystems == {"github-actions", "npm", "pip"}
    ruleset = json.loads((ROOT / ".github" / "rulesets" / "main.json").read_text(encoding="utf-8"))
    assert ruleset["enforcement"] == "active"
    rules = {rule["type"]: rule for rule in ruleset["rules"]}
    assert {"deletion", "non_fast_forward", "pull_request", "required_status_checks"} <= set(rules)
    pull_request = rules["pull_request"]["parameters"]
    assert pull_request["required_approving_review_count"] == 0
    assert pull_request["required_review_thread_resolution"] is True
    contexts = {check["context"] for check in rules["required_status_checks"]["parameters"]["required_status_checks"]}
    assert contexts == {"Frontend validation", "StockScout validation"}
