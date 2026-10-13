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
