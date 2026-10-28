# History and chapter navigation — design

This document describes two changes to the `controlador-tests` phone app: a chapter filter on the
home screen, and the ability to remove attempts that were started by mistake. It is written for
the person who will plan and build the change, and it records which decisions came from the user
and which were the designer's call. It builds on the v1 design
(`2026-10-13-controlador-tests-design.md`) and the English subject design
(`2026-10-14-english-subject-design.md`).

## Table of Contents

- [Why](#why)
- [Goals, non-goals and anti-goals](#goals-non-goals-and-anti-goals)
- [Current state](#current-state)
- [Part 1: chapter filter](#part-1-chapter-filter)
- [Part 2: removing attempts](#part-2-removing-attempts)
- [Constraints](#constraints)
- [Testing](#testing)
- [Decisions and who made them](#decisions-and-who-made-them)
- [Left to the builder](#left-to-the-builder)

## Why

The user studies by going back to attempts that went badly. In their words, what they know when
they look for one is **the chapter, and a low score**. Today the history sits below every
chapter's list of tests, mixes all chapters together and keeps only the last ten attempts, so
reaching a weak chapter-4 attempt means scrolling past chapters 1 to 9 and hoping it is still
among the ten. The bank keeps growing (68 tests on 2026-10-27), so the scroll only gets longer.

The second pain is attempts that should never have been recorded: a test opened by mistake, or
one started and then dropped because something else came up. The 12-second `SYN-T12-001` in the
2026-10-27 export is the example. These pollute the history and the export, and today they have to
be skipped by hand at import time.

## Goals, non-goals and anti-goals

**Goals**

1. From the home screen, reach one chapter's tests and that chapter's past attempts in one tap.
2. In the history, a low score is visible at a glance.
3. An attempt in progress can be cancelled so it is never recorded.
4. A finished attempt recorded by mistake can be removed, as long as it has not left the phone.

**Non-goals**

- No search, sorting or date filters in the history.
- No change to the English subject's structure (it has a single scope, see below).
- No change to export format, `import_results.py` or the Excel.
- The deferred v1 findings (auto-pause heartbeat, cause tags after export, and so on) are not part
  of this branch.

**Anti-goals** (would make this a failure even if it works)

- An attempt that may already be in the Excel can be removed from the phone. The user was explicit:
  *an attempt already in the Excel shouldn't be possible to delete.*
- Removing something with a single stray tap while scrolling.
- A side panel that takes width from test titles on an iPhone screen.

## Current state

- `ui/Home.tsx` renders a subject tab bar (`Temario` / `Inglés`), then one `section.scope` per
  `TestDef.scope` of the current subject, then "Práctica aleatoria", then "Historial" with the last
  ten finished attempts of **all** subjects (`finished.slice(-10).reverse()`), then the import and
  export footer. Each history row is a button with `title · date · neta N` that opens the result
  screen.
- `ui/Runner.tsx` already has an **"Abandonar"** button, placed after "Terminar" at the bottom of
  the screen. It confirms with *"¿Abandonar este intento? Se borrará y no contará para nada."* and
  calls `App.onAbandon`, which removes the attempt from state and IndexedDB (`deleteAttempt`) and
  returns home. The user did not know it existed.
- `App.tsx` finishes an exam automatically on startup if its timer expired while the app was
  closed (`autoFinishIfExpired`), and opens its result screen. This is the likely origin of attempts
  "recorded by mistake": an exam left open finishes itself.
- `Attempt.exported` is set to `true` for every finished attempt when the user exports
  (`markExported`). Every export file contains **all** finished attempts, exported or not; the Mac
  importer skips uuids already in its ledger.
- Scopes in the current bank: `T1`–`T9` and `T12` for `temario`; a single scope `ING` for `ingles`.

## Part 1: chapter filter

**Chosen layout (user's pick, option A of the mockups):** a row of chips pinned to the top of the
home screen while scrolling.

- The chips are `Todos` followed by every scope that has at least one test for the current
  subject, in the order the scopes first appear in the bank (the order the home screen uses today).
  Labels are the scope codes (`T1`, `T2`, … `T12`).
- The row stays visible while the list scrolls (sticky, below the subject tabs). With 11 chips it
  is wider than a phone; it scrolls horizontally inside its own row and the selected chip is kept
  in view.
- **`Todos`** shows today's home screen unchanged: every scope section, and the history with the
  last ten finished attempts of the current subject.
- **A chapter chip** shows only that scope's section of tests and, below it, the history of that
  scope: **every** finished attempt whose `test_id` belongs to a test of that scope, newest first,
  with no ten-attempt cap.
- Random-practice attempts and attempts whose test is no longer in the bank have no chapter; they
  appear only under `Todos`.
- "Práctica aleatoria" and the import/export footer stay where they are and ignore the filter.
- The selected chip is remembered per subject across app launches. If the remembered scope no
  longer exists in the bank, fall back to `Todos`.
- **The chip survives navigation (designer's call).** Opening an attempt from a filtered history
  and coming back, or switching subject tab and back, returns to the same chip with no flash of
  `Todos`. The selection therefore lives in `App` state (one value per subject), not inside
  `Home`, and the stored value is read during the existing startup load, before the first render.
- **Order (designer's call).** Both history views sort finished attempts by `finished`, newest
  first; `Todos` takes the ten newest after sorting. Today the list is taken in `started` order,
  which can differ when an attempt was paused or auto-finished later.
- When a subject has only one scope (English today), the chip row is not shown.

**History rows.** Each row keeps opening the attempt's result screen. The net score becomes the
most prominent part of the row, and it is shown in the danger colour, with a text cue such as
"bajo", when `net < pass_ref` (the pass reference stored on the attempt, 10 for a 20-question test).
Colour is never the only signal.

**History scope by subject (designer's call).** Today the history mixes `temario` and `ingles`
attempts. With the filter it shows only the current subject's attempts, under `Todos` too, so the
two tabs behave the same way.

## Part 2: removing attempts

There are two cases, and both remove the attempt completely.

**Cancelling a test in progress.** The existing "Abandonar" flow stays as it is (confirmation,
hard delete, back home). The only change is that it must be findable: move it from the bottom of
the screen to the runner's top bar, next to "Pausa", visually subordinate to "Terminar", with the
same confirmation. Wording stays "Abandonar".

**Deleting a finished attempt.** The result screen gets a "Borrar intento" button, placed away from
"Volver" and styled as a destructive action.

- It is shown only when `attempt.exported === false`.
- Tapping it asks for confirmation (*"¿Borrar este intento? No se exportará ni contará para nada."*
  or similar). On confirm, the attempt is removed from state and IndexedDB, exactly as "Abandonar"
  does, and the app returns home.
- When the attempt has been exported, the button is replaced by a short note saying it has been
  exported, may already be in the Excel, and so cannot be deleted here. If it should not be
  registered, the user skips it at import time.
- After a delete the attempt is gone from the history, the "Exportar resultados (N)" count, the
  export-reminder banner, the test's status line and any future export file.
- **Attempt numbering (designer's call).** `nextAttemptNumber` changes from "count + 1" to
  "highest existing number + 1" for the test. With "count + 1", deleting attempt 2 of attempts
  1–3 would hand out a second attempt 3, and the Mac importer builds the ficha id from the test id
  plus the number (`SYN-T4-001-i3`), so the duplicate would collide silently in the Excel. With
  "max + 1", deleting the newest mistaken attempt reuses its number, and deleting an older one
  leaves a gap, which is harmless.

**Why hard delete and not a "discarded" flag (designer's call).** A flag would need every reader of
the attempts list (history, status line, export, pending count, attempt numbering) to filter it,
and it would only buy an undo for attempts that by definition never left the phone. The
confirmation step is the safety net. This matches what "Abandonar" already does.

## Constraints

- Preact + TypeScript app under `app/`, Vitest tests, IndexedDB through `idb`. Follow the existing
  patterns in `App.tsx` (callbacks passed down, `confirmFn` injected for tests) and `storage/db.ts`.
- Phone first: touch targets of at least 44 px, works at 375 px width, respects reduced motion, and
  the chip row must not cause horizontal scrolling of the page itself.
- The remembered chip is a per-device convenience; storing it in IndexedDB `meta` or
  `localStorage` are both acceptable, and losing it must not break anything.
- No change to the export schema (`schema: 1`) or to the bank schema.
- The global rules require `ui-ux-pro-max` to be consulted before the visual work, and TDD for the
  logic.

## Testing

- **Pure logic, test first.** Extract and unit-test: the scope list for a subject; the attempts
  belonging to a scope (including random and orphaned attempts going only to `Todos`, and the cap of
  ten applying only to `Todos`); whether an attempt may be deleted; the "low score" predicate.
- **Component tests** in the existing style: selecting a chip filters both tests and history; the
  chip row is hidden for a one-scope subject; the remembered chip is restored and falls back to
  `Todos` when stale; "Borrar intento" appears only for unexported attempts, confirms, and removes
  the attempt from history, pending count and the next export; the exported note appears instead
  for exported attempts; "Abandonar" is reachable from the top bar and still confirms.
- `npm --prefix app test` must pass, plus the type check and lint the repo already runs.

## Decisions and who made them

| Decision | Made by |
|---|---|
| Fix both the chapter navigation and the deletion | User |
| What identifies an attempt to review: chapter and a low score | User |
| Layout: sticky chip row (option A) over side panel or chapter screens | User |
| Need to cancel a test in progress without recording it | User |
| Need to delete finished attempts recorded by mistake | User |
| An attempt that may be in the Excel cannot be deleted | User |
| "May be in the Excel" is approximated as `exported === true`; an exported attempt stays locked even if it was never imported, and is skipped at import time instead (confirmed by the user on 2026-10-28, after being offered a bank-carried ledger that would have kept such attempts deletable) | Designer, confirmed by user |
| Hard delete instead of a discarded flag | Designer |
| Delete lives on the result screen, not on history rows | Designer |
| "Abandonar" moves to the top bar; behaviour unchanged | Designer |
| Chapter history uncapped; `Todos` keeps the cap of ten | Designer |
| History shows only the current subject's attempts | Designer |
| Chip remembered per subject; hidden for one-scope subjects | Designer |
| Chip held in `App` state so it survives opening an attempt and coming back | Designer |
| History sorted by `finished`, newest first | Designer |
| `nextAttemptNumber` becomes max + 1, so a delete never duplicates a number | Designer |

## Left to the builder

- Exact styling of the chips, the low-score cue and the destructive button, within the existing
  stylesheet.
- Where the remembered chip is stored.
- Whether an expired exam found at startup could later offer "registrar o descartar" instead of
  finishing silently. It is **not** in scope here: deleting from the result screen already covers
  it, as long as the attempt has not been exported.
- Not wanted: the bank file carrying the list of uuids the Mac has already imported, so that
  exported-but-not-imported attempts stay deletable. The user chose to keep the lock on every
  exported attempt and skip mistakes at import time.
