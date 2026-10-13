# controlador-tests v1 Implementation Plan

This plan turns the approved design spec into nineteen test-driven tasks: first the Mac-side Python
tools that build the question bank and register results, then the phone app's pure logic, then its
storage, sync and screens, then a visual design pass and the deployment to GitHub Pages. Every task
ends with a deliverable that can be tested on its own.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline iPhone PWA for timed practice tests whose results flow, via AirDrop and a
Python importer, into the existing ficha → `registrar.py` → Excel pipeline unchanged.

**Architecture:** Two halves. On the Mac, `tools/` (Python, uv) parses `SYN-*.md` into `bank.json`
and turns the app's `results.json` into fichas that `registrar.py` registers. On the phone, `app/`
(Preact + TypeScript, Vite, `vite-plugin-pwa`) stores the bank and attempts in IndexedDB; all exam
logic lives in pure `domain/` modules that take time and randomness as inputs.

**Tech Stack:** Python 3.12+, uv, pytest, Ruff, openpyxl · TypeScript, Preact, Vite,
vite-plugin-pwa, idb, marked, DOMPurify, Vitest, @testing-library/preact, jsdom, fake-indexeddb ·
GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-13-controlador-tests-design.md`

## Table of Contents

- [Global Constraints](#global-constraints)
- [Review Focus](#review-focus)
- [File Map](#file-map)
- [Task 1: Python tools project and repository safety check](#task-1-python-tools-project-and-repository-safety-check)
- [Task 2: Parser — sections, front matter, title and questions](#task-2-parser--sections-front-matter-title-and-questions)
- [Task 3: Parser — answer keys and label groups](#task-3-parser--answer-keys-and-label-groups)
- [Task 4: Parser — reasoned solutions](#task-4-parser--reasoned-solutions)
- [Task 5: build_bank.py — assembly, cross-checks and CLI](#task-5-build_bankpy--assembly-cross-checks-and-cli)
- [Task 6: ficha.py — building and rendering fichas](#task-6-fichapy--building-and-rendering-fichas)
- [Task 7: import_results.py — ledger, registrar and CLI](#task-7-import_resultspy--ledger-registrar-and-cli)
- [Task 8: App scaffold, domain types and scoring](#task-8-app-scaffold-domain-types-and-scoring)
- [Task 9: Sampler](#task-9-sampler)
- [Task 10: Timer](#task-10-timer)
- [Task 11: Attempts](#task-11-attempts)
- [Task 12: Bank validation](#task-12-bank-validation)
- [Task 13: Storage and sync](#task-13-storage-and-sync)
- [Task 14: Runner screen](#task-14-runner-screen)
- [Task 15: Results and review screen](#task-15-results-and-review-screen)
- [Task 16: Home and Setup screens](#task-16-home-and-setup-screens)
- [Task 17: App shell, entry point and integration test](#task-17-app-shell-entry-point-and-integration-test)
- [Task 18: Visual design pass](#task-18-visual-design-pass)
- [Task 19: CI, README, deployment and v1 acceptance](#task-19-ci-readme-deployment-and-v1-acceptance)

## Global Constraints

- Repository root: `~/Documents/controlador/Primer Examen/controlador-tests/`. All paths below are relative to it unless absolute.
- Generated and personal files live **outside** the repo in `~/Documents/controlador/Primer Examen/app-sync/` (`bank.json`, `results/`, `imported.json`).
- Never commit `bank*.json`, `results*.json`, or any `.md` with a `## TEST` / `## CLAVE` heading outside `tools/tests/fixtures/` and `docs/superpowers/`.
- `registrar.py` (`~/Documents/TheMind/ATC/teoria/99-SCRIPTS/registrar.py`), the ficha format and `Teoria_Maestro_v1.xlsx` are **not modified**. No test ever opens the real workbook; tests use a temporary copy.
- Python: uv for everything (never `pip install`), Ruff for lint and format, pytest; Python ≥ 3.12.
- TDD is mandatory for `tools/` and for `app/src/domain`, `app/src/storage`, `app/src/sync`.
- Exam scoring: +1 correct, −0.33 wrong, 0 blank; net rounded to 2 decimals.
- Default limit: 1 minute per question. Exam mode: hard stop. Practice mode: soft limit with pause.
- Ficha field `modo` only takes `Bloque` or `Mixto`; exam/practice goes in `observaciones`. Unknown ficha fields are rejected by `registrar.py`.
- Ficha `id`: `test_id` for attempt 1, `test_id-i<N>` for attempt N ≥ 2 (registrar forces `intento=9` for synthetics and rejects duplicate id+intento).
- Random test ID format: `RND-T<sorted chapter digits>-YYYYMMDD-HHMMSS` (local time).
- Closed causes vocabulary, verbatim: `No conocía el dato`, `Confundí dos conceptos`, `Lo recordaba mal`, `Mala lectura del enunciado`, `Dudé entre dos opciones`, `Sin tiempo`, `Otro`.
- All app UI text in Spanish.
- App base path: `/controlador-tests/` (GitHub Pages project site).
- GitHub: personal account on **github.com only**, never the employer's GitHub Enterprise server. Every `gh` command for this project runs with `GH_HOST=github.com`.
- Git: the user's PostToolUse hook may create wip commits. At the end of each task, **propose** the conventional commit message shown in the task's last step for the user's approval; never `git push`, never `git reset`/`rebase`/`clean` without explicit confirmation.
- Any `.md` written must follow the user's documentation skill (`~/.claude/skills/documentation/SKILL.md`): title, summary, linked TOC, full prose.
- UI tasks (14–18) must invoke the `ui-ux-pro-max` skill before starting, per the user's global rule.

## Review Focus

1. **The app is killed mid-test right after an answer** (phone call, crash) — the answer must already be in IndexedDB and the test must resume on the same question. Pinned in Task 17 (`App.integration.test.tsx`, "persists every action and resumes").
2. **An Exam-mode test whose time ran out while the app was closed** — on reopening it must be finished at exactly the limit, not resumed and not counted beyond it. Pinned in Task 11 (`autoFinishIfExpired`) and Task 17 (startup path).
3. **The user picks the wrong file when importing a bank** (e.g. a `results.json`, or a non-JSON file) — a specific Spanish message, old bank untouched. Pinned in Task 12 and Task 13.
4. **Export tapped with no finished attempts, or the share sheet dismissed** — nothing is marked as exported. Pinned in Task 13 (`buildResultsFile` returns `null`; `deliverFile` returns `cancelled`) and Task 17.
5. **`registrar.py` fails halfway through an import** (Excel open, duplicate row) — the failing attempt is not added to the ledger, its ficha is restored to its prior state, earlier successes stay recorded. Pinned in Task 7.

## File Map

| File | Responsibility |
|---|---|
| `.gitignore` | Keeps generated, personal and build files out of git |
| `tools/pyproject.toml` | uv project for the Mac tools; pytest and Ruff config |
| `tools/check_repo_safety.py` | Fails if forbidden files are tracked |
| `tools/bank_parser.py` | Pure parsing of `SYN-*.md`, key files and label groups |
| `tools/build_bank.py` | Assembles and cross-checks the bank; CLI writing `bank.json` |
| `tools/ficha.py` | Builds ficha fields from an attempt; renders and merges ficha text |
| `tools/import_results.py` | Ledger, ficha writing, `registrar.py` invocation; CLI |
| `tools/tests/…` | pytest suites and fake fixtures |
| `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html` | App build configuration |
| `app/public/*.png` | App icons |
| `app/src/domain/types.ts` | Shared types |
| `app/src/domain/scoring.ts` | Score and pass check |
| `app/src/domain/sampler.ts` | Seeded random test assembly; random test IDs |
| `app/src/domain/timer.ts` | Wall-clock timer, hard stop, overtime, pause |
| `app/src/domain/attempts.ts` | Attempt lifecycle, numbering, export mapping, reminder |
| `app/src/domain/bank.ts` | Bank validation and change summary |
| `app/src/storage/db.ts` | IndexedDB access |
| `app/src/sync/importBank.ts`, `app/src/sync/exportResults.ts` | File in, share sheet out |
| `app/src/ui/*.tsx` | Screens and small components |
| `app/src/App.tsx`, `app/src/main.tsx`, `app/src/styles.css` | Shell, entry point, styles |
| `.github/workflows/deploy.yml` | Test, build and deploy to GitHub Pages |
| `README.md` | How to use and maintain the project |

---

### Task 1: Python tools project and repository safety check

**Files:**
- Create: `.gitignore`
- Create: `tools/pyproject.toml`
- Create: `tools/check_repo_safety.py`
- Test: `tools/tests/test_check_repo_safety.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `violations(repo: Path) -> list[str]`; `main(argv: list[str] | None = None) -> int`. CLI: `uv run python check_repo_safety.py` from `tools/` (exit 1 on violations).

- [ ] **Step 1: Create `.gitignore` and the uv project**

`.gitignore`:

```gitignore
# Build and tool output
node_modules/
app/dist/
app/dev-dist/
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
.DS_Store

# Personal data: never commit the bank or results
bank*.json
results*.json
```

`tools/pyproject.toml`:

```toml
[project]
name = "controlador-tools"
version = "0.1.0"
description = "Mac-side tools for controlador-tests: build bank.json and import results.json"
requires-python = ">=3.12"
dependencies = ["openpyxl>=3.1"]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.6"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

Run: `cd tools && uv sync`
Expected: creates `tools/.venv` and `tools/uv.lock`, no errors.

- [ ] **Step 2: Write the failing test**

`tools/tests/test_check_repo_safety.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tools && uv run pytest tests/test_check_repo_safety.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'check_repo_safety'`.

- [ ] **Step 4: Write the implementation**

`tools/check_repo_safety.py`:

```python
"""Fail if personal data or question content is tracked by git.

The repository is public (GitHub Pages on the free plan requires it), so it must only ever
contain application code. This check is run locally and in CI. It flags:

* any tracked ``bank*.json`` or ``results*.json`` file, and
* any tracked Markdown file with a line that is exactly ``## TEST`` or ``## CLAVE`` — the
  headings of a synthetic test — outside the allowed fixture and documentation folders.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

FORBIDDEN_NAME = re.compile(r"(^|/)(bank|results)[^/]*\.json$")
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
```

- [ ] **Step 5: Run tests, lint and the check itself**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check . && uv run python check_repo_safety.py`
Expected: 5 passed; Ruff clean; `Repository safety check passed.`

- [ ] **Step 6: Propose commit**

```
chore: add tools project, gitignore and repository safety check
```

---

### Task 2: Parser — sections, front matter, title and questions

**Files:**
- Create: `tools/bank_parser.py`
- Create: `tools/tests/fixtures/SYN-T9-001.md`
- Create: `tools/tests/fixtures/SYN-T8-001.md`
- Test: `tools/tests/test_bank_parser_questions.py`

**Interfaces:**
- Consumes: nothing.
- Produces (in `bank_parser`):
  - `class ParseError(ValueError)`
  - `@dataclass ParsedQuestion(number: int, stem: str, options: dict[str, str])`
  - `split_sections(text: str) -> dict[str, str]` — keys are uppercased `## ` headings.
  - `parse_front_matter(text: str) -> dict[str, str]`
  - `parse_title(text: str) -> str`
  - `parse_questions(section: str) -> list[ParsedQuestion]`

- [ ] **Step 1: Create the two fake fixtures**

These are invented content, never real questions. `tools/tests/fixtures/SYN-T9-001.md` (modern layout):

````markdown
---
id: SYN-T9-001
alcance: T9
preguntas: 2
tiempo: 2 min
aprobado_referencia: 1/2
---

# SYN-T9-001 — Tema 9: Prueba

Introducción del test de prueba.

---

## TEST

**1.** Pregunta uno de prueba,
con el enunciado en dos líneas:

a) Opción A1
b) Opción B1
c) Opción C1
d) Opción D1

**2.** Pregunta dos de prueba:

a) Opción A2
b) Opción B2
   que continúa
c) Opción C2
d) Opción D2

Nota final que no pertenece a ninguna opción.

---

## CLAVE

```
1-2   c a
```

---

## SOLUCIONES RAZONADAS

Introducción de las soluciones.

---

**1.** *Pregunta uno de prueba*

**Respuesta: c) Opción C1** · [T9, pág. 3] · N1

Explicación de la uno.

*Por qué no las demás:* porque no.

**Gancho:** recuerda
la C.

---

**2.** *Pregunta dos de prueba*

**Respuesta: a) Opción A2** · [T9, págs. 4–5] · N3

Explicación de la dos.
````

`tools/tests/fixtures/SYN-T8-001.md` (legacy layout, no front matter):

````markdown
# SYN-T8-001 — Tema 8: Legado

## TEST

**1.** Legado uno:

a) L1a
b) L1b
c) L1c
d) L1d

**2.** Legado dos:

a) L2a
b) L2b
c) L2c
d) L2d

## CLAVE

```
BD
```

## SOLUCIONES RAZONADAS

Cada solución lleva la cita exacta.

---

**1. b) L1b** · [T8, pág. 1] · N2

Explicación legado uno.

---

**2. d) L2d** · [T8, pág. 2] · N1

Explicación legado dos.

**Gancho:** gancho legado.

## Cómo registrarlo

Texto que no es una solución.
````

- [ ] **Step 2: Write the failing tests**

`tools/tests/test_bank_parser_questions.py`:

```python
from pathlib import Path

import pytest

from bank_parser import (
    ParseError,
    parse_front_matter,
    parse_questions,
    parse_title,
    split_sections,
)

FIX = Path(__file__).parent / "fixtures"
MODERN = (FIX / "SYN-T9-001.md").read_text(encoding="utf-8")
LEGACY = (FIX / "SYN-T8-001.md").read_text(encoding="utf-8")


def test_split_sections_uppercases_headings_and_ignores_preamble():
    sections = split_sections(LEGACY)
    assert list(sections) == ["TEST", "CLAVE", "SOLUCIONES RAZONADAS", "CÓMO REGISTRARLO"]
    assert "**1.** Legado uno:" in sections["TEST"]


def test_front_matter_parsed_and_absent():
    front = parse_front_matter(MODERN)
    assert front["alcance"] == "T9"
    assert front["tiempo"] == "2 min"
    assert front["aprobado_referencia"] == "1/2"
    assert parse_front_matter(LEGACY) == {}


def test_front_matter_strips_quotes():
    assert parse_front_matter('---\nfuente: "a.pdf"\n---\n') == {"fuente": "a.pdf"}


def test_title_after_dash_or_whole_heading():
    assert parse_title(MODERN) == "Tema 9: Prueba"
    assert parse_title("# Solo título\n") == "Solo título"
    assert parse_title("sin título\n") == ""


def test_questions_multiline_stem_and_option_continuation():
    questions = parse_questions(split_sections(MODERN)["TEST"])
    assert [q.number for q in questions] == [1, 2]
    assert questions[0].stem == "Pregunta uno de prueba, con el enunciado en dos líneas:"
    assert questions[0].options == {
        "a": "Opción A1",
        "b": "Opción B1",
        "c": "Opción C1",
        "d": "Opción D1",
    }
    assert questions[1].options["b"] == "Opción B2 que continúa"
    assert questions[1].options["d"] == "Opción D2"  # trailing note ignored


def test_question_missing_an_option_is_an_error():
    section = "**1.** Q\n\na) x\nb) y\nc) z\n"
    with pytest.raises(ParseError, match="question 1 has options abc"):
        parse_questions(section)


def test_non_consecutive_numbers_are_an_error():
    section = "**1.** Q\na) 1\nb) 2\nc) 3\nd) 4\n\n**3.** R\na) 1\nb) 2\nc) 3\nd) 4\n"
    with pytest.raises(ParseError, match="not numbered 1..n"):
        parse_questions(section)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_bank_parser_questions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bank_parser'`.

- [ ] **Step 4: Write the implementation**

`tools/bank_parser.py`:

```python
"""Parse synthetic test Markdown files (``SYN-*.md``) into plain data structures.

A synthetic test has three sections: ``## TEST`` (questions), ``## CLAVE`` (answer key) and
``## SOLUCIONES RAZONADAS`` (one block per question with answer, page citation, level,
explanation and an optional "Gancho" memory hook). Two historical layouts exist for the key and
for the solutions; both are supported. This module only parses — consistency checks across
sections live in ``build_bank.py``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

LETTERS = ("a", "b", "c", "d")

QUESTION_RE = re.compile(r"^\*\*(\d+)\.\*\*\s*(.*)$")
OPTION_RE = re.compile(r"^([a-d])\)\s*(.*)$")


class ParseError(ValueError):
    """Raised when a synthetic test file cannot be parsed."""


@dataclass
class ParsedQuestion:
    number: int
    stem: str
    options: dict[str, str]


def split_sections(text: str) -> dict[str, str]:
    """Split a document on ``## `` headings; keys are the uppercased heading text."""
    sections: dict[str, str] = {}
    name: str | None = None
    buffer: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if name is not None:
                sections[name] = "\n".join(buffer)
            name, buffer = line[3:].strip().upper(), []
        elif name is not None:
            buffer.append(line)
    if name is not None:
        sections[name] = "\n".join(buffer)
    return sections


def parse_front_matter(text: str) -> dict[str, str]:
    """Return the ``key: value`` pairs of a leading ``---`` block, or ``{}`` if there is none."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    front: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" in line:
            key, value = line.split(":", 1)
            front[key.strip()] = value.strip().strip('"')
    return front


def parse_title(text: str) -> str:
    """Return the part of the first ``# `` heading after the em dash, or the whole heading."""
    for line in text.splitlines():
        if line.startswith("# "):
            heading = line[2:].strip()
            return heading.split(" — ", 1)[1].strip() if " — " in heading else heading
    return ""


def parse_questions(section: str) -> list[ParsedQuestion]:
    """Parse the ``## TEST`` section.

    A question starts with ``**N.** stem``. Lines before the first option extend the stem. An
    option is ``a) text``; a non-blank line directly after an option (no blank line between)
    continues that option. Text separated from the options by a blank line is ignored.
    """
    questions: list[ParsedQuestion] = []
    current: ParsedQuestion | None = None
    last_option: str | None = None
    previous_blank = True
    for raw in section.splitlines():
        line = raw.strip()
        if not line or line == "---":
            previous_blank = True
            continue
        match = QUESTION_RE.match(line)
        if match:
            current = ParsedQuestion(int(match.group(1)), match.group(2).strip(), {})
            questions.append(current)
            last_option, previous_blank = None, False
            continue
        if current is None:
            continue
        match = OPTION_RE.match(line)
        if match:
            last_option = match.group(1)
            current.options[last_option] = match.group(2).strip()
        elif last_option is None:
            current.stem = f"{current.stem} {line}".strip()
        elif not previous_blank:
            current.options[last_option] = f"{current.options[last_option]} {line}"
        previous_blank = False

    for index, question in enumerate(questions, start=1):
        if question.number != index:
            raise ParseError(f"questions are not numbered 1..n (found {question.number})")
        if tuple(sorted(question.options)) != LETTERS:
            found = "".join(sorted(question.options))
            raise ParseError(f"question {question.number} has options {found}, expected abcd")
    return questions
```

- [ ] **Step 5: Run tests and lint**

Run: `cd tools && uv run pytest tests/test_bank_parser_questions.py -v && uv run ruff format . && uv run ruff check .`
Expected: 7 passed; Ruff clean.

- [ ] **Step 6: Propose commit**

```
feat(tools): parse sections, front matter and questions of synthetic tests
```

---

### Task 3: Parser — answer keys and label groups

**Files:**
- Modify: `tools/bank_parser.py` (append functions)
- Test: `tools/tests/test_bank_parser_keys.py`

**Interfaces:**
- Consumes: `split_sections` from Task 2.
- Produces:
  - `parse_key(section: str) -> list[str]` — lowercase letters, in order.
  - `parse_key_file(text: str) -> list[str]` — same, from `claves/*.txt`.
  - `parse_groups(value: str) -> dict[int, str]` — `"1,3: x; 4-5: y"` → `{1: "x", 3: "x", 4: "y", 5: "y"}`.

- [ ] **Step 1: Write the failing tests**

`tools/tests/test_bank_parser_keys.py`:

