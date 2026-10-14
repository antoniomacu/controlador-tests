# English Subject Implementation Plan

This plan implements the approved English-subject design in nine test-driven tasks: the English
parser and the version-2 bank on the Mac side, per-subject profiles and routing for the importer,
then the app's version-2 bank, grouped random practice, per-subject causes, the subject in exports,
and finally deployment and acceptance on the iPhone.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make English tests buildable, playable (with random practice by area) and registrable in `Ingles_Maestro_v1.xlsx`, alongside Temario, from one `bank.json`.

**Architecture:** Every question gets a generic `group` (chapter or area) and `ref` (page or anchor) in bank schema 2; the app upgrades schema-1 banks on load. On the Mac, a subject *profile* table holds everything that differs (fichas folder, registrar, Excel, causes, `modo`, `corte`), and the importer routes each attempt by its `subject`.

**Tech Stack:** unchanged from v1 — Python 3.12 + uv + pytest + Ruff; TypeScript + Preact + Vite + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-english-subject-design.md`

## Table of Contents

- [Global Constraints](#global-constraints)
- [Review Focus](#review-focus)
- [File Map](#file-map)
- [Task 1: English solution parser](#task-1-english-solution-parser)
- [Task 2: Bank schema 2 and English build](#task-2-bank-schema-2-and-english-build)
- [Task 3: Subject profiles and per-subject fichas](#task-3-subject-profiles-and-per-subject-fichas)
- [Task 4: Import routing and open-workbook guard](#task-4-import-routing-and-open-workbook-guard)
- [Task 5: App bank schema 2 and upgrade](#task-5-app-bank-schema-2-and-upgrade)
- [Task 6: Sampler by group](#task-6-sampler-by-group)
- [Task 7: Causes by subject, ref in review, subject in export](#task-7-causes-by-subject-ref-in-review-subject-in-export)
- [Task 8: Setup by group and stored-bank upgrade](#task-8-setup-by-group-and-stored-bank-upgrade)
- [Task 9: Real bank, deploy and acceptance](#task-9-real-bank-deploy-and-acceptance)

## Global Constraints

- Branch `feature/english` from `main`. Same git rules as v1: propose the conventional commit at the end of each task; never push without the user; the pre-commit safety hook must pass.
- Neither `registrar.py` (Temario or English), nor any ficha format, nor either Excel workbook is modified. No test opens a real workbook; round trips use temporary copies.
- English areas (closed list, prefix of every English subtipo): `verbal`, `nofin`, `condic`, `modal`, `estruc`, `detpro`, `conpre`, `lexico`, `morfo`, labelled Sistema verbal · Formas no personales · Condicionales e irreales · Modales y perífrasis · Estructura y orden · Determinantes, pronombres y relativos · Conectores y preposiciones · Léxico y colocación · Morfología.
- English causes, verbatim and unaccented: `No conocia la palabra`, `Elegi por como sonaba`, `Confundi dos palabras proximas`, `No conocia la regla`, `Aplique mal la regla`, `Mala lectura del enunciado`, `Dude entre dos opciones`, `Sin tiempo`, `Otro`. Temario causes unchanged.
- English fichas: `modo: Mixto` always; no `corte` field. Temario fichas unchanged.
- Bank: `schema: 2` with `groups`; questions gain `group` (string) and `ref`; `level` optional; English questions have `tema: null`. Schema-1 banks remain readable (upgraded in memory).
- Results format stays `schema: 1`; attempts gain an optional `subject`. Routing falls back to the ID prefix (`SYN-ING-`/`RND-ING-` → English).
- Random English test IDs: `RND-ING-YYYYMMDD-HHMMSS`. Temario random IDs unchanged.
- App UI text in Spanish; UI tasks invoke `ui-ux-pro-max` first.

## Review Focus

1. **A schema-1 bank already stored on the phone when the new app version loads** — the app must keep working (Home lists tests, random practice works) before the user re-imports. Pinned in Task 8.
2. **An English solution block in neither layout** (a third format written by a future generator) — the build must stop naming the file, not emit empty explanations. Pinned in Task 1.
3. **An English attempt exported by the old app version (no `subject` field)** — routed to English by its ID prefix. Pinned in Task 4.
4. **The user tags a Temario cause on an English attempt or vice versa** (e.g. an attempt snapshot from before the update) — the Mac rejects an unknown cause for that subject with a clear message instead of writing a cause the English Excel does not know. Pinned in Task 3.
5. **Excel has the English workbook open while importing Temario-only attempts** — only the workbooks of subjects actually being imported are checked, so an unrelated open workbook does not block the run. Pinned in Task 4.

## File Map

| File | Change |
|---|---|
| `tools/bank_parser.py` | add `EnglishSolution`, `parse_english_solutions` |
| `tools/build_bank.py` | schema 2, `group`/`ref` on Temario questions, `build_english_test`, `groups`, English CLI paths |
| `tools/profiles.py` (new) | `Profile`, `TEMARIO`, `INGLES`, `subject_of` |
| `tools/ficha.py` | `build_fields(..., profile)`; causes, `modo`, `corte` from the profile |
| `tools/import_results.py` | `Route` per subject, routing, `workbook_open`, guard |
| `tools/tests/fixtures/SYN-ING-901.md`, `SYN-ING-902.md`, `claves-ing/`, `fichas-ing/` (new) | invented English fixtures |
| `app/src/domain/types.ts` | `group`, `ref`, optional `level`, `tema: number \| null`, `groups`, per-subject causes, `subject` on export |
| `app/src/domain/bank.ts` | `upgradeBank`, schema 1/2 validation |
| `app/src/domain/sampler.ts` | group-based API, `randomTestId(subject, groups, date)` |
| `app/src/domain/attempts.ts` | export `subject` |
| `app/src/ui/Results.tsx`, `Setup.tsx`, `App.tsx` | causes by subject, `ref`, group labels, upgrade stored bank |

---

### Task 1: English solution parser

**Files:**
- Modify: `tools/bank_parser.py` (append)
- Create: `tools/tests/fixtures/SYN-ING-901.md` (legacy layout), `tools/tests/fixtures/SYN-ING-902.md` (modern layout)
- Test: `tools/tests/test_bank_parser_english.py`

**Interfaces:**
- Consumes: `split_sections`, `QUESTION_RE`, `ParseError`.
- Produces: `AREAS: tuple[str, ...]`; `@dataclass EnglishSolution(number: int, answer: str, level: str | None, subtipo: str | None, ref: str | None, explanation: str)`; `parse_english_solutions(section: str) -> dict[int, EnglishSolution]`.

- [ ] **Step 1: Create the invented fixtures**

`tools/tests/fixtures/SYN-ING-901.md`:

````markdown
# SYN-ING-901 — Inglés, legado de prueba

## TEST

**1.** Her writing was almost _______________.

a) illegible
b) unlegible
c) inlegible
d) dislegible

**2.** He _______________ me the way.

a) said
b) told
c) spoke
d) stated

## CLAVE

```
AB
```

## SOLUCIONES RAZONADAS

Cada solución lleva su ancla.

---

**1. a) illegible** · N1 · `morfo-prefijo-negativo` · [ancla: ING-18-003 Q33]

Prefijo il- ante l.

---

**2. b) told** · N2 · `lexico-colocacion-verbo` · [ancla: ING-26-001 Q57]

*Tell* lleva persona.

## Cómo registrarlo

Texto.
````

`tools/tests/fixtures/SYN-ING-902.md`:

````markdown
---
id: SYN-ING-902
preguntas: 2
tiempo: 2 min
aprobado_referencia: 1/2
---

# SYN-ING-902 — Inglés, moderno de prueba

## TEST

**1.** Prices _______________ last winter.

a) rose
b) risen
c) raise
d) raised

**2.** The report was _______________ with the data.

a) unconsistent
b) inconsistent
c) disconsistent
d) misconsistent

## CLAVE

```
AB
```

## SOLUCIONES RAZONADAS

### 1. a) rose

> *Prices _______ last winter.*

**Ancla:** `ING-24-002 Q67` (respuesta *risen*) · `morfo-rise-raise-arouse`.

**La regla.** *Rise* es intransitivo.

---

### 2. b) inconsistent

> *The report was _______ with the data.*

**Ancla:** `morfo-prefijo-negativo` · n = 11 en el corpus.

**La regla.** in- ante c.
````

- [ ] **Step 2: Write the failing tests**

`tools/tests/test_bank_parser_english.py`:

```python
from pathlib import Path

