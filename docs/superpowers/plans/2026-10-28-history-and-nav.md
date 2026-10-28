# History and Chapter Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky chapter filter to the home screen whose history shows every attempt of the chosen chapter with low scores flagged, let the user delete unexported finished attempts from the result screen, and make the existing "Abandonar" button findable.

**Architecture:** The filtering, ordering, low-score and deletability rules live in a new pure module, `src/domain/history.ts`, unit-tested first. `App` owns the selected chip per subject (so it survives navigating to a result screen and back) and persists it in IndexedDB `meta`. `Home`, `Results` and `Runner` only render and call back. Deletion reuses the existing hard-delete path that "Abandonar" already uses.

**Tech Stack:** Preact + TypeScript, Vite, Vitest with `@testing-library/preact`, IndexedDB via `idb` (`fake-indexeddb` in tests, as the existing suites use).

**Spec:** `docs/superpowers/specs/2026-10-27-history-and-nav-design.md` (approved 2026-10-28)

## Global Constraints

- Touch targets at least 44 px; layout works at 375 px wide; the page itself never scrolls horizontally (the chip row scrolls inside its own row).
- Colour is never the only signal: a low score carries the text "bajo" as well as the danger colour.
- `prefers-reduced-motion` is respected by any new transition.
- No change to the export schema (`schema: 1`), the bank schema, `tools/` or the Excel.
- An attempt with `exported === true` can never be deleted from the phone.
- Copy is Spanish and matches the spec: chip `Todos`; buttons `Abandonar`, `Borrar intento`.
- Consult the `ui-ux-pro-max` skill before the styling steps (global rule). Reuse the variables already defined in `app/src/styles.css`; add no new colours outside them.
- Git: the user's PostToolUse hook makes `wip` commits after every edit. **Do not run `git commit` per task.** At the end, propose one conventional commit message to the user (Task 6).

## Review Focus

1. **A remembered chip whose scope vanished after a new bank import** → the home screen shows `Todos`, never an empty screen. Test in Task 3.
2. **Attempts with no chapter** (random practice, or a test no longer in the bank) → they appear under `Todos` only and never break a chapter view. Test in Task 1.
3. **An attempt still in progress** → it never appears in any history view. Test in Task 1.
4. **Deleting attempt 2 of attempts 1–3** → the next attempt of that test is numbered 4, never a second 3. Test in Task 1.
5. **Switching between the Temario and Inglés tabs** → each tab keeps its own chip, and Inglés (one scope, `ING`) shows no chip row. Tests in Tasks 2 and 3.

---

### Task 1: History rules and attempt numbering (pure logic)

**Files:**
- Create: `app/src/domain/history.ts`
- Modify: `app/src/domain/attempts.ts:81-83` (`nextAttemptNumber`)
- Test: `app/tests/domain/history.test.ts` (new), `app/tests/domain/attempts.test.ts` (extend the existing `nextAttemptNumber` case near line 71)

**Interfaces:**
- Produces:
  - `export const ALL = 'all';` and `export type ScopeFilter = string;` (`ALL` or a scope code such as `'T4'`)
  - `scopesFor(bank: Bank | null, subject: Subject): string[]`: the distinct `scope` values of the subject's tests, in first-appearance order of `bank.tests`; `[]` without a bank.
  - `historyFor(attempts: readonly Attempt[], bank: Bank | null, subject: Subject, scope: ScopeFilter): Attempt[]`: finished attempts of `subject`, sorted by `finished` descending. With `ALL`, the first 10. With a scope, every attempt whose `test_id` is a bank test of that scope and subject, uncapped.
  - `isLowScore(a: Attempt): boolean`: `!passes(score(a.items), a.pass_ref)`, reusing `domain/scoring.ts`.
  - `canDelete(a: Attempt): boolean`: `a.status === 'finished' && !a.exported`.
  - `nextAttemptNumber(attempts, testId)`: same signature; it now returns the highest `attempt` number among that test's attempts, plus 1 (1 when there are none).