```python
from pathlib import Path

import pytest

from bank_parser import ParseError, parse_groups, parse_key, parse_key_file, split_sections

FIX = Path(__file__).parent / "fixtures"


def test_numbered_lowercase_layout():
    section = "```\n1-10   c a b d c   b c b d b\n11-12  a d\n```\n"
    assert parse_key(section) == list("cabdcbcbdbad")


def test_grouped_uppercase_layout():
    section = "\n```\nBCACB DDDCA\n```\n"
    assert parse_key(section) == list("bcacbdddca")


def test_fixture_keys():
    modern = split_sections((FIX / "SYN-T9-001.md").read_text(encoding="utf-8"))
    legacy = split_sections((FIX / "SYN-T8-001.md").read_text(encoding="utf-8"))
    assert parse_key(modern["CLAVE"]) == ["c", "a"]
    assert parse_key(legacy["CLAVE"]) == ["b", "d"]


def test_only_fenced_lines_are_read_when_a_fence_exists():
    section = "Texto con una a y una B fuera.\n```\nCA\n```\n"
    assert parse_key(section) == ["c", "a"]


def test_empty_key_is_an_error():
    with pytest.raises(ParseError, match="empty answer key"):
        parse_key("```\n```\n")


def test_key_file():
    assert parse_key_file("CABDC BCBDB\n") == list("cabdcbcbdb")


def test_groups_with_commas_ranges_and_spaces():
    value = "1: t1-a; 3,4: t1-b; 6-7: t2-c"
    assert parse_groups(value) == {1: "t1-a", 3: "t1-b", 4: "t1-b", 6: "t2-c", 7: "t2-c"}


def test_groups_empty_and_malformed():
    assert parse_groups("") == {}
    with pytest.raises(ParseError, match="missing ':'"):
        parse_groups("1 t1-a")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_bank_parser_keys.py -v`
Expected: FAIL with `ImportError: cannot import name 'parse_groups'`.

- [ ] **Step 3: Write the implementation** (append to `tools/bank_parser.py`)

```python
KEY_RANGE_PREFIX = re.compile(r"^\s*\d+\s*-\s*\d+")
KEY_LETTER = re.compile(r"[A-Da-d]")


def _key_letters(lines: list[str]) -> list[str]:
    letters: list[str] = []
    for line in lines:
        letters.extend(ch.lower() for ch in KEY_LETTER.findall(KEY_RANGE_PREFIX.sub("", line)))
    return letters


def parse_key(section: str) -> list[str]:
    """Parse a ``## CLAVE`` section in either layout.

    Layout 1 (``SYN-T1-001``): grouped uppercase letters, ``BCACB DDDCA``.
    Layout 2 (later tests): numbered rows of lowercase letters, ``1-10   c a b d c   b c b d b``.
    If the section has a code fence, only the lines inside it are read.
    """
    lines = section.splitlines()
    fences = [i for i, line in enumerate(lines) if line.strip().startswith("```")]
    if len(fences) >= 2:
        lines = lines[fences[0] + 1 : fences[1]]
    letters = _key_letters(lines)
    if not letters:
        raise ParseError("empty answer key")
    return letters


def parse_key_file(text: str) -> list[str]:
    """Parse an archived key file from ``20-REGISTRO/claves/`` (``CABDC BCBDB ...``)."""
    return _key_letters(text.splitlines())


def parse_groups(value: str) -> dict[int, str]:
    """Parse the ficha group syntax ``"1,3: label; 4-6: other"`` into ``{number: label}``."""
    mapping: dict[int, str] = {}
    for group in value.split(";"):
        group = group.strip()
        if not group:
            continue
        if ":" not in group:
            raise ParseError(f"group missing ':': {group!r}")
        numbers, label = group.split(":", 1)
        for chunk in numbers.replace(" ", "").split(","):
            if not chunk:
                continue
            if "-" in chunk:
                start, end = (int(part) for part in chunk.split("-"))
                for number in range(start, end + 1):
                    mapping[number] = label.strip()
            else:
                mapping[int(chunk)] = label.strip()
    return mapping
```

- [ ] **Step 4: Run tests and lint**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all passed; Ruff clean.

- [ ] **Step 5: Propose commit**

```
feat(tools): parse answer keys in both layouts and ficha label groups
```

---

### Task 4: Parser — reasoned solutions

**Files:**
- Modify: `tools/bank_parser.py` (append)
- Test: `tools/tests/test_bank_parser_solutions.py`

**Interfaces:**
- Consumes: `split_sections`, `ParseError` from Task 2.
- Produces:
  - `@dataclass ParsedSolution(number: int, answer: str, cite: str, level: str, explanation: str, hook: str | None)`
  - `parse_solutions(section: str) -> dict[int, ParsedSolution]`

- [ ] **Step 1: Write the failing tests**

`tools/tests/test_bank_parser_solutions.py`:

```python
from pathlib import Path

import pytest

from bank_parser import ParseError, parse_solutions, split_sections

FIX = Path(__file__).parent / "fixtures"


def solutions_of(name: str):
    text = (FIX / name).read_text(encoding="utf-8")
    return parse_solutions(split_sections(text)["SOLUCIONES RAZONADAS"])


def test_modern_layout():
    sols = solutions_of("SYN-T9-001.md")
    assert sorted(sols) == [1, 2]
    one = sols[1]
    assert (one.answer, one.cite, one.level) == ("c", "T9, pág. 3", "N1")
    assert one.explanation == "Explicación de la uno.\n\n*Por qué no las demás:* porque no."
    assert one.hook == "recuerda la C."
    two = sols[2]
    assert (two.answer, two.cite, two.level, two.hook) == ("a", "T9, págs. 4–5", "N3", None)


def test_legacy_layout_and_trailing_section_ignored():
    sols = solutions_of("SYN-T8-001.md")
    assert sorted(sols) == [1, 2]
    assert (sols[1].answer, sols[1].cite, sols[1].level) == ("b", "T8, pág. 1", "N2")
    assert sols[1].explanation == "Explicación legado uno."
    assert sols[2].hook == "gancho legado."


def test_duplicate_solution_number_is_an_error():
    block = "**1. a) x** · [T1, pág. 1] · N1\n\nTexto.\n"
    with pytest.raises(ParseError, match="solution 1 appears twice"):
        parse_solutions(f"{block}\n---\n\n{block}")


def test_modern_block_without_question_number_is_an_error():
    with pytest.raises(ParseError, match="no question number"):
        parse_solutions("**Respuesta: a) x** · [T1, pág. 1] · N1\n\nTexto.\n")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_bank_parser_solutions.py -v`
Expected: FAIL with `ImportError: cannot import name 'parse_solutions'`.

- [ ] **Step 3: Write the implementation** (append to `tools/bank_parser.py`)

```python
MODERN_ANSWER_RE = re.compile(
    r"^\*\*Respuesta:\s*([a-d])\)\s*(.*?)\*\*\s*·\s*\[([^\]]+)\]\s*·\s*(N[123])"
)
LEGACY_ANSWER_RE = re.compile(
    r"^\*\*(\d+)\.\s*([a-d])\)\s*(.*?)\*\*\s*·\s*\[([^\]]+)\]\s*·\s*(N[123])"
)
HOOK_RE = re.compile(r"^\*\*Gancho:\*\*\s*(.*)$", re.DOTALL)


@dataclass
class ParsedSolution:
    number: int
    answer: str
    cite: str
    level: str
    explanation: str
    hook: str | None


def _split_body(lines: list[str]) -> tuple[str, str | None]:
    paragraphs = [p.strip() for p in "\n".join(lines).split("\n\n") if p.strip()]
    hook: str | None = None
    explanation: list[str] = []
    for paragraph in paragraphs:
        match = HOOK_RE.match(paragraph)
        if match:
            hook = " ".join(match.group(1).split())
        else:
            explanation.append(paragraph)
    return "\n\n".join(explanation), hook


def parse_solutions(section: str) -> dict[int, ParsedSolution]:
    """Parse ``## SOLUCIONES RAZONADAS`` blocks separated by ``---`` lines.

    Modern layout: ``**N.** *stem*`` then ``**Respuesta: c) text** · [T4, pág. 6] · N1``.
    Legacy layout (``SYN-T1-001``): ``**1. b) 1944** · [T1, pág. 5] · N1``.
    The lines after the answer line form the explanation; a paragraph starting with
    ``**Gancho:**`` becomes the hook. Blocks without an answer line are skipped.
    """
    solutions: dict[int, ParsedSolution] = {}
    for block in re.split(r"^---\s*$", section, flags=re.MULTILINE):
        lines = block.strip().splitlines()
        number: int | None = None
        found: tuple[str, str, str] | None = None
        body_start = 0
        for index, raw in enumerate(lines):
            line = raw.strip()
            legacy = LEGACY_ANSWER_RE.match(line)
            if legacy:
                number = int(legacy.group(1))
                found = (legacy.group(2), legacy.group(4), legacy.group(5))
                body_start = index + 1
                break
            modern = MODERN_ANSWER_RE.match(line)
            if modern:
                found = (modern.group(1), modern.group(3), modern.group(4))
                body_start = index + 1
                for previous in lines[:index]:
                    head = QUESTION_RE.match(previous.strip())
                    if head:
                        number = int(head.group(1))
                break
        if found is None:
            continue
        if number is None:
            raise ParseError(f"solution block has no question number: {lines[0]!r}")
        if number in solutions:
            raise ParseError(f"solution {number} appears twice")
        explanation, hook = _split_body(lines[body_start:])
        answer, cite, level = found
        solutions[number] = ParsedSolution(number, answer, cite.strip(), level, explanation, hook)
    return solutions
```

- [ ] **Step 4: Run tests and lint**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all passed; Ruff clean.

- [ ] **Step 5: Propose commit**

```
feat(tools): parse reasoned solutions in modern and legacy layouts
```

---

### Task 5: build_bank.py — assembly, cross-checks and CLI

**Files:**
- Create: `tools/build_bank.py`
- Create: `tools/tests/fixtures/claves/SYN-T9-001.txt` (content: `CA`)
- Create: `tools/tests/fixtures/claves/SYN-T8-001.txt` (content: `BD`)
- Create: `tools/tests/fixtures/fichas/SYN-T9-001.md`
- Test: `tools/tests/test_build_bank.py`

**Interfaces:**
- Consumes: everything in `bank_parser`.
- Produces:
  - `temas_of_scope(scope: str) -> list[int]`
  - `build_test(test_id: str, text: str, key_file: list[str], subtipos: dict[int, str]) -> tuple[dict, list[dict]]` — `(test, questions)` in the `bank.json` shapes of spec §5.1.
  - `build_bank(sinteticos: Path, claves: Path, fichas: Path, built: str) -> dict`
  - `main(argv: list[str] | None = None) -> int`. CLI flags: `--sinteticos`, `--claves`, `--fichas`, `--out` (defaults to the real paths).

- [ ] **Step 1: Create the fixtures**

`tools/tests/fixtures/claves/SYN-T9-001.txt` → `CA` · `tools/tests/fixtures/claves/SYN-T8-001.txt` → `BD`

`tools/tests/fixtures/fichas/SYN-T9-001.md`:

```markdown
---
id:            SYN-T9-001
subtipos:      1: t9-uno; 2: t9-dos
---

# SYN-T9-001 — ficha de registro
```

- [ ] **Step 2: Write the failing tests**

`tools/tests/test_build_bank.py`:

```python
import json
from pathlib import Path

import pytest

from bank_parser import ParseError
from build_bank import build_bank, build_test, main, temas_of_scope

FIX = Path(__file__).parent / "fixtures"
MODERN = (FIX / "SYN-T9-001.md").read_text(encoding="utf-8")
LEGACY = (FIX / "SYN-T8-001.md").read_text(encoding="utf-8")
REAL_SYN = Path("~/Documents/controlador/Primer Examen/Temario/Tests/SINTETICOS").expanduser()
REAL_VAULT = Path("~/Documents/TheMind/ATC/teoria/20-REGISTRO").expanduser()


def test_temas_of_scope():
    assert temas_of_scope("T4") == [4]
    assert temas_of_scope("T12") == [1, 2]
    assert temas_of_scope("T78") == [7, 8]
    assert temas_of_scope("FULL") == list(range(1, 10))


def test_build_modern_test():
    test, questions = build_test("SYN-T9-001", MODERN, ["c", "a"], {1: "t9-uno", 2: "t9-dos"})
    assert test == {
        "id": "SYN-T9-001",
        "subject": "temario",
        "scope": "T9",
        "title": "Tema 9: Prueba",
        "questions": ["SYN-T9-001#1", "SYN-T9-001#2"],
        "limit_min": 2,
        "pass_ref": 1,
        "synthetic": True,
    }
    first = questions[0]
    assert first["id"] == "SYN-T9-001#1"
    assert first["tema"] == 9
    assert first["answer"] == "c"
    assert first["level"] == "N1"
    assert first["subtipo"] == "t9-uno"
    assert first["cite"] == "T9, pág. 3"
    assert first["hook"] == "recuerda la C."
    assert first["options"]["a"] == "Opción A1"


def test_legacy_test_uses_defaults_without_front_matter():
    test, questions = build_test("SYN-T8-001", LEGACY, ["b", "d"], {})
    assert (test["scope"], test["limit_min"], test["pass_ref"]) == ("T8", 2, 1)
    assert questions[1]["subtipo"] is None
    assert questions[1]["tema"] == 8


def test_key_file_mismatch_aborts():
    with pytest.raises(ParseError, match="SYN-T9-001: CLAVE section disagrees with claves file"):
        build_test("SYN-T9-001", MODERN, ["c", "b"], {})