import pytest

from bank_parser import ParseError, parse_english_solutions, split_sections

FIX = Path(__file__).parent / "fixtures"


def sols(name):
    text = (FIX / name).read_text(encoding="utf-8")
    return parse_english_solutions(split_sections(text)["SOLUCIONES RAZONADAS"])


def test_legacy_layout():
    s = sols("SYN-ING-901.md")
    assert sorted(s) == [1, 2]
    assert (s[1].answer, s[1].level, s[1].subtipo, s[1].ref) == (
        "a", "N1", "morfo-prefijo-negativo", "ING-18-003 Q33",
    )
    assert s[2].explanation == "*Tell* lleva persona."


def test_modern_layout_with_exam_anchor():
    s = sols("SYN-ING-902.md")
    one = s[1]
    assert (one.answer, one.level, one.subtipo, one.ref) == (
        "a", None, "morfo-rise-raise-arouse", "ING-24-002 Q67",
    )
    assert one.explanation.startswith("**Ancla:**")
    assert "> *Prices" not in one.explanation  # quoted stem dropped
    assert "**La regla.**" in one.explanation


def test_modern_layout_without_exam_anchor_uses_subtipo_as_ref():
    two = sols("SYN-ING-902.md")[2]
    assert (two.answer, two.subtipo, two.ref) == ("b", "morfo-prefijo-negativo", "morfo-prefijo-negativo")


def test_unknown_layout_is_an_error():
    section = "Intro.\n\n---\n\n**Solución 1:** a\n\nTexto.\n"
    with pytest.raises(ParseError, match="no English solution blocks"):
        parse_english_solutions(section)


def test_duplicate_number_is_an_error():
    block = "### 1. a) x\n\n**Ancla:** `lexico-x`.\n"
    with pytest.raises(ParseError, match="solution 1 appears twice"):
        parse_english_solutions(f"{block}\n---\n\n{block}")
```

- [ ] **Step 3: Run to verify failure**

Run: `uv --directory tools run pytest tests/test_bank_parser_english.py -q`
Expected: FAIL — `ImportError: cannot import name 'parse_english_solutions'`.

- [ ] **Step 4: Implement** (append to `tools/bank_parser.py`)

```python
AREAS = ("verbal", "nofin", "condic", "modal", "estruc", "detpro", "conpre", "lexico", "morfo")
AREA_SUBTIPO_RE = re.compile(rf"^(?:{'|'.join(AREAS)})-[a-z0-9-]+$")
EN_LEGACY_RE = re.compile(
    r"^\*\*(\d+)\.\s*([a-d])\)\s*(.*?)\*\*\s*·\s*(N[123])\s*·\s*`([^`]+)`\s*·\s*\[ancla:\s*([^\]]+)\]"
)
EN_MODERN_RE = re.compile(r"^###\s+(\d+)\.\s*([a-d])\)\s*(.*)$")
EXAM_ANCHOR_RE = re.compile(r"ING-(?:\d{2}|PR)-\d{3}\s+Q\d+")
BACKTICK_RE = re.compile(r"`([^`]+)`")


@dataclass
class EnglishSolution:
    number: int
    answer: str
    level: str | None
    subtipo: str | None
    ref: str | None
    explanation: str


def _modern_block(number: int, answer: str, body: list[str]) -> EnglishSolution:
    lines = [line for line in body if not line.lstrip().startswith(">")]
    explanation = "\n".join(lines).strip()
    ancla = next((p for p in explanation.split("\n\n") if p.startswith("**Ancla:**")), "")
    subtipo = next((t for t in BACKTICK_RE.findall(ancla) if AREA_SUBTIPO_RE.match(t)), None)
    exam = EXAM_ANCHOR_RE.search(ancla)
    ref = " ".join(exam.group(0).split()) if exam else subtipo
    return EnglishSolution(number, answer, None, subtipo, ref, explanation)


