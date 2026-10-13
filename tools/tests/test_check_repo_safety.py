import subprocess
from pathlib import Path

from check_repo_safety import violations


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def make_repo(tmp_path: Path) -> Path:
    git(tmp_path, "init", "-q")
    return tmp_path


def track(repo: Path, rel: str, content: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    git(repo, "add", "-f", rel)


def test_clean_repo_has_no_violations(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "app/src/main.ts", "console.log(1)")
    track(repo, "README.md", "# Readme\n\nNo tests here.\n")
    assert violations(repo) == []


def test_bank_and_results_files_are_violations(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "bank.json", "{}")
    track(repo, "some/dir/results-20261014-2100.json", "{}")
    found = violations(repo)
    assert len(found) == 2
    assert all("bank/results" in v for v in found)


def test_markdown_with_test_section_is_a_violation(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "notes/SYN-T4-001.md", "# x\n\n## TEST\n\n**1.** q\n")
    track(repo, "notes/key.md", "# x\n\n## CLAVE\n\nABCD\n")
    assert len(violations(repo)) == 2


def test_fixtures_and_docs_are_allowed(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "tools/tests/fixtures/SYN-T9-001.md", "## TEST\n")
    track(repo, "docs/superpowers/plans/plan.md", "## CLAVE\n")
    assert violations(repo) == []


def test_heading_mentioned_inline_is_not_a_violation(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "README.md", "The `## TEST` section is parsed.\n")
    assert violations(repo) == []


def test_workbooks_keys_and_screenshots_are_violations(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "Teoria_Maestro_v1.xlsx", "x")
    track(repo, "vault/20-REGISTRO/claves/SYN-T4-001.txt", "CADBB")
    track(repo, "shots/3-runner.png", "x")
    found = violations(repo)
    assert len(found) == 3


def test_app_icons_are_allowed(tmp_path):
    repo = make_repo(tmp_path)
    track(repo, "app/public/icon-192.png", "x")
    assert violations(repo) == []


def test_this_repository_is_clean():
    assert violations(Path(__file__).resolve().parents[2]) == []