- [ ] **Step 1: Write the failing tests** in `tests/domain/history.test.ts`. Build fixtures inline in the style of `tests/ui/Home.test.tsx`: a bank with tests `SYN-T3-001` (scope `T3`), `SYN-T4-001` and `SYN-T4-002` (scope `T4`), `SYN-ING-001` (subject `ingles`, scope `ING`), plus attempts.
  - `scopesFor` returns `['T3','T4']` for `temario` and `['ING']` for `ingles`.
  - `historyFor(…, 'T4')` returns only T4 attempts, newest `finished` first, and returns all 12 when 12 exist.
  - `historyFor(…, ALL)` returns at most 10 and excludes `ingles` attempts. The 10 are the newest by `finished` even when the `started` order differs.
  - A random attempt (`kind: 'random'`, `test_id` not in the bank) and an attempt of a test missing from the bank appear under `ALL` and under no scope.
  - An `in_progress` attempt appears in no view.
  - `isLowScore` is true for a net below `pass_ref` and false at exactly `pass_ref`.
  - `canDelete` is false for `exported: true` and for `in_progress`, true for finished and unexported.
- [ ] **Step 2: Extend `tests/domain/attempts.test.ts`** with a case where attempts numbered `1` and `3` exist for one test, as if attempt 2 had been deleted. Assert `nextAttemptNumber(...)` is `4`. Keep the existing assertions: two attempts give `2`, none gives `1`.
- [ ] **Step 3: Run** `npm --prefix app test -- history attempts`. Expected: FAIL (`history.ts` missing; the numbering assertion gets 3).
- [ ] **Step 4: Implement** `src/domain/history.ts` with the signatures above, and change `nextAttemptNumber` to max + 1.
- [ ] **Step 5: Run** `npm --prefix app test`. Expected: all suites PASS, including the existing `Setup` and integration tests that read attempt numbers.

### Task 2: Chapter chips and the filtered history on the home screen

**Files:**
- Modify: `app/src/ui/Home.tsx`, `app/src/styles.css`
- Test: `app/tests/ui/Home.test.tsx`

**Interfaces:**
- Consumes: `ALL`, `ScopeFilter`, `scopesFor`, `historyFor`, `isLowScore` from Task 1.
- Produces: `HomeProps` gains `scope: ScopeFilter` and `onScope: (scope: ScopeFilter) => void`. `Home` stays stateless about the filter.

- [ ] **Step 1: Write the failing tests** in `Home.test.tsx`. Add a T3 test to the fixture bank.
  - With `scope={ALL}`: a `nav` with `aria-label="Temas"` shows buttons `Todos`, `T3` and `T4`, and `Todos` has `aria-pressed="true"`. Both scope sections render.
  - Clicking `T4` calls `onScope('T4')`.
  - With `scope="T4"`: only the T4 section renders, and the history lists every T4 attempt (seed 12) and no T3 attempt.
  - A history row whose attempt is low shows the text `bajo`, and a passing row does not.
  - With `subject="ingles"` (only scope `ING`): no `nav[aria-label="Temas"]` is rendered.
  - "Práctica aleatoria" and the import/export footer render under any scope.
- [ ] **Step 2: Run** `npm --prefix app test -- Home`. Expected: FAIL.
- [ ] **Step 3: Implement.** Render the chip row only when `scopesFor(...).length > 1`, as a `nav class="scopes" aria-label="Temas"` of `button`s with `aria-pressed`. Filter the sections by `scope`, and render the history from `historyFor(attempts, bank, subject, scope)`. In each history row, the net score goes in its own `span class="net"`, plus `span class="low">bajo</span>` when `isLowScore`. Keep the existing `onOpenAttempt` behaviour. Keep the "Historial" heading; with a scope selected it reads `Historial · T4`.
- [ ] **Step 4: Style** (after consulting `ui-ux-pro-max`):
  - `.scopes` is `position: sticky` below the subject tabs, `overflow-x: auto` inside its own row, chips at least 44 px tall.
  - The pressed chip uses the existing accent variables.
  - `.net` is the most prominent part of `.history-row`. `.low` uses the existing danger colour.
  - On selection, scroll the selected chip into view (`scrollIntoView({ inline: 'nearest', block: 'nearest' })`, with no smooth behaviour under reduced motion).
- [ ] **Step 5: Run** `npm --prefix app test`. Expected: PASS.

### Task 3: The selected chip lives in `App` and persists per subject

**Files:**
- Modify: `app/src/App.tsx`
- Test: `app/tests/App.integration.test.tsx`

**Interfaces:**
- Consumes: `HomeProps.scope` / `onScope` (Task 2); `ALL`, `scopesFor` (Task 1); `getMeta` / `setMeta` from `storage/db.ts`.
- Produces: the IndexedDB `meta` key `'scopeFilter'` holding `Partial<Record<Subject, ScopeFilter>>`.