def parse_english_solutions(section: str) -> dict[int, EnglishSolution]:
    """Parse English ``## SOLUCIONES RAZONADAS`` in the legacy or the modern layout.

    Legacy (``SYN-ING-001``): ``**1. a) illegible** · N1 · `subtipo` · [ancla: ING-18-003 Q33]``.
    Modern (``SYN-ING-002``+): ``### 1. a) rose`` heading, a quoted stem, then an ``**Ancla:**``
    paragraph holding the area-prefixed subtipo and, when there is one, the exam anchor.
    """
    solutions: dict[int, EnglishSolution] = {}
    for block in re.split(r"^---\s*$", section, flags=re.MULTILINE):
        lines = block.strip().splitlines()
        if not lines:
            continue
        head = lines[0].strip()
        legacy = EN_LEGACY_RE.match(head)
        modern = EN_MODERN_RE.match(head)
        if legacy:
            number = int(legacy.group(1))
            solution = EnglishSolution(
                number,
                legacy.group(2),
                legacy.group(4),
                legacy.group(5),
                " ".join(legacy.group(6).split()),
                "\n".join(lines[1:]).strip(),
            )
        elif modern:
            number = int(modern.group(1))
            solution = _modern_block(number, modern.group(2), lines[1:])
        else:
            continue
        if number in solutions:
            raise ParseError(f"solution {number} appears twice")
        solutions[number] = solution
    if not solutions:
        raise ParseError("no English solution blocks in a known layout")
    return solutions
```

- [ ] **Step 5: Verify, lint, propose commit**

Run: `uv --directory tools run pytest -q && uv --directory tools run ruff format . && uv --directory tools run ruff check .`
Expected: all pass; Ruff clean.
Commit: `feat(tools): parse English solutions in legacy and modern layouts`

---

### Task 2: Bank schema 2 and English build

**Files:**
- Modify: `tools/build_bank.py`
- Create: `tools/tests/fixtures/claves-ing/SYN-ING-901.txt` (`AB`), `claves-ing/SYN-ING-902.txt` (`AB`), `fichas-ing/SYN-ING-902.md`
- Test: `tools/tests/test_build_bank.py` (update), `tools/tests/test_build_bank_english.py` (new)

**Interfaces:**
- Consumes: Task 1, existing parser helpers.
- Produces: `AREA_LABELS: dict[str, str]`; `build_english_test(test_id, text, key_file, subtipos) -> tuple[dict, list[dict]]`; `build_bank(sinteticos, claves, fichas, built, ingles=None) -> dict` where `ingles` is `(sinteticos, claves, fichas)` or `None`; bank has `schema: 2`, `groups`; every question has `group`, `ref`; English questions `subject: "ingles"`, `tema: None`, `hook: None`; English tests `scope: "ING"`. CLI adds `--ingles-sinteticos`, `--ingles-claves`, `--ingles-fichas` (defaults to the real paths).

- [ ] **Step 1: Fixtures**

`claves-ing/SYN-ING-901.txt` → `AB`; `claves-ing/SYN-ING-902.txt` → `AB`.
`fichas-ing/SYN-ING-902.md`:

```markdown
---
id:            SYN-ING-902
subtipos:      1: morfo-rise-raise-arouse; 2: lexico-sinonimo-preciso
---
```

- [ ] **Step 2: Write the failing tests**

Append to `tools/tests/test_build_bank.py`:

```python
def test_temario_questions_carry_group_and_ref():
    _, questions = build_test("SYN-T9-001", MODERN, ["c", "a"], {})
    assert (questions[0]["group"], questions[0]["ref"]) == ("9", "T9, pág. 3")


def test_bank_is_schema_2_with_temario_group_labels(tmp_path):
    syn = tmp_path / "syn"
    syn.mkdir()
    (syn / "SYN-T9-001.md").write_text(MODERN, encoding="utf-8")
    bank = build_bank(syn, FIX / "claves", FIX / "fichas", "x")
    assert bank["schema"] == 2
    assert bank["groups"]["temario"] == {"9": "Tema 9: Prueba"}
```

`tools/tests/test_build_bank_english.py`:

```python
from pathlib import Path

import pytest

from bank_parser import ParseError
from build_bank import build_bank, build_english_test

FIX = Path(__file__).parent / "fixtures"
LEGACY = (FIX / "SYN-ING-901.md").read_text(encoding="utf-8")
MODERN = (FIX / "SYN-ING-902.md").read_text(encoding="utf-8")
REAL_ING = Path("~/Documents/controlador/Primer Examen/Ingles/tests/SINTETICOS").expanduser()
REAL_IVAULT = Path("~/Documents/TheMind/ATC/ingles/20-REGISTRO").expanduser()


def test_legacy_english_test():
    test, qs = build_english_test("SYN-ING-901", LEGACY, ["a", "b"], {})
    assert (test["subject"], test["scope"], test["limit_min"], test["pass_ref"]) == ("ingles", "ING", 2, 1)
    assert test["title"] == "Inglés, legado de prueba"
    q = qs[0]
    assert (q["subject"], q["tema"], q["group"], q["ref"], q["level"]) == (
        "ingles", None, "morfo", "ING-18-003 Q33", "N1",
    )
    assert qs[1]["group"] == "lexico"


def test_ficha_subtipos_take_priority():
    _, qs = build_english_test("SYN-ING-902", MODERN, ["a", "b"], {2: "lexico-sinonimo-preciso"})
    assert (qs[1]["subtipo"], qs[1]["group"]) == ("lexico-sinonimo-preciso", "lexico")
    assert qs[1]["ref"] == "morfo-prefijo-negativo"  # anchor text unchanged by the ficha


def test_key_mismatch_aborts():
    with pytest.raises(ParseError, match="SYN-ING-902: CLAVE section disagrees"):
        build_english_test("SYN-ING-902", MODERN, ["a", "c"], {})


def test_question_without_area_aborts():
    broken = MODERN.replace("`morfo-prefijo-negativo`", "`sin-area`")
    with pytest.raises(ParseError, match="SYN-ING-902 question 2: no subtipo with a valid area"):
        build_english_test("SYN-ING-902", broken, ["a", "b"], {})


def test_bank_with_both_subjects(tmp_path):
    t, i = tmp_path / "t", tmp_path / "i"
    t.mkdir()
    i.mkdir()
    for name in ("SYN-ING-901.md", "SYN-ING-902.md"):
        (i / name).write_text((FIX / name).read_text(encoding="utf-8"), encoding="utf-8")
    bank = build_bank(t, FIX / "claves", FIX / "fichas", "x",
                      ingles=(i, FIX / "claves-ing", FIX / "fichas-ing"))
    assert [x["id"] for x in bank["tests"]] == ["SYN-ING-901", "SYN-ING-902"]
    assert bank["groups"]["ingles"] == {"lexico": "Léxico y colocación", "morfo": "Morfología"}


@pytest.mark.skipif(not REAL_ING.exists(), reason="real English tests not here")
def test_all_real_english_tests_build(tmp_path):
    empty = tmp_path / "none"
    empty.mkdir()
    bank = build_bank(empty, empty, empty, "now",
                      ingles=(REAL_ING, REAL_IVAULT / "claves", REAL_IVAULT / "fichas"))
    assert len(bank["tests"]) >= 4
    for q in bank["questions"]:
        assert q["explanation"] and q["group"] and q["ref"], q["id"]
