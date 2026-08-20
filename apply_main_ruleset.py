#!/usr/bin/env python3
"""Apply the checked-in main ruleset only after workflow hardening is merged."""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

RULESET = Path(__file__).parent / ".github" / "rulesets" / "main.json"


def api(path: str, token: str, method: str = "GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        f"https://api.github.com{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "stockscout-ruleset-rollout/1",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise SystemExit(f"GitHub API {exc.code}: {exc.read().decode('utf-8', errors='replace')}") from exc


def repository_file(repository: str, path: str, branch: str, token: str) -> str:
    payload = api(f"/repos/{repository}/contents/{path}?ref={branch}", token)
    return base64.b64decode(payload["content"]).decode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", default="Garrincha077/StockScreener-next")
    parser.add_argument("--apply", action="store_true", help="Create/update the active repository ruleset")
    args = parser.parse_args()
    ruleset = json.loads(RULESET.read_text(encoding="utf-8"))
    if not args.apply:
        print(json.dumps(ruleset, indent=2))
        print("Dry run only. Re-run with --apply after PR 2 is merged to main.")
        return

    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        raise SystemExit("GH_TOKEN or GITHUB_TOKEN is required for --apply")
    repository = api(f"/repos/{args.repository}", token)
    branch = repository["default_branch"]
    daily = repository_file(args.repository, ".github/workflows/daily_screening_git_storage.yml", branch, token)
    deploy = repository_file(args.repository, ".github/workflows/pages_deploy.yml", branch, token)
    if "publish_snapshot" not in daily or "git push" in daily or "stockscout-pages-deploy" not in deploy:
        raise SystemExit("Refusing ruleset activation: hardened workflows are not present on the default branch")

    existing = api(f"/repos/{args.repository}/rulesets", token)
    match = next((item for item in existing if item.get("name") == ruleset["name"]), None)
    if match:
        result = api(f"/repos/{args.repository}/rulesets/{match['id']}", token, "PUT", ruleset)
        action = "updated"
    else:
        result = api(f"/repos/{args.repository}/rulesets", token, "POST", ruleset)
        action = "created"
    print(f"Ruleset {action}: {result.get('html_url') or result.get('id')}")


if __name__ == "__main__":
    main()
