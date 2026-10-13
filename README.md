# controlador-tests

A private, offline practice-test app for the ENAIRE air traffic controller exam that runs on the
iPhone home screen, plus the Mac tools that feed it questions and register its results in the study
Excel. This README explains what the project is, how the phone and the Mac exchange data, the
everyday commands, how to develop it, and the rules that keep personal and copyrighted data out of
this public repository.

## Table of Contents

- [What it is](#what-it-is)
- [How data moves](#how-data-moves)
- [Everyday use](#everyday-use)
  - [Sending new questions to the phone](#sending-new-questions-to-the-phone)
  - [Registering results from the phone](#registering-results-from-the-phone)
- [Development](#development)
  - [The app](#the-app)
  - [The Mac tools](#the-mac-tools)
  - [Continuous integration and deployment](#continuous-integration-and-deployment)
- [What must never be committed](#what-must-never-be-committed)
- [References](#references)

## What it is

The app is a **Progressive Web App (PWA)**: a website that, once added to the iPhone home screen
from Safari, opens full-screen like a normal app and keeps working with no internet connection. A
PWA was chosen over a native app because a native app signed with a free Apple account stops
launching after seven days until it is re-signed, and a paid developer account was not worth its
cost for a single private user.

The app runs timed multiple-choice tests in two modes. **Exam mode** stops at the time limit, as
the real exam does. **Practice mode** lets the clock run past the limit and allows pausing. During a
test it records each answer, a "doubt" and a "stuck" mark per question, and the time spent on each
question. At the end it shows the net score (+1 per correct answer, −0.33 per wrong answer, 0 per
blank), and a review screen with the reasoned solution, the page of the syllabus it comes from, and
a memory hook. On wrong or doubted questions you can record why you failed, from the same closed
list of causes used in the study registry.

Nothing is stored online. The questions and your attempts live in the phone's local database
(IndexedDB, the browser's built-in storage) and on the Mac.

## How data moves

Two JSON files travel between the Mac and the phone by **AirDrop**, Apple's local file transfer,
which needs no account, no cloud storage and no internet.

- `bank.json` goes from the Mac to the phone. It contains every question, its answer, its
  explanation and its citation, and the list of fixed tests.
- `results.json` goes from the phone to the Mac. It contains **every finished attempt ever made**,
  not only the new ones.

Sending everything every time is deliberate. The Mac keeps a ledger of the attempts it has already
registered and skips them, so an export can be repeated, or lost, without ever registering anything
twice or losing anything. Both files, the ledger and an archive of every imported results file live
in `~/Documents/controlador/Primer Examen/app-sync/`, outside this repository.

## Everyday use

### Sending new questions to the phone

After new synthetic tests (`SYN-*.md`) have been added to `Temario/Tests/SINTETICOS/` with their
archived key in the vault, rebuild the bank:

```bash
cd tools && uv run python build_bank.py
```

The build checks every test before writing anything: the answer key in the test must match the
archived key in `20-REGISTRO/claves/`, every reasoned solution must agree with the key, and the
number of questions, key letters and solutions must agree. The first inconsistency stops the build
with a message naming the file and the question, so a bank with a wrong key can never reach the
phone.

Then AirDrop `app-sync/bank.json` to the iPhone. It lands in Files › Downloads. In the app, tap
**Importar banco** and pick it. The app shows what changed and asks before replacing the old bank.
Importing a bank never touches your attempts.

### Registering results from the phone

In the app, tap **Exportar resultados** and AirDrop the file to the Mac. It lands in
`~/Downloads`. Then:

```bash
cd tools && uv run python import_results.py
```

The tool picks the newest `results*.json` in `~/Downloads`, lists the attempts it has not registered
yet with their scores, and asks for confirmation. For each attempt it writes a ficha in the vault's
`20-REGISTRO/fichas/` (filling in a ficha that was prepared in advance, if there is one) and runs
`registrar.py` on it, which writes the Excel rows. An attempt is recorded in the ledger only after
`registrar.py` succeeds. If registration fails, for example because the Excel is open, the ficha is
put back as it was, the run stops with the reason, and the next run retries from that attempt.

A second attempt at the same test is registered as `<test>-i2`, a third as `<test>-i3`, and so on.
This is required because `registrar.py` records every synthetic test with attempt number 9 and
refuses a second row with the same ID and attempt number.

## Development

### The app

The app lives in `app/` and is written in TypeScript with **Preact** (a 3 KB implementation of the
React component model), built with **Vite**. `vite-plugin-pwa` generates the service worker that
makes it work offline. All exam logic (scoring, timer, attempts, random test assembly, bank
validation) lives in `app/src/domain/` as pure functions that receive the current time and the
random seed as arguments, which is what makes them deterministic and testable.

```bash
cd app
npm install
npm run dev      # development server
npm test         # Vitest test suite
npm run build    # type-check and production build into app/dist
```

### The Mac tools

The tools live in `tools/` and use Python with **uv** for dependencies, **pytest** for tests and
**Ruff** for linting and formatting.

```bash
cd tools
uv sync
uv run pytest
uv run ruff format . && uv run ruff check .
```

Some tests read the real synthetic tests and run the real `registrar.py`. They run only on the Mac
where that material exists, and are skipped elsewhere. The registrar test works on a temporary copy
of the Excel workbook; no test ever opens the real one.

### Continuous integration and deployment

Every push to `main` runs the repository safety check, the Python tests and lint, the app tests and
the production build in GitHub Actions, then publishes `app/dist` to GitHub Pages. The phone picks
up the new version the next time the app opens with a connection, and offers to reload — never
during a test.

## What must never be committed

This repository is public, because GitHub Pages on the free plan requires it. It must therefore
contain application code only: no questions, no syllabus text, and no results. `bank*.json` and
`results*.json` are ignored by git, and `tools/check_repo_safety.py` fails if any of them, or any
Markdown file containing a synthetic test's `TEST` or `CLAVE` section, is tracked. The check runs
in CI on every push. The only exceptions are the invented fixtures in `tools/tests/fixtures/` and the
design documents in `docs/superpowers/`.

## References

- Design specification: `docs/superpowers/specs/2026-10-13-controlador-tests-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-13-controlador-tests-v1.md`
- Material inventory and naming conventions: `Primer Examen/Temario/LEEME.md`
- Meaning of every ficha field and the causes vocabulary: `Primer Examen/Temario/GUIA-REGISTRO.md`
- The registration script: `~/Documents/TheMind/ATC/teoria/99-SCRIPTS/registrar.py`
