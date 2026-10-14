# English Subject — Design Specification

This document specifies how controlador-tests gains its second subject, English (*Inglés*): the
synthetic English tests appear in the app's Inglés tab, can be taken and reviewed like Temario
tests, can be drawn at random by grammatical or lexical **area**, and their results are registered
in the English study registry (`Ingles_Maestro_v1.xlsx`) through the English fichas and the English
`registrar.py`, without modifying either. It covers the decisions taken and why, the new bank format
(version 2), the English parser, the app changes, the Mac-side routing by subject, the testing
strategy and the definition of done. Each section was approved by the user in a brainstorming
session on 2026-10-14; the v1 design it extends is
`docs/superpowers/specs/2026-10-13-controlador-tests-design.md`.

## Table of Contents

- [1. Purpose and context](#1-purpose-and-context)
  - [1.1 What changes for the user](#11-what-changes-for-the-user)
  - [1.2 What the English material looks like](#12-what-the-english-material-looks-like)
  - [1.3 How English results are registered today](#13-how-english-results-are-registered-today)
- [2. Decisions taken and why](#2-decisions-taken-and-why)
  - [2.1 Random practice by area](#21-random-practice-by-area)
  - [2.2 One generic group per question](#22-one-generic-group-per-question)
- [3. Bank format version 2](#3-bank-format-version-2)
  - [3.1 New and changed fields](#31-new-and-changed-fields)
  - [3.2 The groups table](#32-the-groups-table)
  - [3.3 Compatibility with version 1](#33-compatibility-with-version-1)
- [4. The English parser](#4-the-english-parser)
  - [4.1 What is shared with Temario](#41-what-is-shared-with-temario)
  - [4.2 The two solution layouts](#42-the-two-solution-layouts)
  - [4.3 Subtipo, group and reference](#43-subtipo-group-and-reference)
  - [4.4 Cross-checks](#44-cross-checks)
- [5. App changes](#5-app-changes)
  - [5.1 Random practice by group](#51-random-practice-by-group)
  - [5.2 Causes by subject](#52-causes-by-subject)
  - [5.3 Review screen](#53-review-screen)
  - [5.4 Home](#54-home)
  - [5.5 Exported attempts carry their subject](#55-exported-attempts-carry-their-subject)
- [6. Mac import routing](#6-mac-import-routing)
  - [6.1 Subject profiles](#61-subject-profiles)
  - [6.2 Routing an attempt](#62-routing-an-attempt)
  - [6.3 Open-workbook guard](#63-open-workbook-guard)
- [7. Testing strategy](#7-testing-strategy)
- [8. Definition of done](#8-definition-of-done)
- [9. Out of scope](#9-out-of-scope)
- [10. References](#10-references)

---

## 1. Purpose and context

### 1.1 What changes for the user

In v1 the Inglés tab exists but is empty, because the Mac tool that builds the question bank only
reads Temario tests. After this change the same `bank.json` carries both subjects. The user imports
it once, sees the English tests under Inglés, takes them with the same timer, doubt and stuck marks
and review screen, practises random English tests restricted to the areas they choose, exports, and
the English attempts land in the English Excel while Temario attempts keep landing in the Temario
Excel. Nothing in the daily routine changes: one bank file in, one results file out.

### 1.2 What the English material looks like

English synthetic tests live in `Ingles/tests/SINTETICOS/SYN-ING-*.md`. Four existed before this
change (`SYN-ING-001` to `004`) and fifteen more (`SYN-ING-005` to `019`) are being generated in the
same layout as `004`. They share the three-section structure of the Temario tests — `## TEST`,
`## CLAVE`, `## SOLUCIONES RAZONADAS` — and the same question and key syntax, but they differ in
three ways that matter to the design:

- **There are no syllabus pages.** The equivalent of a Temario page citation is the **anchor**
  (*ancla*): the real ENAIRE exam question that tests the same point, written as
  `ING-24-002 Q67` (exam code and original question number). Some older tests anchor a question to a
  subtipo attested in the corpus rather than to one exam question.
- **Every question belongs to an area.** The English study system classifies grammar and vocabulary
  into nine closed areas, each a prefix of the subtipo label: `verbal-`, `nofin-`, `condic-`,
  `modal-`, `estruc-`, `detpro-`, `conpre-`, `lexico-`, `morfo-` (from
  `ingles/00-SISTEMA/areas-y-subtipos.md`). A subtipo such as `morfo-rise-raise-arouse` therefore
  belongs to the morphology area.
- **The solution layout has changed over time** (see [4.2](#42-the-two-solution-layouts)), and the
  newer layout does not state the difficulty level (N1/N2/N3) per question.

### 1.3 How English results are registered today

English has its own registry, parallel to Temario's: fichas in `ingles/20-REGISTRO/fichas/`, archived
keys in `ingles/20-REGISTRO/claves/`, and its own `ingles/99-SCRIPTS/registrar.py`, which writes to
`Ingles/Ingles_Maestro_v1.xlsx`. That script accepts exactly the same ficha fields as the Temario one
and applies the same rules (synthetic tests are recorded with attempt number 9, and a row with an
existing id and attempt number is refused). Two differences matter: English uses its **own closed
list of failure causes**, written without accents, and English fichas are always `modo: Mixto` and
do not use the `corte` field.

---

## 2. Decisions taken and why

### 2.1 Random practice by area

Temario random practice lets the user tick chapters. English has no chapters, so the user was
offered three options: random practice by area, random practice over all English questions with no
grouping, or no random practice for English. **By area** was chosen. It matches how the English
study system already tracks weaknesses (the Excel's `Resumen por area` sheet aggregates by subtipo
prefix), it lets the user target a weak area directly, and it is the same mechanism the future
error-practice mode will need. The cost is that the bank must carry each question's area, which the
next decision addresses.

### 2.2 One generic group per question

Three approaches were considered. Adding an optional English-only `area` field to the existing
format would have been the smallest change today, but every place in the app that groups questions
would then need a "chapter or area" special case, and English questions would have needed a fake
chapter number to pass validation. Building separate English screens and a separate bank would have
duplicated most of the app. The chosen approach gives **every question a generic `group`** — the
chapter for Temario, the area for English — together with a table of display labels per group. It
costs a format version bump and a small migration, and in return the app has one concept for "what
random practice draws from", which future features reuse unchanged.

---

## 3. Bank format version 2

### 3.1 New and changed fields

`bank.json` moves from `"schema": 1` to `"schema": 2`. Each question gains two fields:

| Field | Temario | English |
|---|---|---|
| `group` | the chapter as text, e.g. `"4"` | the area prefix without the dash, e.g. `"morfo"` |
| `ref` | the page citation, e.g. `"T4, pág. 15"` | the anchor, e.g. `"ING-24-002 Q67"`, or the corpus subtipo when the question has no exam anchor |

`tema` and `cite` are kept on Temario questions so data written in version 1 still reads correctly;
English questions carry `tema: null` and no `cite`. **`level` becomes optional** in version 2,
because the newer English tests do not state N1/N2/N3 per question; the review screen shows it only
when present.

### 3.2 The groups table

The bank gains a top-level `groups` object that maps each subject's group keys to display labels:

```json
"groups": {
  "temario": { "1": "Tema 1: Instituciones y legislación", "4": "Tema 4: Cartografía" },
  "ingles": { "lexico": "Léxico y colocación", "morfo": "Morfología", "verbal": "Sistema verbal" }
}
```

Temario labels come from the test titles; English labels are the area names from
`areas-y-subtipos.md`: `verbal` Sistema verbal, `nofin` Formas no personales, `condic` Condicionales
e irreales, `modal` Modales y perífrasis, `estruc` Estructura y orden, `detpro` Determinantes,
pronombres y relativos, `conpre` Conectores y preposiciones, `lexico` Léxico y colocación, `morfo`
Morfología. Only groups that have at least one question appear in the table.

### 3.3 Compatibility with version 1

Import validation accepts both versions. A version-1 bank — whether imported from an old file or
already stored on the phone before the upgrade — is converted in memory when it is loaded: each
question gets `group = String(tema)` and `ref = cite`, and `groups` is derived from the test titles.
The phone therefore keeps working between installing the new app version and importing the new
bank. Attempts are unaffected, since each attempt already stores a snapshot of its questions.

---

## 4. The English parser

### 4.1 What is shared with Temario

`build_bank.py` gains an English parser next to the Temario one and reuses the shared helpers:
splitting the document into sections, reading the front matter, parsing the `## TEST` questions
(`**N.** stem` followed by `a)` to `d)` options) and parsing the fenced key (all English tests use
grouped uppercase letters, already supported). One build produces one `bank.json` from both
`Temario/Tests/SINTETICOS/` and `Ingles/tests/SINTETICOS/`.

### 4.2 The two solution layouts

- **Legacy** (`SYN-ING-001`): each solution block starts with a single line carrying everything,
  `**1. a) illegible** · N1 · ` + backticked subtipo + ` · [ancla: ING-18-003 Q33]`. The parser takes
  the question number, answer letter, level, subtipo and anchor from that line.
- **Modern** (`SYN-ING-002` to `004`, and `005` to `019`, which copy `004`): each block starts with a
  heading `### 1. a) rose`, followed by the stem as a quotation and a paragraph beginning
  `**Ancla:**`. The question number and answer letter come from the heading. Everything after the
  heading, up to the next block, is the explanation and is kept as Markdown, so the user sees the
  "La regla / Los distractores / Comprobación de un segundo / Ejemplo propio" structure exactly as
  written.

A file whose solutions match neither layout stops the build with a message naming the file, so a
third layout is noticed instead of silently producing empty explanations.

### 4.3 Subtipo, group and reference

The question's subtipo comes from the prepared ficha's `subtipos` field when one exists — the same
rule as Temario, because fichas are the registry's authority — and otherwise from the solution: in
the legacy layout the backticked label on the answer line, in the modern layout the first backticked
label in the `**Ancla:**` paragraph whose prefix is one of the nine areas. The `group` is that
subtipo's prefix. The `ref` is the first `ING-xx-xxx Qnn` mention in the anchor text; if there is
none, the subtipo label is used.

### 4.4 Cross-checks

The English build applies the same guarantees as Temario and aborts on the first failure, naming the
file and question: the `## CLAVE` section must match `ingles/20-REGISTRO/claves/<ID>.txt`; every
solution's answer letter must match the key; question, key and solution counts must agree with each
other and with the declared `preguntas`; and every question must resolve to a valid area. A bank
with a wrong key or an unclassifiable question can never reach the phone.

---

## 5. App changes

### 5.1 Random practice by group

The sampler works on `group` instead of `tema`. Setup shows one checkbox per group that has
questions in the current subject, labelled from the `groups` table and followed by the number of
available questions. Areas with no questions yet (for example `condic` and `modal`, which have not
appeared in the last two exam sittings) simply do not appear. Temario random tests keep their IDs
(`RND-T34-20261014-203015`); English random tests are named `RND-ING-YYYYMMDD-HHMMSS`. The chosen
areas are not encoded in the English ID, because nine possible prefixes would make it unwieldy; they
are recorded in the attempt's title, and each question still carries its subtipo.

### 5.2 Causes by subject

The cause selector on the review screen offers the closed list of the attempt's subject. Temario
keeps its current list. English uses the nine causes of `Ingles/GUIA-REGISTRO.md`, spelled exactly
as the English fichas spell them: `No conocia la palabra`, `Elegi por como sonaba`,
`Confundi dos palabras proximas`, `No conocia la regla`, `Aplique mal la regla`,
`Mala lectura del enunciado`, `Dude entre dos opciones`, `Sin tiempo`, `Otro`.

### 5.3 Review screen

Each question shows its `ref` followed by the level when there is one — `[T4, pág. 15] · N2`,
`[ING-24-002 Q67]` — then the explanation rendered as Markdown and the memory hook if any. English
explanations are longer and structured with bold headings and lists; the existing Markdown rendering
and styles handle them.

### 5.4 Home

The Inglés tab lists the English tests. English has no chapters, so they appear as a single list
ordered by ID, each with the same status line as Temario tests (not started, or date, net score and
attempt count). The history list and the export reminder stay shared across both subjects, because a
single export file carries every attempt.

### 5.5 Exported attempts carry their subject

Each exported attempt gains a `subject` field, `"temario"` or `"ingles"`. This is an addition to the
results format, which therefore stays at version 1. The Mac uses the field to route the attempt and
falls back to the ID prefix for exports written before this change.

---

## 6. Mac import routing

### 6.1 Subject profiles

Everything that differs between the subjects is held in one small table of **profiles** in `tools/`,
so no other code needs subject-specific branches:

| | Temario | Inglés |
|---|---|---|
| Fichas folder | `teoria/20-REGISTRO/fichas` | `ingles/20-REGISTRO/fichas` |
| Registrar | `teoria/99-SCRIPTS/registrar.py` | `ingles/99-SCRIPTS/registrar.py` |
| Excel written by the registrar | `Temario/Teoria_Maestro_v1.xlsx` | `Ingles/Ingles_Maestro_v1.xlsx` |
| Causes | the Temario list | the English list of [5.2](#52-causes-by-subject) |
| `modo` | `Bloque`, or `Mixto` if the test spans several chapters | always `Mixto` |
| `corte` | `50` | not written |

### 6.2 Routing an attempt

An attempt's subject is its exported `subject` field, or, if absent, `ingles` when the ID starts with
`SYN-ING-` or `RND-ING-` and `temario` otherwise. The profile then decides the fichas folder,
registrar, causes and field rules. All behaviour established in v1 applies to both subjects
unchanged: one shared import ledger, one results file, one confirmation listing every pending attempt
tagged with its subject, renumbering past fichas that are already filled in (so an English test
already done on paper, such as `SYN-ING-004`, is registered as `SYN-ING-004-i2`), prepared fichas
filled in place, and a failed registration restoring the ficha and leaving the attempt for the next
run.

### 6.3 Open-workbook guard

Before writing anything, the importer checks whether Excel holds either workbook open, because a
workbook saved by Excel after `registrar.py` wrote to it would silently discard the new rows. If
either is open, the run stops with a message asking the user to close it. The check is passed into
the import function, so tests can simulate both an open and a closed workbook without Excel.

---

## 7. Testing strategy

Test-driven development applies to every module touched.

**Mac tools (pytest).**
- The English parser is tested on two invented fixtures, one per solution layout, and with one test
  per cross-check failure (key mismatch, solution letter mismatch, missing area prefix, unknown
  layout).
- A real-file test builds all nineteen `SYN-ING-*` tests and is skipped where they are absent, like
  the existing Temario one.
- Routing tests cover: an English attempt using the English fichas folder, registrar and causes; an
  unknown English cause being rejected; a missing `subject` falling back to the ID prefix;
  renumbering past a paper-registered `SYN-ING-004`; and the open-workbook guard stopping the run
  before any write.
- A round trip runs the real English `registrar.py` on a temporary copy of `Ingles_Maestro_v1.xlsx`,
  alongside the existing Temario round trip. No test opens either real workbook.

**App (Vitest).**
- Bank: a stored version-1 bank is upgraded on load with `group` equal to its chapter; a version-2
  bank validates; a question whose group is not in the `groups` table is rejected with a Spanish
  message; a missing `level` is accepted.
- Sampler: English draws only from the chosen areas; labels come from `groups`; English random IDs
  start with `RND-ING-`.
- Screens: the Inglés tab lists the English tests; English review offers the English cause list;
  `ref` is shown; the export carries `subject`.
- The existing real-bank test also validates the English half of the real `bank.json`.

---

## 8. Definition of done

The change is done when all three of these are true:

1. One `bank.json` contains both subjects — about 41 Temario tests and 19 English tests — and passes
   the app's validation.
2. On the iPhone, the Inglés tab shows the English tests and random practice by area works.
3. The user takes one English test for real, exports it, the import is run, and the attempt appears
   in `Ingles_Maestro_v1.xlsx` with its ficha filled in, with no hand edits.

---

## 9. Out of scope

Error-practice mode, statistics, option shuffling and the academy and official tests remain future
work, as listed in the v1 specification. The deferred findings recorded in `HANDOFF.md` are not part
of this change unless they touch code this change rewrites.

---

## 10. References

- v1 design: `docs/superpowers/specs/2026-10-13-controlador-tests-design.md`
- English areas and subtipos: `~/Documents/TheMind/ATC/ingles/00-SISTEMA/areas-y-subtipos.md`
- English generation rules: `~/Documents/TheMind/ATC/ingles/00-SISTEMA/generacion.md`
- English ficha fields and causes: `Primer Examen/Ingles/GUIA-REGISTRO.md`
- English registration script: `~/Documents/TheMind/ATC/ingles/99-SCRIPTS/registrar.py`
- Example tests: `Ingles/tests/SINTETICOS/SYN-ING-001.md` (legacy layout), `SYN-ING-004.md` (modern
  layout)