```

- [ ] **Step 3: Run to verify failure**

Run: `uv --directory tools run pytest -q`
Expected: the new tests FAIL (`build_english_test` missing; no `group`/`groups`).

- [ ] **Step 4: Implement**

In `tools/build_bank.py`:
1. Import `AREAS, parse_english_solutions` from `bank_parser`.
2. Add constants:

```python
IROOT = ROOT / "Ingles/tests/SINTETICOS"
IVAULT = Path("~/Documents/TheMind/ATC/ingles/20-REGISTRO").expanduser()
AREA_LABELS = {
    "verbal": "Sistema verbal", "nofin": "Formas no personales",
    "condic": "Condicionales e irreales", "modal": "Modales y perífrasis",
    "estruc": "Estructura y orden", "detpro": "Determinantes, pronombres y relativos",
    "conpre": "Conectores y preposiciones", "lexico": "Léxico y colocación",
    "morfo": "Morfología",
}  # fmt: skip
```

3. In `build_test`, add `"group": str(tema), "ref": solution.cite,` to each question entry. The test dict is unchanged: chapter labels for the `groups` table are taken in `build_bank` from the titles of single-chapter tests (step 5).
4. Add:

```python
def build_english_test(
    test_id: str, text: str, key_file: list[str], subtipos: dict[int, str]
) -> tuple[dict, list[dict]]:
    """Parse and cross-check one English synthetic test; same guarantees as ``build_test``."""
    front = parse_front_matter(text)
    sections = split_sections(text)
    try:
        questions = parse_questions(_required_section(sections, "TEST", test_id))
        key = parse_key(_required_section(sections, "CLAVE", test_id))
        solutions = parse_english_solutions(
            _required_section(sections, "SOLUCIONES RAZONADAS", test_id)
        )
    except ParseError as error:
        if str(error).startswith(test_id):
            raise
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

    entries: list[dict] = []
    for question in questions:
        sol = solutions[question.number]
        if sol.answer != key[question.number - 1]:
            raise ParseError(
                f"{test_id} question {question.number}: solution says {sol.answer}, "
                f"key says {key[question.number - 1]}"
            )
        subtipo = subtipos.get(question.number) or sol.subtipo
        area = (subtipo or "").split("-", 1)[0]
        if area not in AREAS:
            raise ParseError(
                f"{test_id} question {question.number}: no subtipo with a valid area prefix"
            )
        entries.append(
            {
                "id": f"{test_id}#{question.number}",
                "subject": "ingles",
                "tema": None,
                "group": area,
                "stem": question.stem,
                "options": question.options,
                "answer": sol.answer,
                "level": sol.level,
                "subtipo": subtipo,
                "ref": sol.ref or subtipo,
                "explanation": sol.explanation,
                "hook": None,
            }
        )
    test = {
        "id": test_id,
        "subject": "ingles",
        "scope": "ING",
        "title": parse_title(text) or test_id,
        "questions": [e["id"] for e in entries],
        "limit_min": _leading_int(front.get("tiempo")) or n,
        "pass_ref": _leading_int(front.get("aprobado_referencia")) or n // 2,
        "synthetic": True,
    }
    return test, entries
```

5. Rewrite `build_bank`:

```python
def _collect(sinteticos, claves, fichas, pattern, builder, tests, questions):
    for path in sorted(sinteticos.glob(pattern)):
        test_id = path.stem
        key_path = claves / f"{test_id}.txt"
        if not key_path.exists():
            raise ParseError(f"{test_id}: no key file at {key_path}")
        test, entries = builder(
            test_id,
            path.read_text(encoding="utf-8"),
            parse_key_file(key_path.read_text(encoding="utf-8")),
            _subtipos_from_ficha(fichas / f"{test_id}.md"),
        )
        tests.append(test)
        questions.extend(entries)


def build_bank(
    sinteticos: Path, claves: Path, fichas: Path, built: str,
    ingles: tuple[Path, Path, Path] | None = None,
) -> dict:
    """Build the bank (schema 2) from Temario ``SYN-T*`` and, optionally, English ``SYN-ING-*``."""
    tests: list[dict] = []
    questions: list[dict] = []
    _collect(sinteticos, claves, fichas, "SYN-T*.md", build_test, tests, questions)
    if ingles is not None:
        _collect(*ingles, "SYN-ING-*.md", build_english_test, tests, questions)
    groups: dict[str, dict[str, str]] = {"temario": {}, "ingles": {}}
    for test in tests:
        if test["subject"] == "temario" and len(temas_of_scope(test["scope"])) == 1:
            groups["temario"][test["scope"][1:]] = test["title"]
    for q in questions:
        if q["subject"] == "temario":
            groups["temario"].setdefault(q["group"], f"Tema {q['group']}")
        else:
            groups["ingles"][q["group"]] = AREA_LABELS[q["group"]]
    return {"schema": 2, "built": built, "groups": groups, "questions": questions, "tests": tests}
```

(The Temario glob changes from `SYN-*.md` to `SYN-T*.md` so English files placed in the same folder by mistake are not parsed as Temario.)

6. In `main`, add `--ingles-sinteticos` (default `IROOT`), `--ingles-claves` (default `IVAULT / "claves"`), `--ingles-fichas` (default `IVAULT / "fichas"`), pass `ingles=(...)`, and print per-subject totals: `Wrote …: T tests (temario X, ingles Y), Q questions.` plus per-group counts.

- [ ] **Step 5: Verify, lint, build the real bank, propose commit**

Run: `uv --directory tools run pytest -q && uv --directory tools run ruff format . && uv --directory tools run ruff check . && uv --directory tools run python build_bank.py`
Expected: all pass (the real English test builds every `SYN-ING-*` present); the real build prints both subjects. If a real English file fails a cross-check, report it — do not weaken the check.
Commit: `feat(tools): build schema-2 bank with English tests and group labels`

---

### Task 3: Subject profiles and per-subject fichas

**Files:**
- Create: `tools/profiles.py`
- Modify: `tools/ficha.py`
- Test: `tools/tests/test_profiles.py` (new), `tools/tests/test_ficha.py` (update)

**Interfaces:**
- Produces: `@dataclass(frozen=True) Profile(subject: str, causes: tuple[str, ...], fixed_modo: str | None, corte: str | None, fichas: Path, registrar: Path, excel: Path)`; `TEMARIO`, `INGLES`, `PROFILES: dict[str, Profile]`; `subject_of(attempt: dict) -> str`. `ficha.CAUSES` stays as an alias of `TEMARIO.causes`. `build_fields(attempt, subtipos_by_q, profile=TEMARIO)`.

- [ ] **Step 1: Failing tests**

`tools/tests/test_profiles.py`:

```python
from profiles import INGLES, TEMARIO, subject_of


