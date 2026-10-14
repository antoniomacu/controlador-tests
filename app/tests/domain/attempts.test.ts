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
  toLocalIso,
  type NewAttempt,
} from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';

const T0 = Date.UTC(2026, 9, 14, 18, 30, 0);
const s = (n: number) => T0 + n * 1000;
const LOCAL_ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/;

function q(n: number, answer: 'a' | 'b' | 'c' | 'd'): Question {
  return {
    id: `SYN-T4-001#${n}`,
    subject: 'temario',
    tema: 4,
    group: '4',
    stem: `Q${n}`,
    answer,
    level: 'N1',
    options: { a: 'A', b: 'B', c: 'C', d: 'D' },
  };
}

function base(over: Partial<NewAttempt> = {}): NewAttempt {
  return {
    uuid: 'u1',
    testId: 'SYN-T4-001',
    title: 'Tema 4',
    subject: 'temario',
    kind: 'fixed',
    mode: 'exam',
    questions: [q(1, 'c'), q(2, 'a'), q(3, 'd')],
    limitMin: 3,
    passRef: 1,
    attemptNumber: 1,
    nowMs: T0,
    ...over,
  };
}

describe('attempts', () => {
  it('creates an attempt with keys captured and a snapshot of questions', () => {
    const a = createAttempt(base());
    expect(a.items.map((i) => i.key)).toEqual(['c', 'a', 'd']);
    expect(a.items.every((i) => i.ans === null && i.secs === 0)).toBe(true);
    expect(a.questions[0].stem).toBe('Q1');
    expect(a.status).toBe('in_progress');
    expect(a.started).toMatch(LOCAL_ISO);
    expect(Date.parse(a.started)).toBe(T0);
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
    expect(a.finished).toMatch(LOCAL_ISO);
    expect(Date.parse(a.finished as string)).toBe(s(70));
  });

  it('auto-finishes an expired exam at exactly the limit', () => {
    const a = createAttempt(base());
    expect(autoFinishIfExpired(a, s(100))).toBe(a);
    const done = autoFinishIfExpired(a, s(5000));
    expect(done.status).toBe('finished');
    expect(done.total_secs).toBe(180);
    expect(Date.parse(done.finished as string)).toBe(s(180));
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
    a = selectAnswer(a, 'b', 5);
    a = goTo(a, 1, 6);
    a = selectAnswer(a, 'a', 7);
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
    expect(file.attempts[0].subject).toBe('temario');
    expect(Object.keys(file.attempts[0]).sort()).toEqual(
      [
        'attempt',
        'finished',
        'items',
        'kind',
        'limit_min',
        'mode',
        'started',
        'status',
        'subject',
        'test_id',
        'total_secs',
        'uuid',
      ].sort(),
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

describe('toLocalIso', () => {
  it('writes local wall-clock time with its UTC offset', () => {
    const ms = Date.UTC(2026, 9, 13, 22, 30, 5);
    const iso = toLocalIso(ms);
    expect(iso).toMatch(LOCAL_ISO);
    expect(Date.parse(iso)).toBe(ms);
    const local = new Date(ms);
    expect(iso.slice(0, 10)).toBe(
      `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    );
    expect(Number(iso.slice(11, 13))).toBe(local.getHours());
  });
});
