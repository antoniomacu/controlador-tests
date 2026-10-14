import { elapsedSecs, isExpired, pause, resume, startTimer } from './timer';
import type {
  Attempt,
  Cause,
  ExportAttempt,
  Item,
  Letter,
  Mode,
  Question,
  ResultsFile,
  Subject,
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

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO 8601 in local wall-clock time with its UTC offset (`2026-10-14T20:30:00+02:00`).
 * The Mac reads the date and the start/end times straight from these strings, so they must
 * be the user's local time, not UTC.
 */
export function toLocalIso(ms: number): string {
  const d = new Date(ms);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function createAttempt(i: NewAttempt): Attempt {
  return {
    uuid: i.uuid,
    test_id: i.testId,
    kind: i.kind,
    mode: i.mode,
    attempt: i.attemptNumber,
    started: toLocalIso(i.nowMs),
    finished: null,
    limit_min: i.limitMin,
    total_secs: 0,
    status: 'in_progress',
    items: i.questions.map((q) => ({
      q: q.id,
      key: q.answer,
      ans: null,
      doubt: false,
      stuck: false,
      secs: 0,
      first_answered_at_secs: null,
      cause: null,
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

/** Tapping the already-selected letter clears the answer (blank). */
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
  // An exam that ran out (possibly while the app was closed) ended at the limit, not now.
  const t = a.timer;
  const endMs = isExpired(t, nowMs) ? t.startedAtMs + t.pausedTotalMs + t.limitSecs * 1000 : nowMs;
  return {
    ...charged,
    status: 'finished',
    finished: toLocalIso(endMs),
    total_secs: elapsed,
  };
}

/** Returns the same object when nothing changes, so callers can detect a change by identity. */
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
    uuid: a.uuid,
    test_id: a.test_id,
    kind: a.kind,
    mode: a.mode,
    attempt: a.attempt,
    started: a.started,
    finished: a.finished,
    limit_min: a.limit_min,
    total_secs: a.total_secs,
    status: a.status,
    subject: a.subject,
    items: a.items,
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