def test_subject_from_field_or_prefix():
    assert subject_of({"subject": "ingles", "test_id": "X"}) == "ingles"
    assert subject_of({"test_id": "SYN-ING-004"}) == "ingles"
    assert subject_of({"test_id": "RND-ING-20261014-203015"}) == "ingles"
    assert subject_of({"test_id": "SYN-T4-001"}) == "temario"


def test_profiles_differ_where_the_registries_differ():
    assert INGLES.fixed_modo == "Mixto" and INGLES.corte is None
    assert TEMARIO.fixed_modo is None and TEMARIO.corte == "50"
    assert "Aplique mal la regla" in INGLES.causes
    assert "Confundí dos conceptos" in TEMARIO.causes
    assert INGLES.excel.name == "Ingles_Maestro_v1.xlsx"
```

Append to `tools/tests/test_ficha.py`:

```python
from profiles import INGLES


def test_english_fields_use_english_rules():
    attempt = make_attempt(test_id="SYN-ING-004")
    attempt["items"][1]["cause"] = "Aplique mal la regla"
    attempt["items"][3]["cause"] = None
    attempt["items"][4]["cause"] = None
    fields = build_fields(attempt, {}, INGLES)
    assert fields["modo"] == "Mixto"
    assert "corte" not in fields
    assert fields["causas"] == "2: Aplique mal la regla"


def test_temario_cause_on_english_attempt_is_rejected():
    attempt = make_attempt(test_id="SYN-ING-004")
    with pytest.raises(FichaError, match="unknown cause 'Confundí dos conceptos' for ingles"):
        build_fields(attempt, {}, INGLES)
