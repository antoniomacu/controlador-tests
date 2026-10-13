"""Fail if personal data or question content is tracked by git.

The repository is public (GitHub Pages on the free plan requires it), so it must only ever
contain application code. This check is run locally and in CI. It flags:

* any tracked ``bank*.json`` or ``results*.json`` file;
* any Excel workbook, archived answer key (``claves/*.txt``) or image outside ``app/public/``
  (screenshots can show question content); and
* any tracked Markdown file with a line that is exactly ``## TEST`` or ``## CLAVE`` — the
  headings of a synthetic test — outside the allowed fixture and documentation folders.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

FORBIDDEN_NAME = re.compile(r"(^|/)(bank|results)[^/]*\.json$")
FORBIDDEN_OTHER = (
    (re.compile(r"\.(xlsx|xlsm|xls)$"), "Excel workbook (study registry)"),
    (re.compile(r"(^|/)claves/[^/]*\.txt$"), "archived answer key"),
    (re.compile(r"\.(png|jpe?g|webp|gif)$"), "image outside app/public (may show questions)"),
)
IMAGE_PREFIX_ALLOWED = "app/public/"
FORBIDDEN_HEADING = re.compile(r"^## (TEST|CLAVE)\s*$", re.MULTILINE)
ALLOWED_PREFIXES = ("tools/tests/fixtures/", "docs/superpowers/")


def tracked_files(repo: Path) -> list[str]:
    """Return the paths git tracks in ``repo``, relative to its root."""
    result = subprocess.run(
        ["git", "ls-files"], cwd=repo, capture_output=True, text=True, check=True
    )
    return [line for line in result.stdout.splitlines() if line]


def violations(repo: Path) -> list[str]:
    """Return one human-readable message per forbidden tracked file."""
    found: list[str] = []
    for rel in tracked_files(repo):
        if rel.startswith(ALLOWED_PREFIXES):
            continue
        if FORBIDDEN_NAME.search(rel):
            found.append(f"{rel}: bank/results file must never be committed")
            continue
        other = next((label for rx, label in FORBIDDEN_OTHER if rx.search(rel)), None)
        if other and not (other.startswith("image") and rel.startswith(IMAGE_PREFIX_ALLOWED)):
            found.append(f"{rel}: {other} must never be committed")
            continue
        if rel.endswith(".md"):
            path = repo / rel
            text = path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""
            if FORBIDDEN_HEADING.search(text):
                found.append(f"{rel}: contains a test (## TEST or ## CLAVE heading)")
    return found


def main(argv: list[str] | None = None) -> int:
    top = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
    ).stdout.strip()
    found = violations(Path(top))
    for message in found:
        print(f"FORBIDDEN: {message}", file=sys.stderr)
    if not found:
        print("Repository safety check passed.")
    return 1 if found else 0


if __name__ == "__main__":
    raise SystemExit(main())
