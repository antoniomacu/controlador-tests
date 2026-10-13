import type { Item } from './types';

/** Points subtracted per wrong answer in the ENAIRE exam. */
export const PENALTY = 0.33;

export interface Score {
  correct: number;
  wrong: number;
  blank: number;
  net: number;
}

export function score(items: readonly Pick<Item, 'key' | 'ans'>[]): Score {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  for (const { key, ans } of items) {
    if (ans === null) blank += 1;
    else if (ans === key) correct += 1;
    else wrong += 1;
  }
  const net = Math.round((correct - PENALTY * wrong) * 100) / 100;
  return { correct, wrong, blank, net };
}

export function passes(s: Score, passRef: number): boolean {
  return s.net >= passRef;
}