def test_solution_answer_mismatch_aborts():
    broken = MODERN.replace("**Respuesta: a) Opción A2**", "**Respuesta: b) Opción B2**")
    with pytest.raises(ParseError, match="SYN-T9-001 question 2: solution says b, key says a"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_missing_solution_aborts():
    broken = MODERN.split("**2.** *Pregunta dos de prueba*")[0]
    with pytest.raises(ParseError, match="SYN-T9-001: solutions found for"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_declared_count_mismatch_aborts():
    broken = MODERN.replace("preguntas: 2", "preguntas: 20")
    with pytest.raises(ParseError, match="declares 20 questions but has 2"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_mixed_scope_takes_tema_from_subtipo_prefix():
    text = MODERN.replace("alcance: T9", "alcance: T19")
    _, questions = build_test("SYN-T19-001", text, ["c", "a"], {1: "t1-x", 2: "t9-y"})
    assert [q["tema"] for q in questions] == [1, 9]


def test_mixed_scope_without_subtipo_aborts():
    text = MODERN.replace("alcance: T9", "alcance: T19")
    with pytest.raises(ParseError, match="question 1: mixed scope T19 needs a subtipo"):
        build_test("SYN-T19-001", text, ["c", "a"], {})


def test_build_bank_and_cli(tmp_path):
    syn = tmp_path / "syn"
    syn.mkdir()
    for name in ("SYN-T9-001.md", "SYN-T8-001.md"):
        (syn / name).write_text((FIX / name).read_text(encoding="utf-8"), encoding="utf-8")
    bank = build_bank(syn, FIX / "claves", FIX / "fichas", "2026-10-13T18:00:00+02:00")
    assert bank["schema"] == 1
    assert [t["id"] for t in bank["tests"]] == ["SYN-T8-001", "SYN-T9-001"]
    assert len(bank["questions"]) == 4

    out = tmp_path / "out" / "bank.json"
    args = ["--sinteticos", str(syn), "--claves", str(FIX / "claves")]
    args += ["--fichas", str(FIX / "fichas"), "--out", str(out)]
    assert main(args) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["tests"][0]["id"] == "SYN-T8-001"


def test_cli_returns_1_and_writes_nothing_on_error(tmp_path, capsys):
    syn = tmp_path / "syn"
    syn.mkdir()
    (syn / "SYN-T9-001.md").write_text(MODERN, encoding="utf-8")
    claves = tmp_path / "claves"
    claves.mkdir()
    (claves / "SYN-T9-001.txt").write_text("DD", encoding="utf-8")
    out = tmp_path / "bank.json"
    args = ["--sinteticos", str(syn), "--claves", str(claves)]
    args += ["--fichas", str(tmp_path), "--out", str(out)]
    assert main(args) == 1
    assert "ERROR" in capsys.readouterr().err
    assert not out.exists()


def test_missing_key_file_aborts(tmp_path):
    syn = tmp_path / "syn"
    syn.mkdir()
    (syn / "SYN-T9-001.md").write_text(MODERN, encoding="utf-8")
    with pytest.raises(ParseError, match="SYN-T9-001: no key file"):
        build_bank(syn, tmp_path, tmp_path, "x")


@pytest.mark.skipif(not REAL_SYN.exists(), reason="real synthetic tests not on this machine")
def test_all_real_synthetic_tests_build():
    bank = build_bank(REAL_SYN, REAL_VAULT / "claves", REAL_VAULT / "fichas", "now")
    assert len(bank["tests"]) >= 9
    for question in bank["questions"]:
        assert question["explanation"], question["id"]
        assert question["cite"], question["id"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_build_bank.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'build_bank'`.

- [ ] **Step 4: Write the implementation**

`tools/build_bank.py`:

```python
"""Build ``bank.json`` for the controlador-tests app from the synthetic Temario tests.

Usage (from ``tools/``)::

    uv run python build_bank.py            # real paths, writes app-sync/bank.json
    uv run python build_bank.py --out /tmp/bank.json

Every test is cross-checked before anything is written: the ``## CLAVE`` section must match the
archived ``claves/[ID].txt``; every solution's letter must match the key; question, key and
solution counts must agree with each other and with the declared ``preguntas``. The first
inconsistency aborts the whole build, so a bank with a wrong key can never reach the phone.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from bank_parser import (
    ParseError,
    parse_front_matter,
    parse_groups,
    parse_key,
    parse_key_file,
    parse_questions,
    parse_solutions,
    parse_title,
    split_sections,
)

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
VAULT = Path("~/Documents/TheMind/ATC/teoria/20-REGISTRO").expanduser()
DEFAULT_SINTETICOS = ROOT / "Temario/Tests/SINTETICOS"
DEFAULT_CLAVES = VAULT / "claves"
DEFAULT_FICHAS = VAULT / "fichas"
DEFAULT_OUT = ROOT / "app-sync/bank.json"

SCOPE_FROM_ID = re.compile(r"^SYN-(T\d+|FULL)-\d{3}$")
SUBTIPO_TEMA = re.compile(r"^t(\d)-")


def temas_of_scope(scope: str) -> list[int]:
    """``T4`` → ``[4]``, ``T12`` → ``[1, 2]``, ``FULL`` → ``[1..9]``."""
    if scope == "FULL":
        return list(range(1, 10))
    return [int(digit) for digit in scope[1:]]


def _leading_int(value: str | None) -> int | None:
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


def _required_section(sections: dict[str, str], name: str, test_id: str) -> str:
    if name not in sections:
        raise ParseError(f"{test_id}: missing section ## {name}")
    return sections[name]


def build_test(
    test_id: str, text: str, key_file: list[str], subtipos: dict[int, str]
) -> tuple[dict, list[dict]]:
    """Parse and cross-check one synthetic test; return ``(test, questions)`` bank entries."""
    front = parse_front_matter(text)
    sections = split_sections(text)
    try:
        questions = parse_questions(_required_section(sections, "TEST", test_id))
        key = parse_key(_required_section(sections, "CLAVE", test_id))
        solutions = parse_solutions(
            _required_section(sections, "SOLUCIONES RAZONADAS", test_id)
        )
    except ParseError as error:
        raise ParseError(f"{test_id}: {error}") from error

    n = len(questions)
    declared = _leading_int(front.get("preguntas"))
    if declared is not None and declared != n:
        raise ParseError(f"{test_id}: declares {declared} questions but has {n}")
    if len(key) != n:
        raise ParseError(f"{test_id}: key has {len(key)} letters for {n} questions")
    if key != key_file:
        raise ParseError(f"{test_id}: CLAVE section disagrees with claves file")
    if sorted(solutions) != list(range(1, n + 1)):
        raise ParseError(f"{test_id}: solutions found for {sorted(solutions)}, expected 1..{n}")

    scope_match = SCOPE_FROM_ID.match(test_id)
    scope = front.get("alcance") or (scope_match.group(1) if scope_match else "")
    if not scope:
        raise ParseError(f"{test_id}: cannot determine scope")
    temas = temas_of_scope(scope)

    entries: list[dict] = []
    for question in questions:
        solution = solutions[question.number]
        if solution.answer != key[question.number - 1]:
            raise ParseError(
                f"{test_id} question {question.number}: solution says {solution.answer}, "
                f"key says {key[question.number - 1]}"
            )
        subtipo = subtipos.get(question.number)
        if len(temas) == 1:
            tema = temas[0]
        else:
            prefix = SUBTIPO_TEMA.match(subtipo or "")
            if not prefix or int(prefix.group(1)) not in temas:
                raise ParseError(
                    f"{test_id} question {question.number}: mixed scope {scope} needs a "
                    f"subtipo prefixed with one of {temas}"
                )
            tema = int(prefix.group(1))
        entries.append(
            {
                "id": f"{test_id}#{question.number}",
                "subject": "temario",
                "tema": tema,
                "stem": question.stem,
                "options": question.options,
                "answer": solution.answer,
                "level": solution.level,
                "subtipo": subtipo,
                "cite": solution.cite,
                "explanation": solution.explanation,
                "hook": solution.hook,
            }
        )

    test = {
        "id": test_id,
        "subject": "temario",
        "scope": scope,
        "title": parse_title(text) or test_id,
        "questions": [entry["id"] for entry in entries],
        "limit_min": _leading_int(front.get("tiempo")) or n,
        "pass_ref": _leading_int(front.get("aprobado_referencia")) or n // 2,
        "synthetic": True,
    }
    return test, entries


def _subtipos_from_ficha(path: Path) -> dict[int, str]:
    if not path.exists():
        return {}
    value = parse_front_matter(path.read_text(encoding="utf-8")).get("subtipos", "")
    return parse_groups(value)


def build_bank(sinteticos: Path, claves: Path, fichas: Path, built: str) -> dict:
    """Build the whole bank from every ``SYN-*.md`` in ``sinteticos``."""
    tests: list[dict] = []
    questions: list[dict] = []
    for path in sorted(sinteticos.glob("SYN-*.md")):
        test_id = path.stem
        key_path = claves / f"{test_id}.txt"
        if not key_path.exists():
            raise ParseError(f"{test_id}: no key file at {key_path}")
        test, entries = build_test(
            test_id,
            path.read_text(encoding="utf-8"),
            parse_key_file(key_path.read_text(encoding="utf-8")),
            _subtipos_from_ficha(fichas / f"{test_id}.md"),
        )
        tests.append(test)
        questions.extend(entries)
    return {"schema": 1, "built": built, "questions": questions, "tests": tests}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build bank.json for controlador-tests.")
    parser.add_argument("--sinteticos", type=Path, default=DEFAULT_SINTETICOS)
    parser.add_argument("--claves", type=Path, default=DEFAULT_CLAVES)
    parser.add_argument("--fichas", type=Path, default=DEFAULT_FICHAS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    built = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        bank = build_bank(args.sinteticos, args.claves, args.fichas, built)
    except ParseError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    per_tema: dict[int, int] = {}
    for question in bank["questions"]:
        per_tema[question["tema"]] = per_tema.get(question["tema"], 0) + 1
    print(f"Wrote {args.out}: {len(bank['tests'])} tests, {len(bank['questions'])} questions.")
    for tema, count in sorted(per_tema.items()):
        print(f"  Tema {tema}: {count} questions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run tests and lint**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all passed (the real-file test runs on the user's Mac and must pass against all 9 real tests; if a real file uses a third layout, stop and report it — do not weaken the checks); Ruff clean.

- [ ] **Step 6: Build the real bank once**

Run: `cd tools && uv run python build_bank.py`
Expected: `Wrote …/app-sync/bank.json: 9 tests, 200 questions.` followed by per-chapter counts.

- [ ] **Step 7: Propose commit**

```
feat(tools): build cross-checked bank.json from synthetic tests
```

---

### Task 6: ficha.py — building and rendering fichas

**Files:**
- Create: `tools/ficha.py`
- Test: `tools/tests/test_ficha.py`

**Interfaces:**
- Consumes: `parse_front_matter`, `parse_groups` from `bank_parser`.
- Produces:
  - `class FichaError(ValueError)`
  - `CAUSES: tuple[str, ...]`
  - `mmss(secs: int) -> str`
  - `ficha_id(attempt: dict) -> str`
  - `temas_from_test_id(test_id: str) -> list[int]`
  - `build_fields(attempt: dict, subtipos_by_q: dict[str, str]) -> dict[str, str]`
  - `render(fields: dict[str, str], body: str) -> str`
  - `merge_prepared(prepared_text: str, fields: dict[str, str]) -> str`

`attempt` is one element of `results.json` → `attempts` (spec §5.2).

- [ ] **Step 1: Write the failing tests**

`tools/tests/test_ficha.py`:

```python
import pytest

from ficha import (
    FichaError,
    build_fields,
    ficha_id,
    merge_prepared,
    mmss,
    render,
    temas_from_test_id,
)


def item(n, key, ans, *, doubt=False, stuck=False, secs=30, at=None, cause=None):
    return {
        "q": f"SYN-T4-001#{n}",
        "key": key,
        "ans": ans,
        "doubt": doubt,
        "stuck": stuck,
        "secs": secs,
        "first_answered_at_secs": at,
        "cause": cause,
    }


def make_attempt(**overrides):
    items = [
        item(1, "c", "c", at=40),
        item(2, "a", "b", doubt=True, at=95, cause="Confundí dos conceptos"),
        item(3, "d", None, stuck=True),
        item(4, "b", "c", at=200, cause="Confundí dos conceptos"),
        item(5, "a", "a", doubt=True, at=230, cause="Dudé entre dos opciones"),
    ]
    attempt = {
        "uuid": "u-1",
        "test_id": "SYN-T4-001",
        "kind": "fixed",
        "mode": "exam",
        "attempt": 1,
        "started": "2026-10-14T20:30:00+02:00",
        "finished": "2026-10-14T20:47:12+02:00",
        "limit_min": 20,
        "total_secs": 1032,
        "status": "finished",
        "items": items,
    }
    attempt.update(overrides)
    return attempt


def test_mmss():
    assert mmss(0) == "00:00"
    assert mmss(1032) == "17:12"
    assert mmss(6000) == "100:00"


def test_ficha_id_suffix_for_repeats():
    assert ficha_id(make_attempt()) == "SYN-T4-001"
    assert ficha_id(make_attempt(attempt=3)) == "SYN-T4-001-i3"


def test_temas_from_test_id():
    assert temas_from_test_id("SYN-T4-003") == [4]
    assert temas_from_test_id("SYN-T12-001") == [1, 2]
    assert temas_from_test_id("RND-T349-20261014-203015") == [3, 4, 9]


def test_build_fields_matches_ficha_format():
    fields = build_fields(make_attempt(), {"SYN-T4-001#1": "t4-a", "SYN-T4-001#2": "t4-a"})
    assert fields == {
        "id": "SYN-T4-001",
        "categoria": "SYN",
        "dificultad": "SINTETICO",
        "modo": "Bloque",
        "intento": "1",
        "fecha": "2026-10-14",
        "preguntas": "5",
        "limite": "20",
        "tiempo": "17:12",
        "tramos": "",
        "corte": "50",
        "respuestas": "CB-CA",
        "clave": "CADBA",
        "dudas": "2, 5",
        "atascos": "3",
        "subtipos": "1,2: t4-a",
        "causas": "2,4: Confundí dos conceptos; 5: Dudé entre dos opciones",
        "sintetico": "si",
        "observaciones": "Modo examen (corte duro). Inicio 20:30, fin 20:47. Hecho en la app.",
    }


def test_tramos_every_tenth_answer_in_answer_order():
    items = [item(n, "a", "a", at=1000 - n * 10) for n in range(1, 26)]
    fields = build_fields(make_attempt(items=items), {})
    # answers at 750, 760, ... 990 s: the 10th is 840 s and the 20th is 940 s
    assert fields["tramos"] == "14:00, 15:40"


def test_random_mixed_practice_attempt():
    attempt = make_attempt(test_id="RND-T34-20261014-203015", kind="random", mode="practice")
    fields = build_fields(attempt, {})
    assert fields["modo"] == "Mixto"
    assert fields["observaciones"].startswith("Modo práctica (límite blando).")
    assert fields["subtipos"] == ""


def test_unknown_cause_is_rejected():
    attempt = make_attempt()
    attempt["items"][1]["cause"] = "Inventada"
    with pytest.raises(FichaError, match="unknown cause 'Inventada'"):
        build_fields(attempt, {})


def test_render_aligns_and_leaves_empty_fields_bare():
    text = render({"id": "X", "tramos": ""}, "\n# X\n")
    assert text == "---\nid:            X\ntramos:\n---\n\n# X\n"


PREPARED = """---
id:            SYN-T4-001
categoria:     SYN
dificultad:    SINTETICO
modo:          Bloque
intento:       1
fecha:
preguntas:     5
corte:         50

respuestas:
clave:         CADBA

subtipos:      1: t4-forma; 2-5: t4-otra
notas:
sintetico:     si
observaciones:
---

# SYN-T4-001 — ficha de registro

Cuerpo preparado.
"""


def test_merge_prepared_keeps_body_and_prepared_subtipos():
    merged = merge_prepared(PREPARED, build_fields(make_attempt(), {}))
    assert merged.endswith("\n# SYN-T4-001 — ficha de registro\n\nCuerpo preparado.\n")
    assert "subtipos:      1: t4-forma; 2-5: t4-otra\n" in merged
    assert "respuestas:    CB-CA\n" in merged
    assert "notas:\n" in merged
    assert merged.index("categoria:") < merged.index("respuestas:")


def test_merge_prepared_refuses_filled_ficha():
    filled = PREPARED.replace("respuestas:\n", "respuestas:    CCCCC\n")
    with pytest.raises(FichaError, match="already has respuestas"):
        merge_prepared(filled, build_fields(make_attempt(), {}))


def test_merge_prepared_refuses_key_mismatch():
    stale = PREPARED.replace("clave:         CADBA", "clave:         CADBB")
    with pytest.raises(FichaError, match="key in prepared ficha differs"):
        merge_prepared(stale, build_fields(make_attempt(), {}))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_ficha.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ficha'`.

- [ ] **Step 3: Write the implementation**

`tools/ficha.py`:

```python
"""Turn one app attempt into a ficha that ``registrar.py --intake`` accepts unchanged.

The field names and value formats follow ``Temario/GUIA-REGISTRO.md`` and the existing fichas
in ``20-REGISTRO/fichas/``. Only fields listed in ``registrar.py``'s ``CAMPOS_INTAKE`` are ever
written, because that script rejects any other field. Exam versus Practice mode goes into
``observaciones`` since ``modo`` only accepts ``Bloque`` or ``Mixto``.
"""

from __future__ import annotations

import re

from bank_parser import parse_front_matter, parse_key_file

CAUSES = (
    "No conocía el dato",
    "Confundí dos conceptos",
    "Lo recordaba mal",
    "Mala lectura del enunciado",
    "Dudé entre dos opciones",
    "Sin tiempo",
    "Otro",
)
FIELD_ORDER = (
    "id", "categoria", "dificultad", "modo", "intento", "fecha", "preguntas", "limite",
    "tiempo", "tramos", "corte", "respuestas", "clave", "dudas", "atascos", "subtipos",
    "causas", "sintetico", "observaciones",
)  # fmt: skip
PREPARED_WINS = ("subtipos", "corte")
TEMAS_IN_ID = re.compile(r"-T(\d+)-")


class FichaError(ValueError):
    """Raised when an attempt cannot be turned into a valid ficha."""


def mmss(secs: int) -> str:
    return f"{secs // 60:02d}:{secs % 60:02d}"


def ficha_id(attempt: dict) -> str:
    """First attempt keeps the test ID; later ones get ``-i<N>`` (registrar dedupes on id)."""
    number = attempt["attempt"]
    return attempt["test_id"] if number == 1 else f"{attempt['test_id']}-i{number}"


def temas_from_test_id(test_id: str) -> list[int]:
    match = TEMAS_IN_ID.search(test_id)
    return [int(digit) for digit in match.group(1)] if match else []


def _group_tens(letters: list[str]) -> str:
    return " ".join("".join(letters[i : i + 10]) for i in range(0, len(letters), 10))


def _compress(labels: dict[int, str]) -> str:
    """``{1: 'x', 2: 'x', 4: 'y'}`` → ``'1,2: x; 4: y'``, ordered by first question."""
    grouped: dict[str, list[int]] = {}
    for number in sorted(labels):
        grouped.setdefault(labels[number], []).append(number)
    return "; ".join(f"{','.join(map(str, nums))}: {label}" for label, nums in grouped.items())


def _tramos(items: list[dict]) -> str:
    times = sorted(
        i["first_answered_at_secs"] for i in items if i["first_answered_at_secs"] is not None
    )
    marks = [times[k] for k in (9, 19, 29, 39, 49) if k < len(times)]
    return ", ".join(mmss(t) for t in marks)


def build_fields(attempt: dict, subtipos_by_q: dict[str, str]) -> dict[str, str]:
    items = attempt["items"]
    causes: dict[int, str] = {}
    for number, entry in enumerate(items, start=1):
        cause = entry.get("cause")
        if cause is None:
            continue
        if cause not in CAUSES:
            raise FichaError(f"question {number}: unknown cause {cause!r}")
        causes[number] = cause
    subtipos = {
        n: subtipos_by_q[e["q"]] for n, e in enumerate(items, start=1) if e["q"] in subtipos_by_q
    }
    mode = (
        "Modo examen (corte duro)"
        if attempt["mode"] == "exam"
        else "Modo práctica (límite blando)"
    )
    start, end = attempt["started"][11:16], (attempt["finished"] or "")[11:16]
    return {
        "id": ficha_id(attempt),
        "categoria": "SYN",
        "dificultad": "SINTETICO",
        "modo": "Mixto" if len(temas_from_test_id(attempt["test_id"])) > 1 else "Bloque",
        "intento": str(attempt["attempt"]),
        "fecha": attempt["started"][:10],
        "preguntas": str(len(items)),
        "limite": f"{attempt['limit_min']:g}",
        "tiempo": mmss(attempt["total_secs"]),
        "tramos": _tramos(items),
        "corte": "50",
        "respuestas": _group_tens([(e["ans"] or "-").upper() for e in items]),
        "clave": _group_tens([e["key"].upper() for e in items]),
        "dudas": ", ".join(str(n) for n, e in enumerate(items, start=1) if e["doubt"]),
        "atascos": ", ".join(str(n) for n, e in enumerate(items, start=1) if e["stuck"]),
        "subtipos": _compress(subtipos),
        "causas": _compress(causes),
        "sintetico": "si",
        "observaciones": f"{mode}. Inicio {start}, fin {end}. Hecho en la app.",
    }


def _line(key: str, value: str) -> str:
    return f"{key + ':':<15}{value}" if value else f"{key}:"


def render(fields: dict[str, str], body: str) -> str:
    lines = ["---", *(_line(k, v) for k, v in fields.items()), "---"]
    return "\n".join(lines) + "\n" + body


def merge_prepared(prepared_text: str, fields: dict[str, str]) -> str:
    """Fill a ficha Claude prepared in advance, keeping its body and its subtipos."""
    prepared = parse_front_matter(prepared_text)
    if prepared.get("respuestas"):
        raise FichaError(f"{prepared.get('id', '?')} already has respuestas; not overwriting")
    if prepared.get("clave") and parse_key_file(prepared["clave"]) != parse_key_file(
        fields["clave"]
    ):
        raise FichaError("key in prepared ficha differs from the attempt's key (stale bank?)")

    merged: dict[str, str] = {}
    for key in [*prepared, *(k for k in fields if k not in prepared)]:
        if key in PREPARED_WINS and prepared.get(key):
            merged[key] = prepared[key]
        else:
            merged[key] = fields.get(key, prepared.get(key, ""))
    body = prepared_text.split("\n---\n", 1)[1] if "\n---\n" in prepared_text else ""
    return render(merged, body)
```

- [ ] **Step 4: Run tests and lint**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all passed; Ruff clean.

- [ ] **Step 5: Propose commit**

```
feat(tools): build and render registrar-compatible fichas from attempts
```

---

### Task 7: import_results.py — ledger, registrar and CLI

**Files:**
- Create: `tools/import_results.py`
- Test: `tools/tests/test_import_results.py`

**Interfaces:**
- Consumes: `ficha.build_fields`, `ficha.ficha_id`, `ficha.merge_prepared`, `ficha.render`, `ficha.FichaError`.
- Produces:
  - `class ResultsError(ValueError)`
  - `@dataclass Paths(fichas: Path, ledger: Path, archive: Path, bank: Path, registrar: Path, excel: Path | None)`
  - `load_results(path: Path) -> dict`
  - `find_results(downloads: Path) -> Path`
  - `pending(results: dict, ledger: set[str]) -> list[dict]`
  - `run_registrar(ficha: Path, registrar: Path, excel: Path | None) -> subprocess.CompletedProcess[str]`
  - `import_attempts(attempts: list[dict], paths: Paths, runner=run_registrar) -> list[str]` — returns registered ficha IDs; raises `ResultsError` on the first failure.
  - `main(argv: list[str] | None = None) -> int`. CLI flags: `--results`, `--yes`, `--excel`, plus path overrides.

- [ ] **Step 1: Write the failing tests**

`tools/tests/test_import_results.py`:

```python
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from import_results import (
    Paths,
    ResultsError,
    find_results,
    import_attempts,
    load_results,
    main,
    pending,
)

REAL_REGISTRAR = Path("~/Documents/TheMind/ATC/teoria/99-SCRIPTS/registrar.py").expanduser()
REAL_EXCEL = Path(
    "~/Documents/controlador/Primer Examen/Temario/Teoria_Maestro_v1.xlsx"
).expanduser()


def attempt(uuid="u1", test_id="SYN-T9-001", number=1, started="2026-10-14T20:30:00+02:00"):
    return {
        "uuid": uuid,
        "test_id": test_id,
        "kind": "fixed",
        "mode": "exam",
        "attempt": number,
        "started": started,
        "finished": "2026-10-14T20:32:00+02:00",
        "limit_min": 2,
        "total_secs": 100,
        "status": "finished",
        "items": [
            {"q": f"{test_id}#1", "key": "c", "ans": "c", "doubt": False, "stuck": False,
             "secs": 50, "first_answered_at_secs": 50, "cause": None},
            {"q": f"{test_id}#2", "key": "a", "ans": None, "doubt": True, "stuck": False,
             "secs": 50, "first_answered_at_secs": None, "cause": None},
        ],
    }  # fmt: skip


def make_paths(tmp_path: Path, registrar: Path | None = None) -> Paths:
    for name in ("fichas", "archive"):
        (tmp_path / name).mkdir(exist_ok=True)
    bank = tmp_path / "bank.json"
    bank.write_text(json.dumps({"schema": 1, "questions": [
        {"id": "SYN-T9-001#1", "subtipo": "t9-uno"}, {"id": "SYN-T9-001#2", "subtipo": None},
    ], "tests": []}), encoding="utf-8")  # fmt: skip
    return Paths(
        fichas=tmp_path / "fichas",
        ledger=tmp_path / "imported.json",
        archive=tmp_path / "archive",
        bank=bank,
        registrar=registrar or tmp_path / "unused.py",
        excel=None,
    )


def ok_runner(calls):
    def run(ficha, registrar, excel):
        calls.append(ficha.name)
        return subprocess.CompletedProcess([], 0, "ok", "")

    return run


def write_results(path: Path, attempts: list[dict]) -> Path:
    path.write_text(json.dumps({"schema": 1, "exported": "x", "attempts": attempts}))
    return path


def test_load_results_rejects_bank_and_bad_schema(tmp_path):
    bank_like = tmp_path / "x.json"
    bank_like.write_text(json.dumps({"schema": 1, "questions": [], "tests": []}))
    with pytest.raises(ResultsError, match="not a results file"):
        load_results(bank_like)
    future = write_results(tmp_path / "y.json", [])
    future.write_text(json.dumps({"schema": 2, "attempts": []}))
    with pytest.raises(ResultsError, match="unsupported schema 2"):
        load_results(future)


def test_find_results_picks_newest(tmp_path):
    old = write_results(tmp_path / "results-1.json", [])
    new = write_results(tmp_path / "results-2.json", [])
    (tmp_path / "other.json").write_text("{}")
    os.utime(old, (1, 1))
    assert find_results(tmp_path) == new
    with pytest.raises(FileNotFoundError):
        find_results(tmp_path / "missing")


def test_pending_skips_ledger_and_unfinished_and_sorts():
    a = attempt("a", started="2026-10-14T21:00:00+02:00")
    b = attempt("b", started="2026-10-14T20:00:00+02:00")
    c = attempt("c")
    c["status"] = "in_progress"
    results = {"attempts": [a, b, c]}
    assert [x["uuid"] for x in pending(results, {"zzz"})] == ["b", "a"]
    assert [x["uuid"] for x in pending(results, {"a", "b"})] == []


def test_import_creates_ficha_and_records_ledger(tmp_path):
    paths = make_paths(tmp_path)
    calls: list[str] = []
    registered = import_attempts([attempt()], paths, runner=ok_runner(calls))
    assert registered == ["SYN-T9-001"]
    assert calls == ["SYN-T9-001.md"]
    text = (paths.fichas / "SYN-T9-001.md").read_text(encoding="utf-8")
    assert "respuestas:    C-\n" in text
    assert "subtipos:      1: t9-uno\n" in text
    assert json.loads(paths.ledger.read_text()) == ["u1"]


def test_importing_twice_registers_nothing_the_second_time(tmp_path):
    paths = make_paths(tmp_path)
    results = tmp_path / "results-1.json"
    write_results(results, [attempt()])
    calls: list[str] = []
    args = ["--results", str(results), "--yes", "--fichas", str(paths.fichas)]
    args += ["--ledger", str(paths.ledger), "--archive", str(paths.archive)]
    args += ["--bank", str(paths.bank)]
    assert main(args, runner=ok_runner(calls)) == 0
    assert main(args, runner=ok_runner(calls)) == 0
    assert calls == ["SYN-T9-001.md"]
    assert len(list(paths.archive.iterdir())) == 1


def test_prepared_ficha_is_filled_in_place(tmp_path):
    paths = make_paths(tmp_path)
    prepared = paths.fichas / "SYN-T9-001.md"
    prepared.write_text(
        "---\nid:            SYN-T9-001\nrespuestas:\nclave:         CA\n"
        "subtipos:      1-2: t9-preparado\n---\n\nCuerpo.\n",
        encoding="utf-8",
    )
    import_attempts([attempt()], paths, runner=ok_runner([]))
    text = prepared.read_text(encoding="utf-8")
    assert "subtipos:      1-2: t9-preparado\n" in text
    assert text.endswith("\nCuerpo.\n")


def test_second_attempt_gets_suffixed_ficha(tmp_path):
    paths = make_paths(tmp_path)
    calls: list[str] = []
    import_attempts([attempt("u2", number=2)], paths, runner=ok_runner(calls))
    assert calls == ["SYN-T9-001-i2.md"]
    assert "id:            SYN-T9-001-i2\n" in (paths.fichas / "SYN-T9-001-i2.md").read_text()


def test_registrar_failure_restores_ficha_and_keeps_earlier_successes(tmp_path):
    paths = make_paths(tmp_path)
    prepared = paths.fichas / "SYN-T9-002.md"
    original = "---\nid:            SYN-T9-002\nrespuestas:\nclave:         CA\n---\n\nX\n"
    prepared.write_text(original, encoding="utf-8")

    def runner(ficha, registrar, excel):
        code = 1 if ficha.name == "SYN-T9-002.md" else 0
        return subprocess.CompletedProcess([], code, "", "Ya existe SYN-T9-002")

    first = attempt("ok")
    second = attempt("bad", test_id="SYN-T9-002", started="2026-10-14T22:00:00+02:00")
    with pytest.raises(ResultsError, match="SYN-T9-002.*Ya existe"):
        import_attempts([first, second], paths, runner=runner)
    assert json.loads(paths.ledger.read_text()) == ["ok"]
    assert prepared.read_text(encoding="utf-8") == original


def test_registrar_failure_removes_new_ficha(tmp_path):
    paths = make_paths(tmp_path)

    def runner(ficha, registrar, excel):
        return subprocess.CompletedProcess([], 1, "", "boom")

    with pytest.raises(ResultsError):
        import_attempts([attempt()], paths, runner=runner)
    assert not (paths.fichas / "SYN-T9-001.md").exists()
    assert not paths.ledger.exists()


def test_cli_declined_confirmation_registers_nothing(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    results = write_results(tmp_path / "results-1.json", [attempt()])
    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    calls: list[str] = []
    args = ["--results", str(results), "--fichas", str(paths.fichas)]
    args += ["--ledger", str(paths.ledger), "--archive", str(paths.archive)]
    args += ["--bank", str(paths.bank)]
    assert main(args, runner=ok_runner(calls)) == 0
    assert calls == []


@pytest.mark.skipif(
    not (REAL_REGISTRAR.exists() and REAL_EXCEL.exists()), reason="real registrar not here"
)
def test_round_trip_with_real_registrar_on_excel_copy(tmp_path):
    from openpyxl import load_workbook

    excel = tmp_path / "copy.xlsx"
    shutil.copy2(REAL_EXCEL, excel)
    paths = make_paths(tmp_path, registrar=REAL_REGISTRAR)
    paths.excel = excel
    test_id = "SYN-T9-901"  # an ID that never exists in the real workbook
    registered = import_attempts([attempt("rt", test_id=test_id)], paths)
    assert registered == [test_id]
    ids = [row[0].value for row in load_workbook(excel)["Nivel Test"].iter_rows(min_row=2)]
    assert test_id in ids
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tools && uv run pytest tests/test_import_results.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'import_results'`.

- [ ] **Step 3: Write the implementation**

`tools/import_results.py`:

```python
"""Register the attempts exported by the controlador-tests app.

Usage (from ``tools/``)::

    uv run python import_results.py                 # newest ~/Downloads/results*.json
    uv run python import_results.py --results path/to/results.json

For every finished attempt not yet in the ledger (``app-sync/imported.json``), oldest first:
write its ficha (filling a prepared one if it exists), run ``registrar.py --intake`` on it, and
only then record the attempt's uuid in the ledger. If registrar fails, the ficha is restored to
its previous state and the run stops; the next run retries from that attempt.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ficha import FichaError, build_fields, ficha_id, merge_prepared, render

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
VAULT = Path("~/Documents/TheMind/ATC/teoria").expanduser()
SYNC = ROOT / "app-sync"


class ResultsError(ValueError):
    """Raised for an unusable results file or a failed registration."""


@dataclass
class Paths:
    fichas: Path
    ledger: Path
    archive: Path
    bank: Path
    registrar: Path
    excel: Path | None


Runner = Callable[[Path, Path, Path | None], subprocess.CompletedProcess]


def load_results(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ResultsError(f"{path}: cannot read JSON ({error})") from error
    if not isinstance(data, dict) or "attempts" not in data:
        raise ResultsError(f"{path}: not a results file (no 'attempts')")
    if data.get("schema") != 1:
        raise ResultsError(f"{path}: unsupported schema {data.get('schema')}")
    return data


def find_results(downloads: Path) -> Path:
    candidates = sorted(downloads.glob("results*.json"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        raise FileNotFoundError(f"no results*.json in {downloads}")
    return candidates[-1]


def load_ledger(path: Path) -> set[str]:
    return set(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else set()


def save_ledger(path: Path, uuids: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(uuids), indent=1), encoding="utf-8")


def pending(results: dict, ledger: set[str]) -> list[dict]:
    todo = [
        a for a in results["attempts"] if a.get("status") == "finished" and a["uuid"] not in ledger
    ]
    return sorted(todo, key=lambda a: a["started"])


def subtipos_by_question(bank: Path) -> dict[str, str]:
    if not bank.exists():
        return {}
    data = json.loads(bank.read_text(encoding="utf-8"))
    return {q["id"]: q["subtipo"] for q in data.get("questions", []) if q.get("subtipo")}


def run_registrar(ficha: Path, registrar: Path, excel: Path | None) -> subprocess.CompletedProcess:
    command = [sys.executable, str(registrar), "--intake", str(ficha)]
    if excel is not None:
        command += ["--excel", str(excel)]
    return subprocess.run(command, capture_output=True, text=True)


def import_attempts(
    attempts: list[dict], paths: Paths, runner: Runner = run_registrar
) -> list[str]:
    ledger = load_ledger(paths.ledger)
    subtipos = subtipos_by_question(paths.bank)
    registered: list[str] = []
    for attempt in attempts:
        fid = ficha_id(attempt)
        target = paths.fichas / f"{fid}.md"
        previous = target.read_text(encoding="utf-8") if target.exists() else None
        fields = build_fields(attempt, subtipos)
        try:
            text = (
                merge_prepared(previous, fields)
                if previous is not None
                else render(fields, f"\n# {fid} — ficha de registro\n\nGenerada desde la app.\n")
            )
        except FichaError as error:
            raise ResultsError(f"{fid}: {error}") from error
        target.write_text(text, encoding="utf-8")

        result = runner(target, paths.registrar, paths.excel)
        if result.returncode != 0:
            if previous is None:
                target.unlink()
            else:
                target.write_text(previous, encoding="utf-8")
            detail = (result.stderr or result.stdout).strip()
            raise ResultsError(f"{fid}: registrar.py failed: {detail}")

        ledger.add(attempt["uuid"])
        save_ledger(paths.ledger, ledger)
        registered.append(fid)
    return registered


def _summary(attempt: dict) -> str:
    items = attempt["items"]
    correct = sum(1 for i in items if i["ans"] is not None and i["ans"] == i["key"])
    wrong = sum(1 for i in items if i["ans"] is not None and i["ans"] != i["key"])
    blank = len(items) - correct - wrong
    net = round(correct - 0.33 * wrong, 2)
    return (
        f"  {ficha_id(attempt)}: {correct}/{wrong}/{blank} · neta {net} · "
        f"{attempt['mode']} · {attempt['started'][:16].replace('T', ' ')}"
    )


def main(argv: list[str] | None = None, runner: Runner = run_registrar) -> int:
    parser = argparse.ArgumentParser(description="Register app results via registrar.py.")
    parser.add_argument("--results", type=Path, default=None)
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation")
    parser.add_argument("--fichas", type=Path, default=VAULT / "20-REGISTRO/fichas")
    parser.add_argument("--ledger", type=Path, default=SYNC / "imported.json")
    parser.add_argument("--archive", type=Path, default=SYNC / "results")
    parser.add_argument("--bank", type=Path, default=SYNC / "bank.json")
    parser.add_argument("--registrar", type=Path, default=VAULT / "99-SCRIPTS/registrar.py")
    parser.add_argument("--excel", type=Path, default=None)
    args = parser.parse_args(argv)

    try:
        source = args.results or find_results(Path("~/Downloads").expanduser())
        results = load_results(source)
    except (FileNotFoundError, ResultsError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    args.archive.mkdir(parents=True, exist_ok=True)
    archived = args.archive / source.name
    if not archived.exists():
        shutil.copy2(source, archived)

    todo = pending(results, load_ledger(args.ledger))
    if not todo:
        print(f"{source.name}: nothing new to register.")
        return 0
    print(f"{source.name}: {len(todo)} new attempt(s):")
    for attempt in todo:
        print(_summary(attempt))
    if not args.yes:
        answer = input(f"¿Registrar {len(todo)} ficha(s) en el Excel? [s/N] ").strip().lower()
        if answer not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado. No se ha registrado nada.")
            return 0

    paths = Paths(args.fichas, args.ledger, args.archive, args.bank, args.registrar, args.excel)
    try:
        registered = import_attempts(todo, paths, runner=runner)
    except ResultsError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Registered {len(registered)}: {', '.join(registered)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests and lint**

Run: `cd tools && uv run pytest -v && uv run ruff format . && uv run ruff check .`
Expected: all passed, including the real round trip on the user's Mac (it writes only to the temporary Excel copy); Ruff clean.

- [ ] **Step 5: Propose commit**

```
feat(tools): import app results into fichas and register them
```

---

### Task 8: App scaffold, domain types and scoring

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/tests/setup.ts`
- Create: `app/public/icon-192.png`, `app/public/icon-512.png`, `app/public/apple-touch-icon.png`
- Create: `app/src/domain/types.ts`, `app/src/domain/scoring.ts`
- Test: `app/tests/domain/scoring.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`types.ts`): `Letter`, `Subject`, `Level`, `Mode`, `Cause`, `CAUSES`, `Question`, `TestDef`, `Bank`, `Item`, `TimerState`, `Attempt`, `ExportItem`, `ExportAttempt`, `ResultsFile` exactly as below. (`scoring.ts`): `PENALTY`, `Score`, `score(items)`, `passes(s, passRef)`.

- [ ] **Step 1: Create the project files**

Before writing config, check current `vite-plugin-pwa` and Vitest docs via context7 (`/vite-pwa/vite-plugin-pwa`, `/vitest-dev/vitest`) for any API change to `VitePWA` options, `virtual:pwa-register/preact` and the `test` block.

`app/package.json`:

```json
{
  "name": "controlador-tests",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run:

```bash
cd app
npm install preact idb marked dompurify
npm install -D vite @preact/preset-vite typescript vite-plugin-pwa vitest jsdom @testing-library/preact fake-indexeddb
```

Expected: `package-lock.json` created, no errors.

`app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vite-plugin-pwa/preact", "vitest/globals"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`app/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/controlador-tests/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Controlador Tests',
        short_name: 'Tests',
        lang: 'es',
        start_url: '/controlador-tests/',
        scope: '/controlador-tests/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'] },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

`app/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Tests" />
    <meta name="theme-color" content="#0f172a" />
    <link rel="apple-touch-icon" href="apple-touch-icon.png" />
    <title>Controlador Tests</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/tests/setup.ts`:

```ts
import 'fake-indexeddb/auto';
```

Icons (one-off; the PNGs are committed, the script is not):

```bash
cd app && mkdir -p public && uv run --with pillow python - <<'EOF'
from PIL import Image, ImageDraw, ImageFont
for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
    img = Image.new("RGB", (size, size), "#0f172a")
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", int(size * 0.42))
    draw.text((size / 2, size / 2), "ATC", fill="#38bdf8", font=font, anchor="mm")
    img.save(f"public/{name}")
EOF
```

Expected: three PNGs in `app/public/`.

- [ ] **Step 2: Write the domain types**

`app/src/domain/types.ts`:

```ts
/** Shared types for the bank, attempts and the exported results file (spec §5). */

export type Letter = 'a' | 'b' | 'c' | 'd';
export const LETTERS: readonly Letter[] = ['a', 'b', 'c', 'd'];
export type Subject = 'temario' | 'ingles';
export const SUBJECTS: readonly Subject[] = ['temario', 'ingles'];
export type Level = 'N1' | 'N2' | 'N3';
export type Mode = 'exam' | 'practice';

export const CAUSES = [
  'No conocía el dato',
  'Confundí dos conceptos',
  'Lo recordaba mal',
  'Mala lectura del enunciado',
  'Dudé entre dos opciones',
  'Sin tiempo',
  'Otro',
] as const;
export type Cause = (typeof CAUSES)[number];

export interface Question {
  id: string;
  subject: Subject;
  tema: number;
  stem: string;
  options: Record<Letter, string>;
  answer: Letter;
  level: Level;
  subtipo?: string | null;
  cite?: string | null;
  explanation?: string | null;
  hook?: string | null;
}

export interface TestDef {
  id: string;
  subject: Subject;
  scope: string;
  title: string;
  questions: string[];
  limit_min: number;
  pass_ref: number;
  synthetic: boolean;
}

export interface Bank {
  schema: 1;
  built: string;
  questions: Question[];
  tests: TestDef[];
}

export interface Item {
  q: string;
  key: Letter;
  ans: Letter | null;
  doubt: boolean;
  stuck: boolean;
  secs: number;
  first_answered_at_secs: number | null;
  cause: Cause | null;
}

export interface TimerState {
  mode: Mode;
  limitSecs: number;
  startedAtMs: number;
  pausedTotalMs: number;
  pausedAtMs: number | null;
}

export interface Attempt {
  uuid: string;
  test_id: string;
  kind: 'fixed' | 'random';
  mode: Mode;
  attempt: number;
  started: string;
  finished: string | null;
  limit_min: number;
  total_secs: number;
  status: 'in_progress' | 'finished';
  items: Item[];
  // App-only fields, never exported:
  title: string;
  subject: Subject;
  pass_ref: number;
  questions: Question[];
  current: number;
  mark_secs: number;
  timer: TimerState;
  exported: boolean;
}

export type ExportItem = Item;
export type ExportAttempt = Pick<
  Attempt,
  | 'uuid' | 'test_id' | 'kind' | 'mode' | 'attempt' | 'started' | 'finished'
  | 'limit_min' | 'total_secs' | 'status'
> & { items: ExportItem[] };

export interface ResultsFile {
  schema: 1;
  exported: string;
  attempts: ExportAttempt[];
}
```

- [ ] **Step 3: Write the failing scoring test**

`app/tests/domain/scoring.test.ts`:

```ts
import { passes, score } from '../../src/domain/scoring';

const it_ = (key: 'a' | 'b', ans: 'a' | 'b' | null) => ({ key, ans });

describe('score', () => {
  it('counts correct, wrong and blank and applies -0.33', () => {
    const s = score([it_('a', 'a'), it_('a', 'b'), it_('b', null), it_('b', 'b')]);
    expect(s).toEqual({ correct: 2, wrong: 1, blank: 1, net: 1.67 });
  });

  it('handles all blank and all correct', () => {
    expect(score([it_('a', null), it_('b', null)]).net).toBe(0);
    expect(score([it_('a', 'a'), it_('b', 'b')]).net).toBe(2);
  });

  it('rounds the net score to two decimals', () => {
    const s = score([it_('a', 'b'), it_('a', 'b'), it_('a', 'b')]);
    expect(s.net).toBe(-0.99);
  });
});

describe('passes', () => {
  it('compares the net score with the pass reference', () => {
    expect(passes({ correct: 10, wrong: 0, blank: 10, net: 10 }, 10)).toBe(true);
    expect(passes({ correct: 10, wrong: 1, blank: 9, net: 9.67 }, 10)).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd app && npx vitest run tests/domain/scoring.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/scoring`.

- [ ] **Step 5: Write the implementation**

`app/src/domain/scoring.ts`:

```ts
import type { Item } from './types';

/** Points subtracted per wrong answer in the ENAIRE exam. */
export const PENALTY = 0.33;

export interface Score {
  correct: number;
  wrong: number;
  blank: number;
  net: number;
}

export function score(items: readonly Pick<Item, 'key' | 'ans'>[]): Score {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  for (const { key, ans } of items) {
    if (ans === null) blank += 1;
    else if (ans === key) correct += 1;
    else wrong += 1;
  }
  const net = Math.round((correct - PENALTY * wrong) * 100) / 100;
  return { correct, wrong, blank, net };
}

export function passes(s: Score, passRef: number): boolean {
  return s.net >= passRef;
}
```

- [ ] **Step 6: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: 4 passed; no type errors.

- [ ] **Step 7: Propose commit**

```
feat(app): scaffold Preact PWA with domain types and scoring
```

---

### Task 9: Sampler

**Files:**
- Create: `app/src/domain/sampler.ts`
- Test: `app/tests/domain/sampler.test.ts`

**Interfaces:**
- Consumes: `Question`, `Subject` from `types.ts`.
- Produces:
  - `mulberry32(seed: number): () => number`
  - `temasOf(questions: Question[], subject: Subject): number[]` — sorted distinct chapters.
  - `availableCount(questions: Question[], subject: Subject, temas: number[]): number`
  - `sampleQuestions(questions: Question[], opts: { subject: Subject; temas: number[]; count: number; seed: number }): Question[]`
  - `randomTestId(temas: number[], date: Date): string`

- [ ] **Step 1: Write the failing tests**

`app/tests/domain/sampler.test.ts`:

```ts
import {
  availableCount,
  randomTestId,
  sampleQuestions,
  temasOf,
} from '../../src/domain/sampler';
import type { Question } from '../../src/domain/types';

function q(id: string, tema: number, subject: 'temario' | 'ingles' = 'temario'): Question {
  return {
    id, subject, tema, stem: id, answer: 'a', level: 'N1',
    options: { a: '1', b: '2', c: '3', d: '4' },
  };
}

const pool = [
  ...Array.from({ length: 10 }, (_, i) => q(`T1#${i}`, 1)),
  ...Array.from({ length: 10 }, (_, i) => q(`T2#${i}`, 2)),
  ...Array.from({ length: 5 }, (_, i) => q(`T3#${i}`, 3)),
  q('ING#1', 1, 'ingles'),
];

describe('sampler', () => {
  it('lists chapters per subject', () => {
    expect(temasOf(pool, 'temario')).toEqual([1, 2, 3]);
    expect(temasOf(pool, 'ingles')).toEqual([1]);
  });

  it('counts available questions in the chosen chapters only', () => {
    expect(availableCount(pool, 'temario', [1, 3])).toBe(15);
    expect(availableCount(pool, 'temario', [])).toBe(0);
  });

  it('draws only from chosen chapters and subject, without duplicates', () => {
    const drawn = sampleQuestions(pool, { subject: 'temario', temas: [1, 3], count: 12, seed: 7 });
    expect(drawn).toHaveLength(12);
    expect(new Set(drawn.map((x) => x.id)).size).toBe(12);
    expect(drawn.every((x) => x.subject === 'temario' && [1, 3].includes(x.tema))).toBe(true);
  });

  it('caps the count at what is available', () => {
    expect(sampleQuestions(pool, { subject: 'temario', temas: [3], count: 50, seed: 1 })).toHaveLength(5);
  });

  it('is reproducible for a seed and differs across seeds', () => {
    const opts = { subject: 'temario' as const, temas: [1, 2], count: 10 };
    const a = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const b = sampleQuestions(pool, { ...opts, seed: 42 }).map((x) => x.id);
    const c = sampleQuestions(pool, { ...opts, seed: 43 }).map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('rejects a count below one', () => {
    expect(() => sampleQuestions(pool, { subject: 'temario', temas: [1], count: 0, seed: 1 })).toThrow(
      'count must be at least 1',
    );
  });

  it('builds random test IDs with sorted chapters and seconds', () => {
    const date = new Date(2026, 9, 14, 20, 30, 15);
    expect(randomTestId([4, 3, 3], date)).toBe('RND-T34-20261014-203015');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/domain/sampler.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/sampler`.

- [ ] **Step 3: Write the implementation**

`app/src/domain/sampler.ts`:

```ts
import type { Question, Subject } from './types';

/** Small, fast seeded PRNG so random tests are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(questions: readonly Question[], subject: Subject, temas: readonly number[]): Question[] {
  const wanted = new Set(temas);
  return questions.filter((x) => x.subject === subject && wanted.has(x.tema));
}

export function temasOf(questions: readonly Question[], subject: Subject): number[] {
  return [...new Set(questions.filter((x) => x.subject === subject).map((x) => x.tema))].sort(
    (a, b) => a - b,
  );
}

export function availableCount(
  questions: readonly Question[],
  subject: Subject,
  temas: readonly number[],
): number {
  return pick(questions, subject, temas).length;
}

export function sampleQuestions(
  questions: readonly Question[],
  opts: { subject: Subject; temas: readonly number[]; count: number; seed: number },
): Question[] {
  if (opts.count < 1) throw new Error('count must be at least 1');
  const candidates = pick(questions, opts.subject, opts.temas);
  const rand = mulberry32(opts.seed);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, Math.min(opts.count, candidates.length));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `RND-T34-20261014-203015`: chapters, then local date and time to the second. */
export function randomTestId(temas: readonly number[], date: Date): string {
  const digits = [...new Set(temas)].sort((a, b) => a - b).join('');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `RND-T${digits}-${day}-${time}`;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add seeded sampler for random practice tests
```

---

### Task 10: Timer

**Files:**
- Create: `app/src/domain/timer.ts`
- Test: `app/tests/domain/timer.test.ts`

**Interfaces:**
- Consumes: `Mode`, `TimerState`.
- Produces: `startTimer(mode, limitSecs, nowMs)`, `elapsedSecs(t, nowMs)`, `remainingSecs(t, nowMs)`, `isExpired(t, nowMs)`, `isOvertime(t, nowMs)`, `isPaused(t)`, `pause(t, nowMs)`, `resume(t, nowMs)`, `formatClock(secs)`. All pure; `TimerState` in, `TimerState`/number/boolean/string out.

- [ ] **Step 1: Write the failing tests**

`app/tests/domain/timer.test.ts`:

```ts
import {
  elapsedSecs,
  formatClock,
  isExpired,
  isOvertime,
  isPaused,
  pause,
  remainingSecs,
  resume,
  startTimer,
} from '../../src/domain/timer';

const T0 = 1_000_000;
const s = (n: number) => T0 + n * 1000;

describe('timer', () => {
  it('measures elapsed whole seconds from wall-clock time', () => {
    const t = startTimer('practice', 60, T0);
    expect(elapsedSecs(t, s(0))).toBe(0);
    expect(elapsedSecs(t, T0 + 59_999)).toBe(59);
    expect(remainingSecs(t, s(20))).toBe(40);
  });

  it('exam mode caps at the limit and expires there', () => {
    const t = startTimer('exam', 60, T0);
    expect(isExpired(t, s(59))).toBe(false);
    expect(isExpired(t, s(60))).toBe(true);
    expect(elapsedSecs(t, s(600))).toBe(60);
    expect(remainingSecs(t, s(600))).toBe(0);
  });

  it('keeps counting while the app is closed in exam mode', () => {
    const t = startTimer('exam', 600, T0);
    // app closed at 100 s, reopened at 400 s: nothing paused, 400 s elapsed
    expect(elapsedSecs(t, s(400))).toBe(400);
  });

  it('practice mode runs past the limit and reports overtime', () => {
    const t = startTimer('practice', 60, T0);
    expect(isExpired(t, s(90))).toBe(false);
    expect(isOvertime(t, s(60))).toBe(false);
    expect(isOvertime(t, s(61))).toBe(true);
    expect(remainingSecs(t, s(90))).toBe(-30);
  });

  it('practice pause stops the clock and resume continues it', () => {
    let t = startTimer('practice', 600, T0);
    t = pause(t, s(10));
    expect(isPaused(t)).toBe(true);
    expect(elapsedSecs(t, s(100))).toBe(10);
    t = resume(t, s(100));
    expect(isPaused(t)).toBe(false);
    expect(elapsedSecs(t, s(105))).toBe(15);
  });

  it('pause and resume are idempotent', () => {
    let t = startTimer('practice', 600, T0);
    t = pause(pause(t, s(10)), s(20));
    t = resume(resume(t, s(30)), s(40));
    expect(elapsedSecs(t, s(30))).toBe(10);
  });

  it('exam mode cannot be paused', () => {
    expect(() => pause(startTimer('exam', 60, T0), s(1))).toThrow('Exam mode cannot be paused');
  });

  it('formats the clock with an overtime sign', () => {
    expect(formatClock(605)).toBe('10:05');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-30)).toBe('+00:30');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/domain/timer.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/timer`.

- [ ] **Step 3: Write the implementation**

`app/src/domain/timer.ts`:

```ts
import type { Mode, TimerState } from './types';

/**
 * A timer computed from wall-clock timestamps, never from ticking. Closing the app therefore
 * cannot stop an exam clock: elapsed time is always "now minus start minus pauses".
 */
export function startTimer(mode: Mode, limitSecs: number, nowMs: number): TimerState {
  return { mode, limitSecs, startedAtMs: nowMs, pausedTotalMs: 0, pausedAtMs: null };
}

export function elapsedSecs(t: TimerState, nowMs: number): number {
  const pausedNow = t.pausedAtMs === null ? 0 : nowMs - t.pausedAtMs;
  const ms = nowMs - t.startedAtMs - t.pausedTotalMs - pausedNow;
  const secs = Math.max(0, Math.floor(ms / 1000));
  return t.mode === 'exam' ? Math.min(secs, t.limitSecs) : secs;
}

export function remainingSecs(t: TimerState, nowMs: number): number {
  return t.limitSecs - elapsedSecs(t, nowMs);
}

export function isExpired(t: TimerState, nowMs: number): boolean {
  return t.mode === 'exam' && elapsedSecs(t, nowMs) >= t.limitSecs;
}

export function isOvertime(t: TimerState, nowMs: number): boolean {
  return t.mode === 'practice' && elapsedSecs(t, nowMs) > t.limitSecs;
}

export function isPaused(t: TimerState): boolean {
  return t.pausedAtMs !== null;
}

export function pause(t: TimerState, nowMs: number): TimerState {
  if (t.mode === 'exam') throw new Error('Exam mode cannot be paused');
  return isPaused(t) ? t : { ...t, pausedAtMs: nowMs };
}

export function resume(t: TimerState, nowMs: number): TimerState {
  if (t.pausedAtMs === null) return t;
  return { ...t, pausedTotalMs: t.pausedTotalMs + (nowMs - t.pausedAtMs), pausedAtMs: null };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `mm:ss` of the absolute value; negative (overtime) values get a leading `+`. */
export function formatClock(secs: number): string {
  const abs = Math.abs(secs);
  const text = `${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return secs < 0 ? `+${text}` : text;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add wall-clock timer with exam hard stop and practice pause
```

---

### Task 11: Attempts

**Files:**
- Create: `app/src/domain/attempts.ts`
- Test: `app/tests/domain/attempts.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `timer.ts` (`startTimer`, `elapsedSecs`, `isExpired`, `pause`, `resume`).
- Produces:
  - `interface NewAttempt { uuid: string; testId: string; title: string; subject: Subject; kind: 'fixed' | 'random'; mode: Mode; questions: Question[]; limitMin: number; passRef: number; attemptNumber: number; nowMs: number }`
  - `createAttempt(i: NewAttempt): Attempt`
  - `nextAttemptNumber(attempts: Attempt[], testId: string): number`
  - `selectAnswer(a, letter: Letter, elapsed: number): Attempt` (tapping the chosen letter clears it)
  - `toggleDoubt(a): Attempt`, `toggleStuck(a): Attempt`
  - `goTo(a, index: number, elapsed: number): Attempt`
  - `pauseAttempt(a, nowMs): Attempt`, `resumeAttempt(a, nowMs): Attempt`
  - `finishAttempt(a, nowMs): Attempt`
  - `autoFinishIfExpired(a, nowMs): Attempt` (returns the same object when nothing changes)
  - `isWrong(item: Item): boolean`
  - `setCause(a, index: number, cause: Cause | null): Attempt`
  - `pendingExportCount(attempts): number`
  - `needsExportReminder(attempts, nowMs): boolean`
  - `toResultsFile(attempts, exportedIso: string): ResultsFile`
  - `markExported(attempts): Attempt[]`

- [ ] **Step 1: Write the failing tests**

`app/tests/domain/attempts.test.ts`:

```ts
import {
  autoFinishIfExpired,
  createAttempt,
  finishAttempt,
  goTo,
  markExported,
  needsExportReminder,
  nextAttemptNumber,
  pauseAttempt,
  pendingExportCount,
  resumeAttempt,
  selectAnswer,
  setCause,
  toResultsFile,
  toggleDoubt,
  toggleStuck,
  type NewAttempt,
} from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';

const T0 = Date.UTC(2026, 9, 14, 18, 30, 0);
const s = (n: number) => T0 + n * 1000;

function q(n: number, answer: 'a' | 'b' | 'c' | 'd'): Question {
  return {
    id: `SYN-T4-001#${n}`, subject: 'temario', tema: 4, stem: `Q${n}`, answer, level: 'N1',
    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
  };
}

function base(over: Partial<NewAttempt> = {}): NewAttempt {
  return {
    uuid: 'u1', testId: 'SYN-T4-001', title: 'Tema 4', subject: 'temario', kind: 'fixed',
    mode: 'exam', questions: [q(1, 'c'), q(2, 'a'), q(3, 'd')], limitMin: 3, passRef: 1,
    attemptNumber: 1, nowMs: T0, ...over,
  };
}

describe('attempts', () => {
  it('creates an attempt with keys captured and a snapshot of questions', () => {
    const a = createAttempt(base());
    expect(a.items.map((i) => i.key)).toEqual(['c', 'a', 'd']);
    expect(a.items.every((i) => i.ans === null && i.secs === 0)).toBe(true);
    expect(a.questions[0].stem).toBe('Q1');
    expect(a.status).toBe('in_progress');
    expect(a.started).toBe('2026-10-14T18:30:00.000Z');
    expect(a.timer.limitSecs).toBe(180);
  });

  it('numbers attempts per fixed test', () => {
    const a = createAttempt(base());
    const b = createAttempt(base({ uuid: 'u2', testId: 'SYN-T4-002' }));
    expect(nextAttemptNumber([a, b], 'SYN-T4-001')).toBe(2);
    expect(nextAttemptNumber([], 'SYN-T4-001')).toBe(1);
  });

  it('selects, changes and clears an answer, keeping the first answer time', () => {
    let a = createAttempt(base());
    a = selectAnswer(a, 'b', 10);
    expect(a.items[0]).toMatchObject({ ans: 'b', first_answered_at_secs: 10 });
    a = selectAnswer(a, 'c', 20);
    expect(a.items[0]).toMatchObject({ ans: 'c', first_answered_at_secs: 10 });
    a = selectAnswer(a, 'c', 30);
    expect(a.items[0].ans).toBeNull();
  });

  it('toggles doubt and stuck on the current question', () => {
    let a = toggleStuck(toggleDoubt(createAttempt(base())));
    expect(a.items[0]).toMatchObject({ doubt: true, stuck: true });
    a = toggleDoubt(a);
    expect(a.items[0].doubt).toBe(false);
  });

  it('charges time on screen to the question being left', () => {
    let a = createAttempt(base());
    a = goTo(a, 1, 25);
    a = goTo(a, 0, 40);
    a = goTo(a, 2, 50);
    expect(a.items.map((i) => i.secs)).toEqual([35, 15, 0]);
    expect(a.current).toBe(2);
    expect(() => goTo(a, 3, 60)).toThrow('index out of range');
  });

  it('finishes, charging the last question and recording total time', () => {
    let a = goTo(createAttempt(base()), 1, 30);
    a = finishAttempt(a, s(70));
    expect(a.status).toBe('finished');
    expect(a.total_secs).toBe(70);
    expect(a.items[1].secs).toBe(40);
    expect(a.finished).toBe('2026-10-14T18:31:10.000Z');
  });

  it('auto-finishes an expired exam at exactly the limit', () => {
    const a = createAttempt(base());
    expect(autoFinishIfExpired(a, s(100))).toBe(a);
    const done = autoFinishIfExpired(a, s(5000));
    expect(done.status).toBe('finished');
    expect(done.total_secs).toBe(180);
  });

  it('never auto-finishes practice mode', () => {
    const a = createAttempt(base({ mode: 'practice' }));
    expect(autoFinishIfExpired(a, s(5000))).toBe(a);
  });

  it('excludes paused time in practice mode', () => {
    let a = createAttempt(base({ mode: 'practice' }));
    a = pauseAttempt(a, s(10));
    a = resumeAttempt(a, s(110));
    a = finishAttempt(a, s(120));
    expect(a.total_secs).toBe(20);
    expect(a.items[0].secs).toBe(20);
  });

  it('allows causes only on wrong or doubted questions of a finished attempt', () => {
    let a = createAttempt(base());
    a = selectAnswer(a, 'b', 5); // wrong
    a = goTo(a, 1, 6);
    a = selectAnswer(a, 'a', 7); // right
    expect(() => setCause(a, 0, 'Otro')).toThrow('attempt not finished');
    a = finishAttempt(a, s(10));
    a = setCause(a, 0, 'Confundí dos conceptos');
    expect(a.items[0].cause).toBe('Confundí dos conceptos');
    expect(() => setCause(a, 1, 'Otro')).toThrow('cause only for wrong or doubted');
    expect(setCause(a, 0, null).items[0].cause).toBeNull();
  });

  it('exports only finished attempts without app-only fields', () => {
    const open = createAttempt(base({ uuid: 'open' }));
    const done = finishAttempt(createAttempt(base({ uuid: 'done' })), s(30));
    const file = toResultsFile([open, done], '2026-10-14T21:00:00Z');
    expect(file.schema).toBe(1);
    expect(file.attempts.map((x) => x.uuid)).toEqual(['done']);
    expect(Object.keys(file.attempts[0]).sort()).toEqual(
      ['attempt', 'finished', 'items', 'kind', 'limit_min', 'mode', 'started', 'status',
       'test_id', 'total_secs', 'uuid'].sort(),
    );
  });

  it('tracks pending exports and the 7-day reminder', () => {
    const done = finishAttempt(createAttempt(base()), s(30));
    const day = 24 * 3600 * 1000;
    expect(pendingExportCount([done])).toBe(1);
    expect(needsExportReminder([done], s(30) + 6 * day)).toBe(false);
    expect(needsExportReminder([done], s(30) + 8 * day)).toBe(true);
    const exported: Attempt[] = markExported([done]);
    expect(pendingExportCount(exported)).toBe(0);
    expect(needsExportReminder(exported, s(30) + 8 * day)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/domain/attempts.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/attempts`.

- [ ] **Step 3: Write the implementation**

`app/src/domain/attempts.ts`:

```ts
import { elapsedSecs, isExpired, pause, resume, startTimer } from './timer';
import type {
  Attempt, Cause, ExportAttempt, Item, Letter, Mode, Question, ResultsFile, Subject,
} from './types';

/** Everything needed to start an attempt. Time and IDs are passed in, never read globally. */
export interface NewAttempt {
  uuid: string;
  testId: string;
  title: string;
  subject: Subject;
  kind: 'fixed' | 'random';
  mode: Mode;
  questions: Question[];
  limitMin: number;
  passRef: number;
  attemptNumber: number;
  nowMs: number;
}

const REMINDER_MS = 7 * 24 * 3600 * 1000;

export function createAttempt(i: NewAttempt): Attempt {
  return {
    uuid: i.uuid,
    test_id: i.testId,
    kind: i.kind,
    mode: i.mode,
    attempt: i.attemptNumber,
    started: new Date(i.nowMs).toISOString(),
    finished: null,
    limit_min: i.limitMin,
    total_secs: 0,
    status: 'in_progress',
    items: i.questions.map((q) => ({
      q: q.id, key: q.answer, ans: null, doubt: false, stuck: false, secs: 0,
      first_answered_at_secs: null, cause: null,
    })),
    title: i.title,
    subject: i.subject,
    pass_ref: i.passRef,
    questions: i.questions,
    current: 0,
    mark_secs: 0,
    timer: startTimer(i.mode, Math.round(i.limitMin * 60), i.nowMs),
    exported: false,
  };
}

export function nextAttemptNumber(attempts: readonly Attempt[], testId: string): number {
  return attempts.filter((a) => a.test_id === testId).length + 1;
}

function updateItem(a: Attempt, index: number, patch: Partial<Item>): Attempt {
  return { ...a, items: a.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) };
}

/** Adds the time since the last mark to the current question. */
function charge(a: Attempt, elapsed: number): Attempt {
  const delta = Math.max(0, elapsed - a.mark_secs);
  const charged = updateItem(a, a.current, { secs: a.items[a.current].secs + delta });
  return { ...charged, mark_secs: elapsed };
}

export function selectAnswer(a: Attempt, letter: Letter, elapsed: number): Attempt {
  const item = a.items[a.current];
  const ans = item.ans === letter ? null : letter;
  const first = item.first_answered_at_secs ?? (ans === null ? null : elapsed);
  return updateItem(a, a.current, { ans, first_answered_at_secs: first });
}

export function toggleDoubt(a: Attempt): Attempt {
  return updateItem(a, a.current, { doubt: !a.items[a.current].doubt });
}

export function toggleStuck(a: Attempt): Attempt {
  return updateItem(a, a.current, { stuck: !a.items[a.current].stuck });
}

export function goTo(a: Attempt, index: number, elapsed: number): Attempt {
  if (index < 0 || index >= a.items.length) throw new Error('index out of range');
  return { ...charge(a, elapsed), current: index };
}

export function pauseAttempt(a: Attempt, nowMs: number): Attempt {
  const charged = charge(a, elapsedSecs(a.timer, nowMs));
  return { ...charged, timer: pause(a.timer, nowMs) };
}

export function resumeAttempt(a: Attempt, nowMs: number): Attempt {
  return { ...a, timer: resume(a.timer, nowMs) };
}

export function finishAttempt(a: Attempt, nowMs: number): Attempt {
  const elapsed = elapsedSecs(a.timer, nowMs);
  const charged = charge(a, elapsed);
  return {
    ...charged,
    status: 'finished',
    finished: new Date(nowMs).toISOString(),
    total_secs: elapsed,
  };
}

export function autoFinishIfExpired(a: Attempt, nowMs: number): Attempt {
  return a.status === 'in_progress' && isExpired(a.timer, nowMs) ? finishAttempt(a, nowMs) : a;
}

export function isWrong(item: Item): boolean {
  return item.ans !== null && item.ans !== item.key;
}

export function setCause(a: Attempt, index: number, cause: Cause | null): Attempt {
  if (a.status !== 'finished') throw new Error('attempt not finished');
  const item = a.items[index];
  if (cause !== null && !isWrong(item) && !item.doubt) {
    throw new Error('cause only for wrong or doubted questions');
  }
  return updateItem(a, index, { cause });
}

export function pendingExportCount(attempts: readonly Attempt[]): number {
  return attempts.filter((a) => a.status === 'finished' && !a.exported).length;
}

export function needsExportReminder(attempts: readonly Attempt[], nowMs: number): boolean {
  return attempts.some(
    (a) =>
      a.status === 'finished' &&
      !a.exported &&
      a.finished !== null &&
      nowMs - Date.parse(a.finished) > REMINDER_MS,
  );
}

function toExport(a: Attempt): ExportAttempt {
  return {
    uuid: a.uuid, test_id: a.test_id, kind: a.kind, mode: a.mode, attempt: a.attempt,
    started: a.started, finished: a.finished, limit_min: a.limit_min,
    total_secs: a.total_secs, status: a.status, items: a.items,
  };
}

/** Every finished attempt ever made; the Mac ledger skips those already registered. */
export function toResultsFile(attempts: readonly Attempt[], exportedIso: string): ResultsFile {
  return {
    schema: 1,
    exported: exportedIso,
    attempts: attempts.filter((a) => a.status === 'finished').map(toExport),
  };
}

export function markExported(attempts: readonly Attempt[]): Attempt[] {
  return attempts.map((a) => (a.status === 'finished' ? { ...a, exported: true } : a));
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add attempt lifecycle, numbering, causes and export mapping
```

---

### Task 12: Bank validation

**Files:**
- Create: `app/src/domain/bank.ts`
- Test: `app/tests/domain/bank.test.ts`

**Interfaces:**
- Consumes: `Bank`, `LETTERS`, `SUBJECTS` from `types.ts`.
- Produces:
  - `type BankResult = { ok: true; bank: Bank } | { ok: false; error: string }`
  - `validateBank(raw: unknown): BankResult`
  - `summarizeBankChange(prev: Bank | null, next: Bank): string`

- [ ] **Step 1: Write the failing tests**

`app/tests/domain/bank.test.ts`:

```ts
import { summarizeBankChange, validateBank } from '../../src/domain/bank';
import type { Bank } from '../../src/domain/types';

function validBank(): Bank {
  return {
    schema: 1,
    built: '2026-10-13T18:00:00+02:00',
    questions: [
      {
        id: 'SYN-T4-001#1', subject: 'temario', tema: 4, stem: '¿?', answer: 'c', level: 'N1',
        options: { a: '1', b: '2', c: '3', d: '4' }, cite: 'T4, pág. 6', explanation: 'x',
        hook: null, subtipo: 't4-x',
      },
    ],
    tests: [
      {
        id: 'SYN-T4-001', subject: 'temario', scope: 'T4', title: 'Tema 4',
        questions: ['SYN-T4-001#1'], limit_min: 1, pass_ref: 0, synthetic: true,
      },
    ],
  };
}

describe('validateBank', () => {
  it('accepts a valid bank', () => {
    const result = validateBank(validBank());
    expect(result.ok).toBe(true);
  });

  it('recognises a results file picked by mistake', () => {
    expect(validateBank({ schema: 1, exported: 'x', attempts: [] })).toEqual({
      ok: false,
      error: 'Este archivo es un results.json, no un banco.',
    });
  });

  it('rejects non-objects and unknown schema versions', () => {
    expect(validateBank(null)).toEqual({ ok: false, error: 'El archivo no es un banco.' });
    const bad = { ...validBank(), schema: 2 };
    expect(validateBank(bad)).toEqual({ ok: false, error: 'Versión de banco no soportada: 2.' });
  });

  it('names the broken question', () => {
    const bank = validBank();
    (bank.questions[0] as unknown as Record<string, unknown>).answer = 'e';
    expect(validateBank(bank)).toEqual({
      ok: false,
      error: 'Pregunta SYN-T4-001#1: respuesta inválida.',
    });
  });

  it('rejects a test that references a missing question', () => {
    const bank = validBank();
    bank.tests[0].questions = ['NOPE#1'];
    expect(validateBank(bank)).toEqual({
      ok: false,
      error: 'Test SYN-T4-001: la pregunta NOPE#1 no existe.',
    });
  });

  it('rejects duplicate question IDs', () => {
    const bank = validBank();
    bank.questions.push({ ...bank.questions[0] });
    expect(validateBank(bank)).toEqual({
      ok: false,
      error: 'Pregunta SYN-T4-001#1 repetida.',
    });
  });
});

describe('summarizeBankChange', () => {
  it('describes a first import', () => {
    expect(summarizeBankChange(null, validBank())).toBe(
      'Banco nuevo del 13/10: 1 tests, 1 preguntas. ¿Reemplazar?',
    );
  });

  it('describes the difference with the previous bank', () => {
    const prev = { ...validBank(), built: '2026-10-08T10:00:00+02:00', tests: [] };
    expect(summarizeBankChange(prev, validBank())).toBe(
      'Banco nuevo del 13/10: 1 tests, 1 preguntas (+1 tests desde el 08/10). ¿Reemplazar?',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/domain/bank.test.ts`
Expected: FAIL — cannot resolve `../../src/domain/bank`.

- [ ] **Step 3: Write the implementation**

`app/src/domain/bank.ts`:

```ts
import { LETTERS, SUBJECTS, type Bank } from './types';

export type BankResult = { ok: true; bank: Bank } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const fail = (error: string): BankResult => ({ ok: false, error });

function questionError(q: Obj): string | null {
  if (!SUBJECTS.includes(q.subject as never)) return 'asignatura inválida';
  if (!Number.isInteger(q.tema) || (q.tema as number) < 1) return 'tema inválido';
  if (!isText(q.stem)) return 'enunciado vacío';
  if (!isObj(q.options) || !LETTERS.every((l) => isText((q.options as Obj)[l]))) {
    return 'opciones incompletas';
  }
  if (!LETTERS.includes(q.answer as never)) return 'respuesta inválida';
  if (!['N1', 'N2', 'N3'].includes(q.level as string)) return 'nivel inválido';
  return null;
}

/** Checks structure and references so a broken file never replaces a working bank. */
export function validateBank(raw: unknown): BankResult {
  if (!isObj(raw)) return fail('El archivo no es un banco.');
  if ('attempts' in raw) return fail('Este archivo es un results.json, no un banco.');
  if (raw.schema !== 1) return fail(`Versión de banco no soportada: ${String(raw.schema)}.`);
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.tests)) {
    return fail('El archivo no es un banco.');
  }

  const ids = new Set<string>();
  for (const q of raw.questions) {
    if (!isObj(q) || !isText(q.id)) return fail('Hay una pregunta sin identificador.');
    if (ids.has(q.id)) return fail(`Pregunta ${q.id} repetida.`);
    ids.add(q.id);
    const problem = questionError(q);
    if (problem) return fail(`Pregunta ${q.id}: ${problem}.`);
  }

  for (const t of raw.tests) {
    if (!isObj(t) || !isText(t.id)) return fail('Hay un test sin identificador.');
    if (!SUBJECTS.includes(t.subject as never) || !isText(t.title) || !isText(t.scope)) {
      return fail(`Test ${t.id}: datos incompletos.`);
    }
    if (!Array.isArray(t.questions) || t.questions.length === 0) {
      return fail(`Test ${t.id}: sin preguntas.`);
    }
    const missing = t.questions.find((id) => !ids.has(id as string));
    if (missing !== undefined) return fail(`Test ${t.id}: la pregunta ${String(missing)} no existe.`);
    if (typeof t.limit_min !== 'number' || t.limit_min <= 0) {
      return fail(`Test ${t.id}: tiempo límite inválido.`);
    }
    if (typeof t.pass_ref !== 'number' || t.pass_ref < 0) {
      return fail(`Test ${t.id}: referencia de aprobado inválida.`);
    }
  }
  return { ok: true, bank: raw as unknown as Bank };
}

function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function summarizeBankChange(prev: Bank | null, next: Bank): string {
  const head = `Banco nuevo del ${dayMonth(next.built)}: ${next.tests.length} tests, ${next.questions.length} preguntas`;
  if (prev === null) return `${head}. ¿Reemplazar?`;
  const diff = next.tests.length - prev.tests.length;
  const sign = diff >= 0 ? '+' : '';
  return `${head} (${sign}${diff} tests desde el ${dayMonth(prev.built)}). ¿Reemplazar?`;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): validate imported banks and summarise bank changes
```

---

### Task 13: Storage and sync

**Files:**
- Create: `app/src/storage/db.ts`, `app/src/sync/importBank.ts`, `app/src/sync/exportResults.ts`
- Test: `app/tests/storage/db.test.ts`, `app/tests/sync/sync.test.ts`

**Interfaces:**
- Consumes: `Bank`, `Attempt`, `validateBank`, `BankResult`, `toResultsFile`.
- Produces:
  - `db.ts`: `type Db`; `openAppDb(name?: string): Promise<Db>`; `getBank(db)`, `putBank(db, bank)`, `listAttempts(db)` (sorted by `started`), `putAttempt(db, a)`, `putAttempts(db, as)`, `getMeta<T>(db, key)`, `setMeta(db, key, value)`, `requestPersistence(nav)`.
  - `importBank.ts`: `readBankFile(file: Blob): Promise<BankResult>`.
  - `exportResults.ts`: `interface ShareNav { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> }`; `buildResultsFile(attempts, now: Date): File | null`; `deliverFile(file, nav, download): Promise<'shared' | 'downloaded' | 'cancelled'>`; `downloadFile(file: File): void`.

- [ ] **Step 1: Write the failing tests**

`app/tests/storage/db.test.ts`:

```ts
import {
  getBank, getMeta, listAttempts, openAppDb, putAttempt, putAttempts, putBank,
  requestPersistence, setMeta,
} from '../../src/storage/db';
import type { Attempt, Bank } from '../../src/domain/types';

let n = 0;
const fresh = () => openAppDb(`test-db-${n++}`);

const bank = { schema: 1, built: 'x', questions: [], tests: [] } as Bank;
const attempt = (uuid: string, started: string) => ({ uuid, started }) as unknown as Attempt;

describe('db', () => {
  it('stores and replaces the bank', async () => {
    const db = await fresh();
    expect(await getBank(db)).toBeNull();
    await putBank(db, bank);
    expect(await getBank(db)).toEqual(bank);
  });

  it('upserts attempts and lists them by start time', async () => {
    const db = await fresh();
    await putAttempts(db, [attempt('b', '2026-10-14T20:00'), attempt('a', '2026-10-14T19:00')]);
    await putAttempt(db, { ...attempt('b', '2026-10-14T20:00'), total_secs: 5 } as Attempt);
    const all = await listAttempts(db);
    expect(all.map((a) => a.uuid)).toEqual(['a', 'b']);
    expect(all[1].total_secs).toBe(5);
  });

  it('stores meta values', async () => {
    const db = await fresh();
    expect(await getMeta<string>(db, 'lastExport')).toBeNull();
    await setMeta(db, 'lastExport', '2026-10-14');
    expect(await getMeta<string>(db, 'lastExport')).toBe('2026-10-14');
  });

  it('requests persistence when available', async () => {
    expect(await requestPersistence({ storage: { persist: async () => true } } as never)).toBe(true);
    expect(await requestPersistence({} as never)).toBe(false);
  });
});
```

`app/tests/sync/sync.test.ts`:

```ts
import { readBankFile } from '../../src/sync/importBank';
import { buildResultsFile, deliverFile } from '../../src/sync/exportResults';
import type { Attempt } from '../../src/domain/types';

const finished = {
  uuid: 'u', test_id: 'T', kind: 'fixed', mode: 'exam', attempt: 1, started: 's', finished: 'f',
  limit_min: 1, total_secs: 1, status: 'finished', items: [], exported: false,
} as unknown as Attempt;

describe('readBankFile', () => {
  it('rejects non-JSON with a readable message', async () => {
    const result = await readBankFile(new Blob(['not json']));
    expect(result).toEqual({ ok: false, error: 'El archivo no es JSON válido.' });
  });

  it('validates parsed JSON', async () => {
    const result = await readBankFile(new Blob([JSON.stringify({ schema: 1, attempts: [] })]));
    expect(result).toEqual({ ok: false, error: 'Este archivo es un results.json, no un banco.' });
  });
});

describe('buildResultsFile', () => {
  it('returns null when nothing is finished', () => {
    const open = { ...finished, status: 'in_progress' } as Attempt;
    expect(buildResultsFile([open], new Date(2026, 9, 14, 21, 5))).toBeNull();
  });

  it('names the file by local date and time', async () => {
    const file = buildResultsFile([finished], new Date(2026, 9, 14, 21, 5))!;
    expect(file.name).toBe('results-20261014-2105.json');
    expect(JSON.parse(await file.text()).attempts).toHaveLength(1);
  });
});

describe('deliverFile', () => {
  const file = new File(['{}'], 'results-x.json', { type: 'application/json' });

  it('shares when the share sheet supports files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const out = await deliverFile(file, { canShare: () => true, share }, download);
    expect(out).toBe('shared');
    expect(download).not.toHaveBeenCalled();
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const out = await deliverFile(
      file, { canShare: () => true, share: vi.fn().mockRejectedValue(abort) }, vi.fn(),
    );
    expect(out).toBe('cancelled');
  });

  it('falls back to a download when sharing is unavailable or fails', async () => {
    const download = vi.fn();
    expect(await deliverFile(file, {}, download)).toBe('downloaded');
    const failing = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('x')) };
    expect(await deliverFile(file, failing, download)).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/storage tests/sync`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 3: Write the implementation**

`app/src/storage/db.ts`:

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { Attempt, Bank } from '../domain/types';

/** IndexedDB layout: `meta` (key/value: bank, lastExport) and `attempts` (keyed by uuid). */
export type Db = IDBPDatabase;

export function openAppDb(name = 'controlador-tests'): Promise<Db> {
  return openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('attempts', { keyPath: 'uuid' });
    },
  });
}

export async function getBank(db: Db): Promise<Bank | null> {
  return ((await db.get('meta', 'bank')) as Bank | undefined) ?? null;
}

export async function putBank(db: Db, bank: Bank): Promise<void> {
  await db.put('meta', bank, 'bank');
}

export async function listAttempts(db: Db): Promise<Attempt[]> {
  const all = (await db.getAll('attempts')) as Attempt[];
  return all.sort((a, b) => a.started.localeCompare(b.started));
}

export async function putAttempt(db: Db, attempt: Attempt): Promise<void> {
  await db.put('attempts', attempt);
}

export async function putAttempts(db: Db, attempts: readonly Attempt[]): Promise<void> {
  const tx = db.transaction('attempts', 'readwrite');
  await Promise.all([...attempts.map((a) => tx.store.put(a)), tx.done]);
}

export async function getMeta<T>(db: Db, key: string): Promise<T | null> {
  return ((await db.get('meta', key)) as T | undefined) ?? null;
}

export async function setMeta(db: Db, key: string, value: unknown): Promise<void> {
  await db.put('meta', value, key);
}

/** Asks iOS to keep this app's data under storage pressure. */
export async function requestPersistence(nav: Pick<Navigator, 'storage'>): Promise<boolean> {
  return (await nav.storage?.persist?.()) ?? false;
}
```

`app/src/sync/importBank.ts`:

```ts
import { validateBank, type BankResult } from '../domain/bank';

export async function readBankFile(file: Blob): Promise<BankResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }
  return validateBank(raw);
}
```

`app/src/sync/exportResults.ts`:

```ts
import { toResultsFile } from '../domain/attempts';
import type { Attempt } from '../domain/types';

export interface ShareNav {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function buildResultsFile(attempts: readonly Attempt[], now: Date): File | null {
  const results = toResultsFile(attempts, now.toISOString());
  if (results.attempts.length === 0) return null;
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return new File([JSON.stringify(results, null, 1)], `results-${stamp}.json`, {
    type: 'application/json',
  });
}

/** Share sheet (AirDrop) first; a download into Files if sharing is unavailable or fails. */
export async function deliverFile(
  file: File,
  nav: ShareNav,
  download: (file: File) => void,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  download(file);
  return 'downloaded';
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add IndexedDB storage, bank import and results export
```

---

### Task 14: Runner screen

Invoke the `ui-ux-pro-max` skill before starting (global UI rule). Structure and behaviour only here; the visual pass is Task 18.

**Files:**
- Create: `app/src/ui/useNow.ts`, `app/src/ui/Runner.tsx`
- Test: `app/tests/ui/Runner.test.tsx`

**Interfaces:**
- Consumes: `attempts.ts` (`selectAnswer`, `toggleDoubt`, `toggleStuck`, `goTo`, `finishAttempt`, `pauseAttempt`, `resumeAttempt`), `timer.ts` (`elapsedSecs`, `remainingSecs`, `isExpired`, `isOvertime`, `isPaused`, `formatClock`).
- Produces:
  - `useNow(now: () => number, intervalMs?: number): number`
  - `Runner(props: { attempt: Attempt; now: () => number; confirmFn: (msg: string) => boolean; onChange: (a: Attempt) => void; onFinished: (a: Attempt) => void })`

- [ ] **Step 1: Write the failing tests**

`app/tests/ui/Runner.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/preact';
import { createAttempt } from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';
import { Runner } from '../../src/ui/Runner';

const T0 = 1_000_000;
const q = (n: number): Question => ({
  id: `X#${n}`, subject: 'temario', tema: 1, stem: `Enunciado ${n}`, answer: 'a', level: 'N1',
  options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` },
});

function setup(mode: 'exam' | 'practice' = 'exam', nowMs = T0 + 5000) {
  const attempt = createAttempt({
    uuid: 'u', testId: 'X', title: 'Test X', subject: 'temario', kind: 'fixed', mode,
    questions: [q(1), q(2)], limitMin: 2, passRef: 1, attemptNumber: 1, nowMs: T0,
  });
  const onChange = vi.fn<(a: Attempt) => void>();
  const onFinished = vi.fn<(a: Attempt) => void>();
  const confirmFn = vi.fn(() => true);
  render(
    <Runner attempt={attempt} now={() => nowMs} confirmFn={confirmFn}
      onChange={onChange} onFinished={onFinished} />,
  );
  return { attempt, onChange, onFinished, confirmFn };
}

describe('Runner', () => {
  it('shows the question, progress and remaining time', () => {
    setup();
    expect(screen.getByText('Enunciado 1')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('01:55')).toBeTruthy();
  });

  it('selecting an option reports the new attempt', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /A1/ }));
    expect(onChange.mock.calls[0][0].items[0].ans).toBe('a');
    expect(onChange.mock.calls[0][0].items[0].first_answered_at_secs).toBe(5);
  });

  it('toggles doubt and stuck', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Duda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atasco' }));
    expect(onChange.mock.calls[0][0].items[0].doubt).toBe(true);
    expect(onChange.mock.calls[1][0].items[0].stuck).toBe(true);
  });

  it('navigates with next and via the grid', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onChange.mock.calls[0][0].current).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cuadrícula' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la pregunta 2' }));
    expect(onChange.mock.calls[1][0].current).toBe(1);
  });

  it('finishing asks for confirmation mentioning blanks', () => {
    const { onFinished, confirmFn } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(confirmFn).toHaveBeenCalledWith('¿Terminar el test? Quedan 2 en blanco.');
    expect(onFinished.mock.calls[0][0].status).toBe('finished');
  });

  it('auto-finishes an exam when time is up', () => {
    const { onFinished } = setup('exam', T0 + 200_000);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0][0].total_secs).toBe(120);
  });

  it('practice mode shows overtime and a pause button; exam mode has no pause', () => {
    setup('practice', T0 + 130_000);
    expect(screen.getByText('+00:10')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausa' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/ui/Runner.test.tsx`
Expected: FAIL — cannot resolve `../../src/ui/Runner`.

- [ ] **Step 3: Write the implementation**

`app/src/ui/useNow.ts`:

```ts
import { useEffect, useState } from 'preact/hooks';

/** Re-renders every `intervalMs` with the current time from `now`. */
export function useNow(now: () => number, intervalMs = 1000): number {
  const [value, setValue] = useState(now);
  useEffect(() => {
    setValue(now());
    const id = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(id);
  }, [now, intervalMs]);
  return value;
}
```

`app/src/ui/Runner.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import {
  finishAttempt, goTo, pauseAttempt, resumeAttempt, selectAnswer, toggleDoubt, toggleStuck,
} from '../domain/attempts';
import {
  elapsedSecs, formatClock, isExpired, isOvertime, isPaused, remainingSecs,
} from '../domain/timer';
import { LETTERS, type Attempt } from '../domain/types';
import { useNow } from './useNow';

interface RunnerProps {
  attempt: Attempt;
  now: () => number;
  confirmFn: (message: string) => boolean;
  onChange: (attempt: Attempt) => void;
  onFinished: (attempt: Attempt) => void;
}

export function Runner({ attempt: a, now, confirmFn, onChange, onFinished }: RunnerProps) {
  const nowMs = useNow(now);
  const [showGrid, setShowGrid] = useState(false);
  const item = a.items[a.current];
  const question = a.questions[a.current];
  const paused = isPaused(a.timer);
  const elapsed = () => elapsedSecs(a.timer, now());

  useEffect(() => {
    if (a.status === 'in_progress' && isExpired(a.timer, nowMs)) onFinished(finishAttempt(a, nowMs));
  }, [nowMs, a, onFinished]);

  useEffect(() => {
    if (a.mode !== 'practice') return undefined;
    const handler = () => {
      const t = now();
      onChange(document.visibilityState === 'hidden' ? pauseAttempt(a, t) : resumeAttempt(a, t));
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [a, now, onChange]);

  const blanks = a.items.filter((i) => i.ans === null).length;
  const finish = () => {
    if (confirmFn(`¿Terminar el test? Quedan ${blanks} en blanco.`)) onFinished(finishAttempt(a, now()));
  };
  const move = (index: number) => onChange(goTo(a, index, elapsed()));

  return (
    <main class="runner">
      <header class="runner-bar">
        <span class={isOvertime(a.timer, nowMs) ? 'clock overtime' : 'clock'}>
          {formatClock(remainingSecs(a.timer, nowMs))}
        </span>
        <span class="progress">{`${a.current + 1} / ${a.items.length}`}</span>
        {a.mode === 'practice' && (
          <button type="button" onClick={() => onChange(paused ? resumeAttempt(a, now()) : pauseAttempt(a, now()))}>
            {paused ? 'Reanudar' : 'Pausa'}
          </button>
        )}
      </header>

      {paused ? (
        <section class="paused"><p>En pausa</p></section>
      ) : (
        <section class="question">
          <p class="stem">{question.stem}</p>
          <ol class="options">
            {LETTERS.map((letter) => (
              <li key={letter}>
                <button
                  type="button"
                  class="option"
                  aria-pressed={item.ans === letter}
                  onClick={() => onChange(selectAnswer(a, letter, elapsed()))}
                >
                  <span class="letter">{letter})</span> {question.options[letter]}
                </button>
              </li>
            ))}
          </ol>
          <div class="flags">
            <button type="button" aria-pressed={item.doubt} onClick={() => onChange(toggleDoubt(a))}>Duda</button>
            <button type="button" aria-pressed={item.stuck} onClick={() => onChange(toggleStuck(a))}>Atasco</button>
          </div>
        </section>
      )}

      <nav class="runner-nav">
        <button type="button" disabled={a.current === 0} onClick={() => move(a.current - 1)}>Anterior</button>
        <button type="button" onClick={() => setShowGrid(!showGrid)}>Cuadrícula</button>
        <button type="button" disabled={a.current === a.items.length - 1} onClick={() => move(a.current + 1)}>Siguiente</button>
      </nav>

      {showGrid && (
        <div class="grid">
          {a.items.map((it, index) => (
            <button
              type="button"
              key={it.q}
              aria-label={`Ir a la pregunta ${index + 1}`}
              class={['cell', it.ans ? 'answered' : 'blank', it.doubt || it.stuck ? 'flagged' : '', index === a.current ? 'current' : ''].join(' ')}
              onClick={() => { move(index); setShowGrid(false); }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}

      <button type="button" class="finish" onClick={finish}>Terminar</button>
    </main>
  );
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add test runner screen with timer, flags and question grid
```

---

### Task 15: Results and review screen

Invoke the `ui-ux-pro-max` skill before starting.

**Files:**
- Create: `app/src/ui/Markdown.tsx`, `app/src/ui/Results.tsx`
- Test: `app/tests/ui/Results.test.tsx`

**Interfaces:**
- Consumes: `score`, `passes`, `isWrong`, `setCause`, `formatClock`, `CAUSES`.
- Produces:
  - `Markdown(props: { text: string })`
  - `Results(props: { attempt: Attempt; onChange: (a: Attempt) => void; onHome: () => void })`

- [ ] **Step 1: Write the failing tests**

`app/tests/ui/Results.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/preact';
import { createAttempt, finishAttempt, goTo, selectAnswer, toggleDoubt } from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';
import { Results } from '../../src/ui/Results';

const T0 = 1_000_000;
const q = (n: number, answer: 'a' | 'b'): Question => ({
  id: `X#${n}`, subject: 'temario', tema: 1, stem: `Enunciado ${n}`, answer, level: 'N2',
  options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` },
  cite: `T1, pág. ${n}`, explanation: `**Explicación** ${n}`, hook: `Gancho ${n}`,
});

function finished(): Attempt {
  let a = createAttempt({
    uuid: 'u', testId: 'X', title: 'Test X', subject: 'temario', kind: 'fixed', mode: 'exam',
    questions: [q(1, 'a'), q(2, 'a'), q(3, 'b')], limitMin: 3, passRef: 1, attemptNumber: 1, nowMs: T0,
  });
  a = selectAnswer(a, 'a', 1);            // 1 correct
  a = goTo(a, 1, 2);
  a = selectAnswer(a, 'b', 3);            // 2 wrong
  a = goTo(a, 2, 4);
  a = toggleDoubt(a);                     // 3 blank + doubt
  return finishAttempt(a, T0 + 65_000);
}

describe('Results', () => {
  it('summarises the score, pass reference and time', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getByText('Aciertos 1 · Fallos 1 · Blancos 1')).toBeTruthy();
    expect(screen.getByText('Nota neta 0.67')).toBeTruthy();
    expect(screen.getByText('Referencia de aprobado 1: no alcanzada')).toBeTruthy();
    expect(screen.getByText('Tiempo 01:05 de 03:00 · Modo examen')).toBeTruthy();
  });

  it('filters the review list', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Fallos' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Enunciado 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dudas' }));
    expect(screen.getByText('Enunciado 3')).toBeTruthy();
  });

  it('renders explanation markdown, citation and hook', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getAllByText('Explicación')[0].tagName).toBe('STRONG');
    expect(screen.getByText('[T1, pág. 2] · N2')).toBeTruthy();
    expect(screen.getByText('Gancho 2')).toBeTruthy();
  });

  it('offers a cause only on wrong or doubted questions and reports the change', () => {
    const onChange = vi.fn<(a: Attempt) => void>();
    render(<Results attempt={finished()} onChange={onChange} onHome={vi.fn()} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    fireEvent.change(selects[0], { target: { value: 'Confundí dos conceptos' } });
    expect(onChange.mock.calls[0][0].items[1].cause).toBe('Confundí dos conceptos');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/ui/Results.test.tsx`
Expected: FAIL — cannot resolve `../../src/ui/Results`.

- [ ] **Step 3: Write the implementation**

`app/src/ui/Markdown.tsx`:

```tsx
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Renders explanation Markdown from the bank, sanitised before insertion. */
export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div class="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

`app/src/ui/Results.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { isWrong, setCause } from '../domain/attempts';
import { passes, score } from '../domain/scoring';
import { formatClock } from '../domain/timer';
import { CAUSES, LETTERS, type Attempt, type Cause, type Item } from '../domain/types';
import { Markdown } from './Markdown';

type Filter = 'all' | 'wrong' | 'blank' | 'doubt';
const FILTERS: [Filter, string][] = [
  ['all', 'Todas'], ['wrong', 'Fallos'], ['blank', 'Blancos'], ['doubt', 'Dudas'],
];
const matches: Record<Filter, (i: Item) => boolean> = {
  all: () => true,
  wrong: isWrong,
  blank: (i) => i.ans === null,
  doubt: (i) => i.doubt,
};

interface ResultsProps {
  attempt: Attempt;
  onChange: (attempt: Attempt) => void;
  onHome: () => void;
}

export function Results({ attempt: a, onChange, onHome }: ResultsProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const s = score(a.items);
  const ok = passes(s, a.pass_ref);
  const mode = a.mode === 'exam' ? 'Modo examen' : 'Modo práctica';

  return (
    <main class="results">
      <header>
        <h1>{a.title}</h1>
        <p>{`Aciertos ${s.correct} · Fallos ${s.wrong} · Blancos ${s.blank}`}</p>
        <p class="net">{`Nota neta ${s.net}`}</p>
        <p class={ok ? 'pass' : 'fail'}>
          {`Referencia de aprobado ${a.pass_ref}: ${ok ? 'alcanzada' : 'no alcanzada'}`}
        </p>
        <p>{`Tiempo ${formatClock(a.total_secs)} de ${formatClock(a.limit_min * 60)} · ${mode}`}</p>
      </header>

      <div class="filters" role="group">
        {FILTERS.map(([key, label]) => (
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {a.items.map((item, index) => {
        if (!matches[filter](item)) return null;
        const q = a.questions[index];
        return (
          <article key={item.q} class="review">
            <h2>{`Pregunta ${index + 1}`}</h2>
            <p class="stem">{q.stem}</p>
            <ol class="options">
              {LETTERS.map((letter) => (
                <li
                  key={letter}
                  class={[
                    letter === item.key ? 'correct' : '',
                    letter === item.ans && letter !== item.key ? 'chosen-wrong' : '',
                  ].join(' ')}
                >
                  {`${letter}) ${q.options[letter]}`}
                </li>
              ))}
            </ol>
            {q.cite && <p class="cite">{`[${q.cite}] · ${q.level}`}</p>}
            {q.explanation && <Markdown text={q.explanation} />}
            {q.hook && <p class="hook">{q.hook}</p>}
            {(isWrong(item) || item.doubt) && (
              <label class="cause">
                Causa
                <select
                  value={item.cause ?? ''}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value;
                    onChange(setCause(a, index, value === '' ? null : (value as Cause)));
                  }}
                >
                  <option value="">—</option>
                  {CAUSES.map((cause) => (
                    <option key={cause} value={cause}>{cause}</option>
                  ))}
                </select>
              </label>
            )}
          </article>
        );
      })}

      <button type="button" class="home" onClick={onHome}>Volver al inicio</button>
    </main>
  );
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add results summary, filtered review and cause tagging
```

---

### Task 16: Home and Setup screens

Invoke the `ui-ux-pro-max` skill before starting.

**Files:**
- Create: `app/src/ui/Home.tsx`, `app/src/ui/Setup.tsx`
- Test: `app/tests/ui/Home.test.tsx`, `app/tests/ui/Setup.test.tsx`

**Interfaces:**
- Consumes: `score`, `needsExportReminder`, `pendingExportCount`, `availableCount`, `sampleQuestions`, `randomTestId`, `temasOf`.
- Produces:
  - `interface BeginInput { testId: string; title: string; subject: Subject; kind: 'fixed' | 'random'; mode: Mode; questions: Question[]; limitMin: number; passRef: number }`
  - `Home(props: { bank: Bank | null; attempts: Attempt[]; subject: Subject; nowMs: number; message: string | null; onSubject: (s: Subject) => void; onOpenTest: (testId: string) => void; onRandom: () => void; onImport: (file: File) => void; onExport: () => void; onOpenAttempt: (uuid: string) => void })`
  - `Setup(props: { bank: Bank; subject: Subject; test: TestDef | null; attemptNumber: number; now: () => number; onBegin: (input: BeginInput) => void; onCancel: () => void })`

- [ ] **Step 1: Write the failing tests**

`app/tests/ui/Home.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/preact';
import type { Attempt, Bank } from '../../src/domain/types';
import { Home } from '../../src/ui/Home';

const bank: Bank = {
  schema: 1, built: 'x',
  questions: [{ id: 'A#1', subject: 'temario', tema: 4, stem: 's', answer: 'a', level: 'N1',
    options: { a: '1', b: '2', c: '3', d: '4' } }],
  tests: [{ id: 'SYN-T4-001', subject: 'temario', scope: 'T4', title: 'Tema 4: Cartografía',
    questions: ['A#1'], limit_min: 1, pass_ref: 0, synthetic: true }],
};
const DAY = 24 * 3600 * 1000;
const done = (finished: string, exported = false) => ({
  uuid: finished, test_id: 'SYN-T4-001', status: 'finished', finished, started: finished,
  exported, title: 'Tema 4: Cartografía', items: [{ key: 'a', ans: 'a' }],
}) as unknown as Attempt;

function renderHome(attempts: Attempt[], over: Record<string, unknown> = {}) {
  const props = {
    bank, attempts, subject: 'temario' as const, nowMs: Date.parse('2026-10-14T12:00:00Z'),
    message: null, onSubject: vi.fn(), onOpenTest: vi.fn(), onRandom: vi.fn(),
    onImport: vi.fn(), onExport: vi.fn(), onOpenAttempt: vi.fn(), ...over,
  };
  render(<Home {...props} />);
  return props;
}

describe('Home', () => {
  it('lists tests by scope with their status', () => {
    renderHome([done('2026-10-13T10:00:00Z')]);
    expect(screen.getByText('T4')).toBeTruthy();
    expect(screen.getByText('2026-10-13 · neta 1 · 1 intento(s)')).toBeTruthy();
  });

  it('shows "Sin hacer" for untaken tests and opens setup on tap', () => {
    const props = renderHome([]);
    fireEvent.click(screen.getByRole('button', { name: /Tema 4: Cartografía/ }));
    expect(props.onOpenTest).toHaveBeenCalledWith('SYN-T4-001');
    expect(screen.getByText('Sin hacer')).toBeTruthy();
  });

  it('disables export when nothing is finished and shows the pending count otherwise', () => {
    renderHome([]);
    expect((screen.getByRole('button', { name: 'Exportar resultados (0)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the export reminder after 7 days', () => {
    const old = new Date(Date.parse('2026-10-14T12:00:00Z') - 8 * DAY).toISOString();
    renderHome([done(old)]);
    expect(screen.getByText('1 intento(s) sin exportar — exporta ya')).toBeTruthy();
  });

  it('asks for a bank when there is none', () => {
    renderHome([], { bank: null });
    expect(screen.getByText('No hay banco. Importa bank.json para empezar.')).toBeTruthy();
  });
});
```

`app/tests/ui/Setup.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/preact';
import type { Bank, Question } from '../../src/domain/types';
import { Setup, type BeginInput } from '../../src/ui/Setup';

const q = (id: string, tema: number): Question => ({
  id, subject: 'temario', tema, stem: id, answer: 'a', level: 'N1',
  options: { a: '1', b: '2', c: '3', d: '4' },
});
const bank: Bank = {
  schema: 1, built: 'x',
  questions: [q('A#1', 3), q('A#2', 3), q('B#1', 4)],
  tests: [{ id: 'SYN-T3-001', subject: 'temario', scope: 'T3', title: 'Tema 3',
    questions: ['A#1', 'A#2'], limit_min: 2, pass_ref: 1, synthetic: true }],
};
const NOW = new Date(2026, 9, 14, 20, 30, 15).getTime();

describe('Setup', () => {
  it('starts a fixed test in the chosen mode', () => {
    const onBegin = vi.fn<(i: BeginInput) => void>();
    render(<Setup bank={bank} subject="temario" test={bank.tests[0]} attemptNumber={1}
      now={() => NOW} onBegin={onBegin} onCancel={vi.fn()} />);
    expect(screen.getByText('Tiempo: 2 min')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Práctica (límite blando, con pausa)'));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(onBegin.mock.calls[0][0]).toMatchObject({
      testId: 'SYN-T3-001', kind: 'fixed', mode: 'practice', limitMin: 2, passRef: 1,
    });
    expect(onBegin.mock.calls[0][0].questions.map((x) => x.id)).toEqual(['A#1', 'A#2']);
  });

  it('warns that repeat attempts do not count', () => {
    render(<Setup bank={bank} subject="temario" test={bank.tests[0]} attemptNumber={2}
      now={() => NOW} onBegin={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Intento 2: no cuenta en tus series.')).toBeTruthy();
  });

  it('builds a random test from ticked chapters, capped at what is available', () => {
    const onBegin = vi.fn<(i: BeginInput) => void>();
    render(<Setup bank={bank} subject="temario" test={null} attemptNumber={1}
      now={() => NOW} onBegin={onBegin} onCancel={vi.fn()} />);
    const start = screen.getByRole('button', { name: 'Empezar' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Tema 3'));
    fireEvent.click(start);
    const input = onBegin.mock.calls[0][0];
    expect(input).toMatchObject({
      testId: 'RND-T3-20261014-203015', kind: 'random', mode: 'exam', limitMin: 2, passRef: 1,
    });
    expect(input.questions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run tests/ui/Home.test.tsx tests/ui/Setup.test.tsx`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 3: Write the implementation**

`app/src/ui/Home.tsx`:

```tsx
import { needsExportReminder, pendingExportCount } from '../domain/attempts';
import { score } from '../domain/scoring';
import type { Attempt, Bank, Subject, TestDef } from '../domain/types';

interface HomeProps {
  bank: Bank | null;
  attempts: Attempt[];
  subject: Subject;
  nowMs: number;
  message: string | null;
  onSubject: (subject: Subject) => void;
  onOpenTest: (testId: string) => void;
  onRandom: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onOpenAttempt: (uuid: string) => void;
}

function status(test: TestDef, attempts: Attempt[]): string {
  const done = attempts.filter((a) => a.test_id === test.id && a.status === 'finished');
  if (done.length === 0) return 'Sin hacer';
  const last = done[done.length - 1];
  return `${(last.finished ?? last.started).slice(0, 10)} · neta ${score(last.items).net} · ${done.length} intento(s)`;
}

export function Home(p: HomeProps) {
  const tests = (p.bank?.tests ?? []).filter((t) => t.subject === p.subject);
  const scopes = [...new Set(tests.map((t) => t.scope))];
  const finished = p.attempts.filter((a) => a.status === 'finished');
  const pending = pendingExportCount(p.attempts);
  const hasQuestions = (p.bank?.questions ?? []).some((q) => q.subject === p.subject);

  return (
    <main class="home">
      <nav class="tabs" role="tablist">
        {(['temario', 'ingles'] as const).map((s) => (
          <button type="button" role="tab" key={s} aria-selected={p.subject === s} onClick={() => p.onSubject(s)}>
            {s === 'temario' ? 'Temario' : 'Inglés'}
          </button>
        ))}
      </nav>

      {p.message && <p class="banner" role="status">{p.message}</p>}
      {needsExportReminder(p.attempts, p.nowMs) && (
        <p class="banner warn" role="alert">{`${pending} intento(s) sin exportar — exporta ya`}</p>
      )}
      {!p.bank && <p class="empty">No hay banco. Importa bank.json para empezar.</p>}

      {scopes.map((scope) => (
        <section key={scope} class="scope">
          <h2>{scope}</h2>
          {tests.filter((t) => t.scope === scope).map((t) => (
            <button type="button" key={t.id} class="test-row" onClick={() => p.onOpenTest(t.id)}>
              <span class="title">{t.title}</span>
              <span class="id">{t.id}</span>
              <span class="status">{status(t, p.attempts)}</span>
            </button>
          ))}
        </section>
      ))}

      <button type="button" class="random" disabled={!hasQuestions} onClick={p.onRandom}>
        Práctica aleatoria
      </button>

      {finished.length > 0 && (
        <section class="history">
          <h2>Historial</h2>
          {finished.slice(-10).reverse().map((a) => (
            <button type="button" key={a.uuid} class="history-row" onClick={() => p.onOpenAttempt(a.uuid)}>
              {`${a.title} · ${(a.finished ?? '').slice(0, 10)} · neta ${score(a.items).net}`}
            </button>
          ))}
        </section>
      )}

      <footer class="sync">
        <label class="import">
          Importar banco
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) p.onImport(file);
              input.value = '';
            }}
          />
        </label>
        <button type="button" disabled={finished.length === 0} onClick={p.onExport}>
          {`Exportar resultados (${pending})`}
        </button>
      </footer>
    </main>
  );
}
```

`app/src/ui/Setup.tsx`:

```tsx
import { useState } from 'preact/hooks';
import { availableCount, randomTestId, sampleQuestions, temasOf } from '../domain/sampler';
import type { Bank, Mode, Question, Subject, TestDef } from '../domain/types';

export interface BeginInput {
  testId: string;
  title: string;
  subject: Subject;
  kind: 'fixed' | 'random';
  mode: Mode;
  questions: Question[];
  limitMin: number;
  passRef: number;
}

interface SetupProps {
  bank: Bank;
  subject: Subject;
  test: TestDef | null;
  attemptNumber: number;
  now: () => number;
  onBegin: (input: BeginInput) => void;
  onCancel: () => void;
}

export function Setup({ bank, subject, test, attemptNumber, now, onBegin, onCancel }: SetupProps) {
  const [mode, setMode] = useState<Mode>('exam');
  const [temas, setTemas] = useState<number[]>([]);
  const [count, setCount] = useState(20);
  const available = availableCount(bank.questions, subject, temas);
  const effective = Math.max(0, Math.min(count, available));
  const limit = test ? test.limit_min : effective;
  const canStart = test !== null || effective > 0;

  const toggleTema = (tema: number) =>
    setTemas(temas.includes(tema) ? temas.filter((t) => t !== tema) : [...temas, tema]);

  const begin = () => {
    if (test) {
      const byId = new Map(bank.questions.map((q) => [q.id, q]));
      onBegin({
        testId: test.id, title: test.title, subject, kind: 'fixed', mode,
        questions: test.questions.map((id) => byId.get(id) as Question),
        limitMin: test.limit_min, passRef: test.pass_ref,
      });
      return;
    }
    const nowMs = now();
    const questions = sampleQuestions(bank.questions, { subject, temas, count: effective, seed: nowMs });
    const sorted = [...temas].sort((a, b) => a - b);
    onBegin({
      testId: randomTestId(sorted, new Date(nowMs)),
      title: `Práctica aleatoria — temas ${sorted.join(', ')}`,
      subject, kind: 'random', mode, questions,
      limitMin: questions.length, passRef: Math.floor(questions.length / 2),
    });
  };

  return (
    <main class="setup">
      <h1>{test ? test.title : 'Práctica aleatoria'}</h1>
      {test && attemptNumber > 1 && (
        <p class="banner warn">{`Intento ${attemptNumber}: no cuenta en tus series.`}</p>
      )}

      <fieldset>
        <legend>Modo</legend>
        <label>
          <input type="radio" name="mode" checked={mode === 'exam'} onChange={() => setMode('exam')} />
          Examen (corte duro)
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === 'practice'} onChange={() => setMode('practice')} />
          Práctica (límite blando, con pausa)
        </label>
      </fieldset>

      {!test && (
        <fieldset>
          <legend>Temas</legend>
          {temasOf(bank.questions, subject).map((tema) => (
            <label key={tema}>
              <input type="checkbox" checked={temas.includes(tema)} onChange={() => toggleTema(tema)} />
              {`Tema ${tema}`}
            </label>
          ))}
          <label>
            Preguntas
            <input
              type="number"
              min={1}
              max={Math.max(1, available)}
              value={count}
              onInput={(e) => setCount(Number((e.target as HTMLInputElement).value) || 1)}
            />
          </label>
          <p>{`Disponibles: ${available}`}</p>
        </fieldset>
      )}

      <p>{`Tiempo: ${limit} min`}</p>
      <div class="actions">
        <button type="button" onClick={onCancel}>Volver</button>
        <button type="button" class="primary" disabled={!canStart} onClick={begin}>Empezar</button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: all passed; no type errors.

- [ ] **Step 5: Propose commit**

```
feat(app): add home and test setup screens
```

---

### Task 17: App shell, entry point and integration test

Invoke the `ui-ux-pro-max` skill before starting.

**Files:**
- Create: `app/src/App.tsx`, `app/src/main.tsx`, `app/src/ui/UpdatePrompt.tsx`, `app/src/styles.css`
- Test: `app/tests/App.integration.test.tsx`

**Interfaces:**
- Consumes: every module above.
- Produces: `App(props: { db: Db; now?: () => number; newId?: () => string; confirmFn?: (m: string) => boolean; nav?: ShareNav; download?: (f: File) => void; UpdatePrompt?: (p: { hidden: boolean }) => JSX.Element | null })`.

- [ ] **Step 1: Write the failing integration test**

`app/tests/App.integration.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../src/App';
import type { Bank } from '../src/domain/types';
import { listAttempts, openAppDb, putBank, type Db } from '../src/storage/db';

const bank: Bank = {
  schema: 1, built: '2026-10-13T18:00:00+02:00',
  questions: [1, 2].map((n) => ({
    id: `SYN-T4-001#${n}`, subject: 'temario' as const, tema: 4, stem: `Enunciado ${n}`,
    answer: 'a' as const, level: 'N1' as const,
    options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` }, explanation: 'Porque sí.',
  })),
  tests: [{ id: 'SYN-T4-001', subject: 'temario', scope: 'T4', title: 'Tema 4',
    questions: ['SYN-T4-001#1', 'SYN-T4-001#2'], limit_min: 2, pass_ref: 1, synthetic: true }],
};

let n = 0;
let db: Db;
let clock = 1_000_000;
const now = () => clock;

beforeEach(async () => {
  db = await openAppDb(`app-it-${n++}`);
  await putBank(db, bank);
  clock = 1_000_000;
});

function mount(extra: Record<string, unknown> = {}) {
  return render(<App db={db} now={now} newId={() => `id-${n}`} confirmFn={() => true} {...extra} />);
}

describe('App', () => {
  it('persists every action and resumes on the same question after a restart', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    fireEvent.click(await screen.findByRole('button', { name: /A1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(async () => {
      const [saved] = await listAttempts(db);
      expect(saved.items[0].ans).toBe('a');
      expect(saved.current).toBe(1);
    });

    cleanup();
    mount();
    expect(await screen.findByText('Enunciado 2')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('finishes an exam that expired while the app was closed', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    await screen.findByText('Enunciado 1');
    cleanup();

    clock += 10 * 60 * 1000;
    mount();
    expect(await screen.findByText('Tiempo 02:00 de 02:00 · Modo examen')).toBeTruthy();
    const [saved] = await listAttempts(db);
    expect(saved.status).toBe('finished');
  });

  it('does not mark attempts exported when the share sheet is dismissed', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(abort) };
    mount({ nav, download: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Volver al inicio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar resultados (1)' }));
    await waitFor(() => expect(nav.share).toHaveBeenCalled());
    const [saved] = await listAttempts(db);
    expect(saved.exported).toBe(false);
  });

  it('marks attempts exported after a successful share', async () => {
    const nav = { canShare: () => true, share: vi.fn().mockResolvedValue(undefined) };
    mount({ nav });
    fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Volver al inicio' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar resultados (1)' }));
    expect(await screen.findByRole('button', { name: 'Exportar resultados (0)' })).toBeTruthy();
    const [saved] = await listAttempts(db);
    expect(saved.exported).toBe(true);
  });

  it('keeps the old bank when an invalid file is imported', async () => {
    const { container } = mount();
    await screen.findByRole('button', { name: /Tema 4/ });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const bad = new File([JSON.stringify({ schema: 1, attempts: [] })], 'results.json');
    fireEvent.change(input, { target: { files: [bad] } });
    expect(await screen.findByText('Este archivo es un results.json, no un banco.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tema 4/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run tests/App.integration.test.tsx`
Expected: FAIL — cannot resolve `../src/App`.

- [ ] **Step 3: Write the implementation**

`app/src/App.tsx`:

```tsx
import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  autoFinishIfExpired, createAttempt, markExported, nextAttemptNumber,
} from './domain/attempts';
import { summarizeBankChange } from './domain/bank';
import type { Attempt, Bank, Subject } from './domain/types';
import {
  getBank, listAttempts, putAttempt, putAttempts, putBank, setMeta, type Db,
} from './storage/db';
import { buildResultsFile, deliverFile, downloadFile, type ShareNav } from './sync/exportResults';
import { readBankFile } from './sync/importBank';
import { Home } from './ui/Home';
import { Results } from './ui/Results';
import { Runner } from './ui/Runner';
import { Setup, type BeginInput } from './ui/Setup';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; testId: string | null }
  | { name: 'run'; uuid: string }
  | { name: 'results'; uuid: string };

interface AppProps {
  db: Db;
  now?: () => number;
  newId?: () => string;
  confirmFn?: (message: string) => boolean;
  nav?: ShareNav;
  download?: (file: File) => void;
  UpdatePrompt?: (props: { hidden: boolean }) => JSX.Element | null;
}

const defaultNow = () => Date.now();
const defaultId = () => crypto.randomUUID();
const defaultConfirm = (message: string) => window.confirm(message);

export function App({
  db,
  now = defaultNow,
  newId = defaultId,
  confirmFn = defaultConfirm,
  nav = navigator,
  download = downloadFile,
  UpdatePrompt,
}: AppProps) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [subject, setSubject] = useState<Subject>('temario');
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const storedBank = await getBank(db);
      let stored = await listAttempts(db);
      const open = stored.find((a) => a.status === 'in_progress');
      if (open) {
        const checked = autoFinishIfExpired(open, now());
        if (checked !== open) {
          await putAttempt(db, checked);
          stored = stored.map((a) => (a.uuid === checked.uuid ? checked : a));
        }
        setScreen(
          checked.status === 'in_progress'
            ? { name: 'run', uuid: checked.uuid }
            : { name: 'results', uuid: checked.uuid },
        );
      }
      setBank(storedBank);
      setAttempts(stored);
      setLoaded(true);
    })();
  }, [db, now]);

  /** Every change is written to IndexedDB immediately, so a killed app loses nothing. */
  const save = useCallback(
    (attempt: Attempt) => {
      setAttempts((prev) =>
        prev.some((a) => a.uuid === attempt.uuid)
          ? prev.map((a) => (a.uuid === attempt.uuid ? attempt : a))
          : [...prev, attempt],
      );
      void putAttempt(db, attempt);
    },
    [db],
  );

  const onFinished = useCallback(
    (attempt: Attempt) => {
      save(attempt);
      setScreen({ name: 'results', uuid: attempt.uuid });
    },
    [save],
  );

  function begin(input: BeginInput) {
    const attempt = createAttempt({
      ...input,
      uuid: newId(),
      nowMs: now(),
      attemptNumber: input.kind === 'fixed' ? nextAttemptNumber(attempts, input.testId) : 1,
    });
    save(attempt);
    setScreen({ name: 'run', uuid: attempt.uuid });
  }

  async function onImport(file: File) {
    const result = await readBankFile(file);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (!confirmFn(summarizeBankChange(bank, result.bank))) return;
    await putBank(db, result.bank);
    setBank(result.bank);
    setMessage('Banco importado.');
  }

  async function onExport() {
    const file = buildResultsFile(attempts, new Date(now()));
    if (!file) {
      setMessage('No hay intentos terminados que exportar.');
      return;
    }
    const outcome = await deliverFile(file, nav, download);
    if (outcome === 'cancelled') return;
    const updated = markExported(attempts);
    await putAttempts(db, updated);
    await setMeta(db, 'lastExport', new Date(now()).toISOString());
    setAttempts(updated);
    setMessage(outcome === 'shared' ? 'Resultados compartidos.' : 'Resultados guardados en Archivos.');
  }

  if (!loaded) return <main class="loading">Cargando…</main>;

  const current = 'uuid' in screen ? attempts.find((a) => a.uuid === screen.uuid) : undefined;
  let body: JSX.Element;
  if (screen.name === 'run' && current) {
    body = <Runner attempt={current} now={now} confirmFn={confirmFn} onChange={save} onFinished={onFinished} />;
  } else if (screen.name === 'results' && current) {
    body = <Results attempt={current} onChange={save} onHome={() => setScreen({ name: 'home' })} />;
  } else if (screen.name === 'setup' && bank) {
    const test = screen.testId ? bank.tests.find((t) => t.id === screen.testId) ?? null : null;
    body = (
      <Setup
        bank={bank}
        subject={subject}
        test={test}
        attemptNumber={test ? nextAttemptNumber(attempts, test.id) : 1}
        now={now}
        onBegin={begin}
        onCancel={() => setScreen({ name: 'home' })}
      />
    );
  } else {
    body = (
      <Home
        bank={bank}
        attempts={attempts}
        subject={subject}
        nowMs={now()}
        message={message}
        onSubject={setSubject}
        onOpenTest={(testId) => setScreen({ name: 'setup', testId })}
        onRandom={() => setScreen({ name: 'setup', testId: null })}
        onImport={(file) => void onImport(file)}
        onExport={() => void onExport()}
        onOpenAttempt={(uuid) => setScreen({ name: 'results', uuid })}
      />
    );
  }

  return (
    <>
      {UpdatePrompt && <UpdatePrompt hidden={screen.name === 'run'} />}
      {body}
    </>
  );
}
```

`app/src/ui/UpdatePrompt.tsx`:

```tsx
import { useRegisterSW } from 'virtual:pwa-register/preact';

/** Always mounted (so the service worker registers once); hidden during a test. */
export function UpdatePrompt({ hidden }: { hidden: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh || hidden) return null;
  return (
    <div class="banner update" role="status">
      Actualización lista
      <button type="button" onClick={() => void updateServiceWorker(true)}>Recargar</button>
    </div>
  );
}
```

`app/src/main.tsx`:

```tsx
import { render } from 'preact';
import { App } from './App';
import { openAppDb, requestPersistence } from './storage/db';
import { UpdatePrompt } from './ui/UpdatePrompt';
import './styles.css';

void openAppDb().then((db) => {
  void requestPersistence(navigator);
  render(<App db={db} UpdatePrompt={UpdatePrompt} />, document.getElementById('app') as HTMLElement);
});
```

`app/src/styles.css` (functional baseline; Task 18 restyles it):

```css
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --ok: #4ade80;
  --bad: #f87171;
  --warn: #fbbf24;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom);
}
button {
  font: inherit;
  min-height: 44px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #334155;
  background: var(--surface);
  color: var(--text);
}
button:disabled { opacity: 0.4; }
button[aria-pressed='true'], button[aria-selected='true'] { border-color: var(--accent); background: #0c4a6e; }
.option, .test-row, .history-row { display: block; width: 100%; text-align: left; margin: 6px 0; }
.test-row .id, .test-row .status { display: block; color: var(--muted); font-size: 14px; }
.options { list-style: none; padding: 0; }
.runner-bar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: var(--bg); padding: 8px 0; }
.clock { font-variant-numeric: tabular-nums; font-size: 22px; }
.clock.overtime { color: var(--bad); }
.flags, .runner-nav, .actions, .filters, .tabs, .sync { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 6px; }
.cell.answered { border-color: var(--accent); }
.cell.flagged { border-color: var(--warn); }
.cell.current { outline: 2px solid var(--text); }
.finish, .primary { background: var(--accent); color: #0f172a; border: none; }
.banner { padding: 10px 12px; border-radius: 10px; background: var(--surface); }
.banner.warn { border: 1px solid var(--warn); }
.review { border-top: 1px solid #334155; padding: 12px 0; }
.review .correct { color: var(--ok); }
.review .chosen-wrong { color: var(--bad); text-decoration: line-through; }
.cite, .hook { color: var(--muted); font-size: 15px; }
.pass { color: var(--ok); }
.fail { color: var(--bad); }
.import input { display: block; }
```

- [ ] **Step 4: Run all tests, type-check and build**

Run: `cd app && npx vitest run && npm run build`
Expected: all tests pass; `tsc` clean; `dist/` contains `index.html`, `manifest.webmanifest`, `sw.js`.

- [ ] **Step 5: Manual smoke test in the browser**

Run: `cd app && npm run dev`, open the printed URL, import `~/Documents/controlador/Primer Examen/app-sync/bank.json`, take two questions of `SYN-T4-001` in Practice mode, finish, review, export (the download fallback is used on desktop). Confirm the downloaded `results-*.json` has one attempt with `mode: "practice"`. Do not run `import_results.py` on this file.

- [ ] **Step 6: Propose commit**

```
feat(app): wire app shell with persistence, resume, import and export
```

---

### Task 18: Visual design pass

**Files:**
- Modify: `app/src/styles.css`, class names in `app/src/ui/*.tsx` only where styling requires it.

**Interfaces:**
- Consumes: the finished screens.
- Produces: no behaviour change. Every existing test must still pass unchanged.

- [ ] **Step 1: Invoke `ui-ux-pro-max`, then dispatch the `designer` agent**

Brief for the designer: mobile-first iPhone 16 (393×852 pt), dark theme, large touch targets (≥ 44 pt), safe-area insets, readable long Spanish text for stems and explanations, clear states for selected / correct / wrong / doubt / stuck, an unmistakable clock with overtime state, no layout shift when the clock ticks (tabular numbers). Must not change functional logic, accessible names, or text content used by tests.

- [ ] **Step 2: Verify nothing broke**

Run: `cd app && npx vitest run && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 3: Screenshot check**

Using Playwright at 393×852, capture Home, Setup, Runner (with overtime in Practice mode), and Review; confirm no horizontal scroll and every control is reachable without zooming.

- [ ] **Step 4: Propose commit**

```
style(app): mobile visual design pass
```

---

### Task 19: CI, README, deployment and v1 acceptance

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: the whole repository.
- Produces: a GitHub Pages deployment at `https://<github-user>.github.io/controlador-tests/`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Test and deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
      - name: Repository safety check
        working-directory: tools
        run: uv run python check_repo_safety.py
      - name: Python tests and lint
        working-directory: tools
        run: |
          uv run pytest -q
          uv run ruff check .
          uv run ruff format --check .
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: app/package-lock.json
      - name: App tests and build
        working-directory: app
        run: |
          npm ci
          npm test
          npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write `README.md`** (documentation skill applies: title, summary, TOC, prose)

````markdown
# controlador-tests

A private, offline practice-test app for the ENAIRE controller exam that runs on the iPhone home
screen, plus the Mac tools that feed it questions and register its results in the study Excel.
This README explains what the project is, how the phone and the Mac exchange data, the everyday
commands, and the rules that keep personal data out of this public repository.

## Table of Contents

- [What it is](#what-it-is)
- [How data moves](#how-data-moves)
- [Everyday use](#everyday-use)
  - [Sending new questions to the phone](#sending-new-questions-to-the-phone)
  - [Registering results from the phone](#registering-results-from-the-phone)
- [Development](#development)
- [What must never be committed](#what-must-never-be-committed)
- [References](#references)

## What it is

The app is a Progressive Web App: a website that, once added to the iPhone home screen, opens
full-screen and works with no connection. It runs timed tests in Exam mode (hard stop) or Practice
mode (soft limit with pause), records answers, doubt and "stuck" marks and the time spent on each
question, and shows the reasoned solutions at the end. Nothing is stored online: questions and
results live on the phone and on the Mac.

## How data moves

Two JSON files travel by AirDrop. `bank.json` goes from the Mac to the phone and contains the
questions. `results.json` goes from the phone to the Mac and contains every finished attempt. The
Mac keeps a ledger of attempts already registered, so exporting everything every time is safe:
nothing is ever registered twice. Both files live in `Primer Examen/app-sync/`, outside this
repository.

## Everyday use

### Sending new questions to the phone

```bash
cd tools && uv run python build_bank.py
```

The build checks every test against its archived key and stops at the first inconsistency. AirDrop
`app-sync/bank.json` to the phone, then tap **Importar banco** and pick it in Files › Downloads.

### Registering results from the phone

Tap **Exportar resultados** and AirDrop the file to the Mac; it lands in `~/Downloads`. Then:

```bash
cd tools && uv run python import_results.py
```

The tool lists the new attempts, asks for confirmation, writes one ficha per attempt into the
vault and runs `registrar.py` on each. If registration fails, that attempt is left unregistered and
the next run retries it.

## Development

The app lives in `app/` (Preact, TypeScript, Vite): `npm install`, `npm run dev`, `npm test`,
`npm run build`. The Mac tools live in `tools/` (Python, uv): `uv sync`, `uv run pytest`,
`uv run ruff check .`. Every push to `main` runs all tests and the safety check, then deploys the
app to GitHub Pages. The design is in `docs/superpowers/specs/` and the build plan in
`docs/superpowers/plans/`.

## What must never be committed

This repository is public, so it contains application code only. `bank*.json`, `results*.json` and
any Markdown file with a `TEST` or `CLAVE` section are ignored by git and rejected by
`tools/check_repo_safety.py`, which also runs in CI. The only exceptions are the invented fixtures
in `tools/tests/fixtures/` and the design documents in `docs/superpowers/`.

## References

- Design spec: `docs/superpowers/specs/2026-10-13-controlador-tests-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-13-controlador-tests-v1.md`
- Material and naming conventions: `Primer Examen/Temario/LEEME.md`
- Ficha fields: `Primer Examen/Temario/GUIA-REGISTRO.md`
````

- [ ] **Step 3: Verify locally**

Run: `cd tools && uv run python check_repo_safety.py && uv run pytest -q && cd ../app && npm test && npm run build`
Expected: safety check passed; all tests pass; build succeeds.

- [ ] **Step 4: Propose commit**

```
ci: add test-and-deploy workflow and project README
```

- [ ] **Step 5: Deployment — user-gated (stop and ask before each command)**

Publishing is outward-facing and pushing is always the user's decision. Present these commands
to the user and run each one only after explicit approval:

1. User logs in to personal GitHub: `! gh auth login --hostname github.com`
2. Create the public repo (no push yet): `GH_HOST=github.com gh repo create controlador-tests --public --source . --remote origin`
3. Confirm the remote is github.com: `git remote get-url origin` → must start with `https://github.com/`.
4. Enable Pages with Actions as the source: `GH_HOST=github.com gh api -X POST repos/{owner}/controlador-tests/pages -f build_type=workflow`
5. **The user pushes**: `git push -u origin main`
6. Watch the run: `GH_HOST=github.com gh run watch` → both jobs green; the printed `page_url` serves the app.

- [ ] **Step 6: v1 acceptance (spec §8 and §7.4) — with the user, on the iPhone**

1. Safari → `https://<user>.github.io/controlador-tests/` → Share → Add to Home Screen.
2. AirDrop `app-sync/bank.json`; Importar banco; the summary says 9 tests, 200 questions.
3. Airplane mode on, close the app fully, reopen: it loads and a test starts.
4. Exam mode: close the app mid-test, wait one minute, reopen: same question, the minute counted.
5. Take `SYN-T4-001` for real in Exam mode; tag causes on the review screen.
6. Exportar resultados → AirDrop to the Mac → `cd tools && uv run python import_results.py` → confirm.
7. Open `Teoria_Maestro_v1.xlsx`: `SYN-T4-001` row present with time, doubts and causes; its ficha in `20-REGISTRO/fichas/` was filled in place, not duplicated, and nothing was edited by hand.
8. Push a trivial app change; on next launch the update banner appears on Home and never during a test.
