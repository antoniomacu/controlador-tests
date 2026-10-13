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

function pick(
  questions: readonly Question[],
  subject: Subject,
  temas: readonly number[],
): Question[] {
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

/** Fisher-Yates shuffle of the matching questions, then the first `count`. */
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
