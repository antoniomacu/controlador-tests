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