```

- [ ] **Step 2: Run to verify failure** — `uv --directory tools run pytest -q` → FAIL (`No module named 'profiles'`).

- [ ] **Step 3: Implement**

`tools/profiles.py`:

```python
"""What differs between the Temario and English registries, in one place.

Each subject has its own fichas folder, its own ``registrar.py`` (which writes its own Excel), its
own closed list of failure causes, and slightly different ficha conventions: English fichas are
always ``modo: Mixto`` and carry no ``corte``. The importer looks everything up here, so no other
code needs subject-specific branches.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
ATC = Path("~/Documents/TheMind/ATC").expanduser()


@dataclass(frozen=True)
class Profile:
    subject: str
    causes: tuple[str, ...]
    fixed_modo: str | None
    corte: str | None
    fichas: Path
    registrar: Path
    excel: Path


TEMARIO = Profile(
    subject="temario",
    causes=(
        "No conocía el dato", "Confundí dos conceptos", "Lo recordaba mal",
        "Mala lectura del enunciado", "Dudé entre dos opciones", "Sin tiempo", "Otro",
    ),
    fixed_modo=None,
    corte="50",
    fichas=ATC / "teoria/20-REGISTRO/fichas",
    registrar=ATC / "teoria/99-SCRIPTS/registrar.py",
    excel=ROOT / "Temario/Teoria_Maestro_v1.xlsx",
)  # fmt: skip

INGLES = Profile(
    subject="ingles",
    causes=(
        "No conocia la palabra", "Elegi por como sonaba", "Confundi dos palabras proximas",
        "No conocia la regla", "Aplique mal la regla", "Mala lectura del enunciado",
        "Dude entre dos opciones", "Sin tiempo", "Otro",
    ),
    fixed_modo="Mixto",
    corte=None,
    fichas=ATC / "ingles/20-REGISTRO/fichas",
    registrar=ATC / "ingles/99-SCRIPTS/registrar.py",
    excel=ROOT / "Ingles/Ingles_Maestro_v1.xlsx",
)  # fmt: skip

PROFILES = {p.subject: p for p in (TEMARIO, INGLES)}


def subject_of(attempt: dict) -> str:
    """The exported ``subject``, or the ID prefix for exports from before it existed."""
    if attempt.get("subject") in PROFILES:
        return attempt["subject"]
    return "ingles" if attempt["test_id"].startswith(("SYN-ING-", "RND-ING-")) else "temario"
```

In `tools/ficha.py`: replace the `CAUSES` tuple with `from profiles import TEMARIO, Profile` and `CAUSES = TEMARIO.causes`; change the signature to `def build_fields(attempt: dict, subtipos_by_q: dict[str, str], profile: Profile = TEMARIO)`; validate causes against `profile.causes` with the message `f"question {number}: unknown cause {cause!r} for {profile.subject}"`; set `"modo": profile.fixed_modo or ("Mixto" if … else "Bloque")`; build the dict, then `if profile.corte is None: fields.pop("corte")` else `fields["corte"] = profile.corte`. Update the existing `test_unknown_cause_is_rejected` match to `"unknown cause 'Inventada' for temario"`.

- [ ] **Step 4: Verify, lint, propose commit** — all pass; Ruff clean. Commit: `feat(tools): add subject profiles and English ficha rules`

---

### Task 4: Import routing and open-workbook guard

**Files:**
- Modify: `tools/import_results.py`
- Test: `tools/tests/test_import_results.py` (update helpers + new tests)

**Interfaces:**
- Produces: `@dataclass Route(fichas: Path, registrar: Path, excel: Path | None)`; `Paths(ledger, archive, bank, routes: dict[str, Route])`; `workbook_open(path: Path) -> bool`; `import_attempts(attempts, paths, runner=run_registrar, is_open=workbook_open) -> list[str]`. The excel checked for a route is `route.excel or PROFILES[subject].excel`.

- [ ] **Step 1: Update the test helpers and add failing tests**

In `tools/tests/test_import_results.py`, replace `make_paths` with:

```python
from import_results import Route


def make_paths(tmp_path: Path, registrar: Path | None = None) -> Paths:
    for name in ("fichas", "fichas-ing", "archive"):
        (tmp_path / name).mkdir(exist_ok=True)
    bank = tmp_path / "bank.json"
    questions = [
        {"id": "SYN-T9-001#1", "subtipo": "t9-uno"},
        {"id": "SYN-T9-001#2", "subtipo": None},
        {"id": "SYN-ING-004#1", "subtipo": "morfo-x"},
    ]
    bank.write_text(json.dumps({"schema": 2, "questions": questions, "tests": []}))
    reg = registrar or tmp_path / "unused.py"
    return Paths(
        ledger=tmp_path / "imported.json",
        archive=tmp_path / "archive",
        bank=bank,
        routes={
            "temario": Route(tmp_path / "fichas", reg, tmp_path / "t.xlsx"),
            "ingles": Route(tmp_path / "fichas-ing", reg, tmp_path / "i.xlsx"),
        },
    )
```

Replace every `paths.fichas` in existing tests with `paths.routes["temario"].fichas`, and in `cli_args` pass `--fichas`, `--ingles-fichas` (`paths.routes["ingles"].fichas`) instead of `--fichas` alone. Pass `is_open=lambda p: False` wherever `import_attempts` or `main` is called (`main(..., runner=..., is_open=...)`). In the real round trip, set `paths.routes["temario"] = Route(tmp_path / "fichas", REAL_REGISTRAR, excel)`.

New tests:

```python
def test_english_attempt_routes_to_english_fichas_and_registrar(tmp_path):
    paths = make_paths(tmp_path)
    seen = []

    def runner(ficha, registrar, excel):
        seen.append((ficha.parent.name, excel.name))
        return subprocess.CompletedProcess([], 0, "", "")

    a = attempt("en", test_id="SYN-ING-004")
    a["subject"] = "ingles"
    import_attempts([a], paths, runner=runner, is_open=lambda p: False)
    assert seen == [("fichas-ing", "i.xlsx")]
    text = (paths.routes["ingles"].fichas / "SYN-ING-004.md").read_text(encoding="utf-8")
    assert "modo:          Mixto\n" in text and "corte:" not in text


def test_old_export_without_subject_routes_by_prefix(tmp_path):
    paths = make_paths(tmp_path)
    calls: list[str] = []
    import_attempts([attempt("old", test_id="SYN-ING-004")], paths,
                    runner=ok_runner(calls), is_open=lambda p: False)
    assert (paths.routes["ingles"].fichas / "SYN-ING-004.md").exists()


def test_paper_registered_english_test_gets_i2(tmp_path):
    paths = make_paths(tmp_path)
    filled = "---\nid:            SYN-ING-004\nrespuestas:    CA\nclave:         CA\n---\n"
    (paths.routes["ingles"].fichas / "SYN-ING-004.md").write_text(filled, encoding="utf-8")
    calls: list[str] = []
    import_attempts([attempt("p", test_id="SYN-ING-004")], paths,
                    runner=ok_runner(calls), is_open=lambda p: False)
    assert calls == ["SYN-ING-004-i2.md"]


def test_open_workbook_stops_before_any_write(tmp_path):
    paths = make_paths(tmp_path)
    with pytest.raises(ResultsError, match="i.xlsx.*abierto en Excel"):
        import_attempts([attempt("e", test_id="SYN-ING-004")], paths,
                        runner=ok_runner([]), is_open=lambda p: p.name == "i.xlsx")
    assert not any(paths.routes["ingles"].fichas.iterdir())


def test_unrelated_open_workbook_does_not_block(tmp_path):
    paths = make_paths(tmp_path)
    registered = import_attempts([attempt()], paths, runner=ok_runner([]),
                                 is_open=lambda p: p.name == "i.xlsx")
    assert registered == ["SYN-T9-001"]


def test_workbook_open_detects_excel_lock_file(tmp_path):
    from import_results import workbook_open

    book = tmp_path / "Libro.xlsx"
    book.write_text("x")
    assert workbook_open(book) is False
    (tmp_path / "~$Libro.xlsx").write_text("lock")
    assert workbook_open(book) is True
```

Add an English round trip, skipped when the English registrar or Excel is absent, mirroring the Temario one: copy `Ingles/Ingles_Maestro_v1.xlsx` to `tmp_path`, set `paths.routes["ingles"] = Route(tmp_path / "fichas-ing", REAL_ING_REGISTRAR, copy)`, import `attempt("rt-en", test_id="SYN-ING-901")` with keys/answers using a valid English cause, and assert `SYN-ING-901` is in column A of the copy's `Nivel Test` sheet.

- [ ] **Step 2: Run to verify failure** — FAIL (`cannot import name 'Route'`).

- [ ] **Step 3: Implement** in `tools/import_results.py`:

```python
from profiles import PROFILES, subject_of


@dataclass
class Route:
    fichas: Path
    registrar: Path
    excel: Path | None


@dataclass
class Paths:
    ledger: Path
    archive: Path
    bank: Path
    routes: dict[str, Route]


def workbook_open(path: Path) -> bool:
    """True when Excel holds the workbook: its ``~$`` lock file exists or ``lsof`` lists it."""
    if (path.parent / f"~${path.name}").exists():
        return True
    if not path.exists():
        return False
    return subprocess.run(["lsof", "-t", str(path)], capture_output=True).returncode == 0


def _guard(attempts: list[dict], paths: Paths, is_open: Callable[[Path], bool]) -> None:
    for subject in sorted({subject_of(a) for a in attempts}):
        route = paths.routes[subject]
        excel = route.excel or PROFILES[subject].excel
        if is_open(excel):
            raise ResultsError(f"{excel.name} está abierto en Excel: ciérralo y vuelve a ejecutar.")
```

Change `renumber(attempt, fichas)` callers and `import_attempts`:

```python
def import_attempts(
    attempts: list[dict], paths: Paths, runner: Runner = run_registrar,
    is_open: Callable[[Path], bool] = workbook_open,
) -> list[str]:
    _guard(attempts, paths, is_open)
    ledger = load_ledger(paths.ledger)
    subtipos = subtipos_by_question(paths.bank)
    registered: list[str] = []
    for original in attempts:
        subject = subject_of(original)
        route, profile = paths.routes[subject], PROFILES[subject]
        attempt = renumber(original, route.fichas)
        ...  # as before, with build_fields(attempt, subtipos, profile),
        ...  # target under route.fichas, runner(target, route.registrar, route.excel)
```

In `main`: add `--ingles-fichas` (default `PROFILES["ingles"].fichas`), `--ingles-registrar` (default `PROFILES["ingles"].registrar`), keep `--fichas`/`--registrar`/`--excel` for Temario, add `--ingles-excel` (default `None`); build `routes`; add an `is_open` parameter to `main` passed through; tag each summary line with the subject (`[temario]`/`[ingles]`); use `renumber(attempt, routes[subject_of(attempt)].fichas)` in the summary.

- [ ] **Step 4: Verify, lint, propose commit** — all pass (both round trips run on the user's Mac); Ruff clean. Commit: `feat(tools): route imports by subject and refuse to write to an open workbook`

---

### Task 5: App bank schema 2 and upgrade

**Files:**
- Modify: `app/src/domain/types.ts`, `app/src/domain/bank.ts`
- Test: `app/tests/domain/bank.test.ts` (update)

**Interfaces:**
- Produces in `types.ts`: `Question.tema: number | null`, `Question.group: string`, `Question.ref?: string | null`, `Question.level?: Level | null`; `Bank { schema: 2; built; groups: Record<Subject, Record<string, string>>; questions; tests }`; `TEMARIO_CAUSES`, `INGLES_CAUSES`, `CAUSES_BY_SUBJECT: Record<Subject, readonly string[]>`, `Cause = (typeof TEMARIO_CAUSES)[number] | (typeof INGLES_CAUSES)[number]`; keep `CAUSES` as an alias of `TEMARIO_CAUSES` until Task 7 removes its uses. In `bank.ts`: `upgradeBank(raw: Obj): Obj` (schema 1 → 2), `validateBank` accepting 1 and 2 and always returning a schema-2 `Bank`.

- [ ] **Step 1: Failing tests** — in `app/tests/domain/bank.test.ts`, make `validBank()` schema 2 (add `group: '4'`, `ref: 'T4, pág. 6'`, `groups: { temario: { '4': 'Tema 4' }, ingles: {} }`) and add:

```ts
it('upgrades a schema-1 bank: group from tema, ref from cite, labels from titles', () => {
  const v1 = { ...validBank(), schema: 1 } as Record<string, unknown>;
  delete v1.groups;
  const qs = (v1.questions as Record<string, unknown>[]).map((q) => {
    const { group: _g, ref: _r, ...rest } = q;
    return rest;
  });
  const result = validateBank({ ...v1, questions: qs });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.bank.schema).toBe(2);
  expect(result.bank.questions[0]).toMatchObject({ group: '4', ref: 'T4, pág. 6' });
  expect(result.bank.groups.temario).toEqual({ '4': 'Tema 4' });
});

it('accepts an English question with no level and no tema', () => {
  const bank = validBank();
  bank.groups.ingles = { morfo: 'Morfología' };
  bank.questions.push({
    id: 'SYN-ING-004#1', subject: 'ingles', tema: null, group: 'morfo', stem: 's',
    options: { a: '1', b: '2', c: '3', d: '4' }, answer: 'a', ref: 'ING-24-002 Q67',
  });
  expect(validateBank(bank).ok).toBe(true);
});

it('rejects a question whose group has no label', () => {
  const bank = validBank();
  bank.questions[0].group = '7';
  expect(validateBank(bank)).toEqual({ ok: false, error: 'Pregunta SYN-T4-001#1: grupo desconocido.' });
});
```

- [ ] **Step 2: Run** — `npm --prefix app test` → FAIL.

- [ ] **Step 3: Implement** — update the types as listed. In `bank.ts`:

```ts
/** Schema 1 → 2: group = chapter, ref = cite, labels from the single-chapter test titles. */
export function upgradeBank(raw: Obj): Obj {
  if (raw.schema !== 1) return raw;
  const questions = (raw.questions as Obj[]).map((q) => ({
    ...q, group: String(q.tema), ref: q.cite ?? null,
  }));
  const temario: Record<string, string> = {};
  for (const t of raw.tests as Obj[]) {
    const m = /^T(\d)$/.exec(String(t.scope));
    if (m) temario[m[1]] = String(t.title);
  }
  for (const q of questions) temario[q.group as string] ??= `Tema ${q.group}`;
  return { ...raw, schema: 2, groups: { temario, ingles: {} }, questions };
}
```

In `validateBank`: after the `attempts` check, `if (raw.schema !== 1 && raw.schema !== 2) return fail(...)`; then `const bank = upgradeBank(raw)`; validate `bank.groups` is an object with `temario`/`ingles` objects; in `questionError`, replace the `tema` check with `if (typeof q.group !== 'string' || !q.group) return 'grupo vacío'`, make the `level` check `if (q.level != null && !['N1','N2','N3'].includes(...))`, and in the loop add `if (!(q.group in groups[q.subject])) return fail(\`Pregunta ${q.id}: grupo desconocido.\`)`. Return `{ ok: true, bank: bank as unknown as Bank }`.

- [ ] **Step 4: Verify** — `npm --prefix app test && npx --prefix app tsc --noEmit -p app` → pass. Fix compile errors in other modules by reading `q.tema ?? 0` only where Tasks 6–7 will replace them. Commit: `feat(app): bank schema 2 with groups and in-memory upgrade of schema 1`

---

### Task 6: Sampler by group

**Files:**
- Modify: `app/src/domain/sampler.ts`
- Test: `app/tests/domain/sampler.test.ts` (rewrite)

**Interfaces:**
- Produces: `groupsOf(questions, subject): string[]` (numeric-aware sort), `availableCount(questions, subject, groups: readonly string[])`, `sampleQuestions(questions, {subject, groups, count, seed})`, `randomTestId(subject: Subject, groups: readonly string[], date: Date)`. `temasOf` is removed.

- [ ] **Step 1: Failing tests** — update the `q()` helper to set `group: String(tema)` and `tema`, add English questions with `group: 'lexico'`/`'morfo'`, and:

```ts
it('lists groups per subject, numerically for chapters', () => {
  expect(groupsOf(pool, 'temario')).toEqual(['1', '2', '3']);
  expect(groupsOf(pool, 'ingles')).toEqual(['lexico', 'morfo']);
});

it('draws English questions only from the chosen areas', () => {
  const drawn = sampleQuestions(pool, { subject: 'ingles', groups: ['morfo'], count: 5, seed: 3 });
  expect(drawn.every((x) => x.group === 'morfo')).toBe(true);
});

it('names random tests per subject', () => {
  const d = new Date(2026, 9, 14, 20, 30, 15);
  expect(randomTestId('temario', ['4', '3'], d)).toBe('RND-T34-20261014-203015');
  expect(randomTestId('ingles', ['morfo', 'lexico'], d)).toBe('RND-ING-20261014-203015');
});
```

Keep the existing seed-reproducibility, cap, no-mutation and count-below-one tests, converted to `groups`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — replace `tema` with `group` in `pick`; `groupsOf` sorts with `(a, b) => a.localeCompare(b, undefined, { numeric: true })`; `randomTestId` builds `RND-T<digits>` for `temario` (digits = sorted groups joined) and `RND-ING` for `ingles`, followed by the existing date/time stamp.
- [ ] **Step 4: Verify** (`npm --prefix app test`); Commit: `feat(app): random practice by group with per-subject test IDs`

---

### Task 7: Causes by subject, ref in review, subject in export

**Files:**
- Modify: `app/src/ui/Results.tsx`, `app/src/domain/attempts.ts`, `app/src/domain/types.ts` (drop the `CAUSES` alias)
- Test: `app/tests/ui/Results.test.tsx`, `app/tests/domain/attempts.test.ts`

**Interfaces:**
- Consumes: `CAUSES_BY_SUBJECT`.
- Produces: review shows `[${q.ref ?? q.cite}]` plus ` · ${q.level}` only when `level` is set; the cause `<select>` lists `CAUSES_BY_SUBJECT[a.subject]`; `ExportAttempt` gains `subject`, and `toResultsFile` includes it.

- [ ] **Step 1: Failing tests**

In `Results.test.tsx` add:

```ts
it('offers the English causes on an English attempt and shows the anchor without level', () => {
  const a = { ...finished(), subject: 'ingles' as const };
  a.questions = a.questions.map((q) => ({ ...q, ref: 'ING-24-002 Q67', level: null, cite: null }));
  render(<Results attempt={a} onChange={vi.fn()} onHome={vi.fn()} />);
  expect(screen.getAllByText('[ING-24-002 Q67]')).toHaveLength(3);
  const options = Array.from(screen.getAllByRole('combobox')[0].querySelectorAll('option'))
    .map((o) => o.textContent);
  expect(options).toContain('Aplique mal la regla');
  expect(options).not.toContain('Confundí dos conceptos');
});
```

In `attempts.test.ts`, extend the export-keys test to expect `'subject'` in the sorted key list and `file.attempts[0].subject === 'temario'`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — in `Results.tsx` import `CAUSES_BY_SUBJECT` and map it for the options; render `{(q.ref ?? q.cite) && <p class="cite">{\`[${q.ref ?? q.cite}]${q.level ? \` · ${q.level}\` : ''}\`}</p>}`. In `attempts.ts` `toExport`, add `subject: a.subject`; add `'subject'` to the `ExportAttempt` `Pick`. Remove the `CAUSES` alias from `types.ts` and fix imports.
- [ ] **Step 4: Verify**; Commit: `feat(app): per-subject causes, anchors in review and subject in exports`

---

### Task 8: Setup by group and stored-bank upgrade

Invoke `ui-ux-pro-max` first.

**Files:**
- Modify: `app/src/ui/Setup.tsx`, `app/src/App.tsx`
- Test: `app/tests/ui/Setup.test.tsx`, `app/tests/App.integration.test.tsx`

**Interfaces:**
- Consumes: `groupsOf`, `availableCount`, `sampleQuestions`, `randomTestId(subject, …)`, `upgradeBank`.
- Produces: random Setup lists one checkbox per group labelled `bank.groups[subject][g] ?? g` with ` (n)` available; the random title is `Práctica aleatoria — ${labels.join(', ')}`; `App` upgrades a stored schema-1 bank on load (`upgradeBank` then `validateBank`).

- [ ] **Step 1: Failing tests**

`Setup.test.tsx`: make the fixture bank schema 2 with `groups: { temario: { '3': 'Tema 3', '4': 'Tema 4' }, ingles: { morfo: 'Morfología' } }` and question `group`s; change `getByLabelText('Tema 3')` to `getByLabelText('Tema 3 (2)')`; add:

```ts
it('offers English areas with labels and builds an RND-ING test', () => {
  const onBegin = vi.fn<(i: BeginInput) => void>();
  render(<Setup bank={bank} subject="ingles" test={null} attemptNumber={1}
    now={now} onBegin={onBegin} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByLabelText('Morfología (1)'));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  expect(onBegin.mock.calls[0][0]).toMatchObject({
    testId: 'RND-ING-20261014-203015', kind: 'random', title: 'Práctica aleatoria — Morfología',
  });
});
```

`App.integration.test.tsx`: add

```ts
it('keeps working with a schema-1 bank stored before the update', async () => {
  const v1 = { ...bank, schema: 1 } as Record<string, unknown>;
  delete v1.groups;
  v1.questions = bank.questions.map(({ group: _g, ref: _r, ...q }) => ({ ...q, cite: 'T4, pág. 1' }));
  await putBank(db, v1 as never);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Práctica aleatoria' }));
  fireEvent.click(screen.getByLabelText(/Tema 4/));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  expect(await screen.findByText(/Enunciado/)).toBeTruthy();
});
```

and update the integration fixture bank to schema 2 (`group: '4'`, `groups`).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — Setup uses `groupsOf` and labels; App's startup does `const stored = await getBank(db); const checked = stored ? validateBank(stored) : null; setBank(checked && checked.ok ? checked.bank : null)`.
- [ ] **Step 4: Verify** — `npm --prefix app test && npm --prefix app run build`. Commit: `feat(app): group-based random setup and upgrade of a stored schema-1 bank`

---

### Task 9: Real bank, deploy and acceptance

**Files:**
- Modify: `app/tests/domain/realBank.test.ts` (assert both subjects), `README.md` (English sections), `HANDOFF.md` is not committed.

- [ ] **Step 1: Failing test** — in `realBank.test.ts`, also assert `result.bank.tests.some((t) => t.subject === 'ingles')` and that every English question's `group` is in `bank.groups.ingles`. Run after rebuilding the real bank (`uv --directory tools run python build_bank.py`); it fails before Task 2's real build and passes after.
- [ ] **Step 2: README** — document English in "Everyday use" (where English tests live, that `build_bank.py` now builds both subjects, that the importer routes English to the English Excel and refuses to run while either workbook is open). Follow the documentation skill.
- [ ] **Step 3: Verify everything** — safety check, `uv --directory tools run pytest -q`, `npm --prefix app test`, `npm --prefix app run build`.
- [ ] **Step 4: Final whole-branch review** (fresh reviewer, Opus), one fix pass, then merge `feature/english` into `main` with `--no-ff` and **ask the user to push**; watch the Actions run until the deploy is green.
- [ ] **Step 5: Acceptance with the user** — AirDrop the new `bank.json`; Importar banco shows both subjects; the Inglés tab lists the English tests; random practice by area works; the user takes one English test for real, exports, and `import_results.py` registers it in `Ingles_Maestro_v1.xlsx` with its ficha filled in.