- [ ] **Step 1: Write the failing integration tests** in the existing `mount()` style:
  - Select `T4`, open an attempt from the history, press "Volver al inicio": `T4` is still pressed.
  - Select `T4` on Temario, switch to Inglés and back: `T4` is still pressed.
  - Remount the app on the same DB: `T4` is pressed (persisted).
  - Store `{ temario: 'T7' }` in `meta.scopeFilter` with a bank that has no T7: after mount, `Todos` is pressed.
- [ ] **Step 2: Run** `npm --prefix app test -- App.integration`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add state `scopeBy: Partial<Record<Subject, ScopeFilter>>` and read it from `getMeta(db, 'scopeFilter')` inside the existing startup effect, before `setLoaded(true)`, so there is no flash of `Todos`.
  - The scope passed to `Home` is `scopeBy[subject]` when it is in `scopesFor(bank, subject)`, else `ALL`.
  - `onScope` updates state and calls `setMeta(db, 'scopeFilter', next)` without awaiting the UI on it.
- [ ] **Step 4: Run** `npm --prefix app test`. Expected: PASS.

### Task 4: Delete a finished, unexported attempt from the result screen

**Files:**
- Modify: `app/src/ui/Results.tsx`, `app/src/App.tsx`, `app/src/styles.css`
- Test: `app/tests/ui/Results.test.tsx`, `app/tests/App.integration.test.tsx`

**Interfaces:**
- Consumes: `canDelete` (Task 1); the existing `onAbandon(uuid)` path in `App.tsx`, renamed `removeAttempt(uuid: string)` and used by both `Runner` and `Results`.
- Produces: `ResultsProps` gains `confirmFn: (message: string) => boolean` and `onDelete: (uuid: string) => void`.

- [ ] **Step 1: Write the failing component tests** in `Results.test.tsx`:
  - For an unexported finished attempt, a button `Borrar intento` exists. Clicking it with `confirmFn` returning `true` calls `onDelete(uuid)`. With `false`, it does not.
  - The confirm message passed is exactly `¿Borrar este intento? No se exportará ni contará para nada.`
  - For `exported: true`, there is no `Borrar intento` button, and the text `Exportado: puede estar ya en el Excel, así que no se puede borrar aquí.` is shown.
- [ ] **Step 2: Write the failing integration test.** Finish an attempt, delete it from its result screen: the app is on home, the history no longer lists it, the export button reads `Exportar resultados (0)`, and `listAttempts(db)` no longer contains it.
- [ ] **Step 3: Run** `npm --prefix app test -- Results App.integration`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - In `Results`, render the delete control at the end of the page, after "Volver al inicio" and separated from it, as `button class="danger"`.
  - In `App`, rename `onAbandon` to `removeAttempt`, and pass it and `confirmFn` to `Results`.
  - Style `.danger` with the existing danger colour, outlined rather than filled so it never reads as the primary action.
- [ ] **Step 5: Run** `npm --prefix app test`. Expected: PASS.

### Task 5: Move "Abandonar" to the runner's top bar

**Files:**
- Modify: `app/src/ui/Runner.tsx` (`header.runner-bar`, lines 76-86; the old button at lines 163-172), `app/src/styles.css`
- Test: `app/tests/ui/Runner.test.tsx`

**Interfaces:**
- Consumes: the unchanged `onAbandon` prop of `Runner`, which `App` now wires to `removeAttempt`.

- [ ] **Step 1: Write the failing test:** the `Abandonar` button is inside `header.runner-bar`. Clicking it still calls `confirmFn` with `¿Abandonar este intento? Se borrará y no contará para nada.` and, on `true`, calls `onAbandon(uuid)`. There is exactly one `Abandonar` button on the screen.
- [ ] **Step 2: Run** `npm --prefix app test -- Runner`. Expected: FAIL.
- [ ] **Step 3: Implement:** move the button into the header next to the pause control, and remove it from the bottom. Style it as a secondary button, less prominent than "Terminar".
- [ ] **Step 4: Run** `npm --prefix app test`. Expected: PASS.

### Task 6: Verify the branch and hand over

**Files:** none new.

- [ ] **Step 1: Run** `npm --prefix app test`, `npm --prefix app run build` (type check plus build) and `uv --directory tools run pytest -q`. Expected: all pass with no type errors.
- [ ] **Step 2: Check the spec's decision table** against the branch, row by row, and note any deviation in the hand-over message.
- [ ] **Step 3: Propose to the user** one conventional commit message replacing the `wip` commits (for example `feat(app): chapter filter, attempt deletion and visible abandon`). Commit only after approval. Never push.
