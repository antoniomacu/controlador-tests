import { LETTERS, SUBJECTS, type Bank } from './types';

export type BankResult = { ok: true; bank: Bank } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const fail = (error: string): BankResult => ({ ok: false, error });

function questionError(q: Obj): string | null {
  if (!SUBJECTS.includes(q.subject as never)) return 'asignatura inválida';
  if (!Number.isInteger(q.tema) || (q.tema as number) < 1) return 'tema inválido';
  if (!isText(q.stem)) return 'enunciado vacío';
  const options = q.options;
  if (!isObj(options) || !LETTERS.every((l) => isText(options[l]))) {
    return 'opciones incompletas';
  }
  if (!LETTERS.includes(q.answer as never)) return 'respuesta inválida';
  if (!['N1', 'N2', 'N3'].includes(q.level as string)) return 'nivel inválido';
  return null;
}

/** Checks structure and references so a broken file never replaces a working bank. */
export function validateBank(raw: unknown): BankResult {
  if (!isObj(raw)) return fail('El archivo no es un banco.');
  if ('attempts' in raw) return fail('Este archivo es un results.json, no un banco.');
  if (raw.schema !== 1) return fail(`Versión de banco no soportada: ${String(raw.schema)}.`);
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.tests)) {
    return fail('El archivo no es un banco.');
  }

  const ids = new Set<string>();
  for (const q of raw.questions) {
    if (!isObj(q) || !isText(q.id)) return fail('Hay una pregunta sin identificador.');
    if (ids.has(q.id)) return fail(`Pregunta ${q.id} repetida.`);
    ids.add(q.id);
    const problem = questionError(q);
    if (problem) return fail(`Pregunta ${q.id}: ${problem}.`);
  }

  for (const t of raw.tests) {
    if (!isObj(t) || !isText(t.id)) return fail('Hay un test sin identificador.');
    if (!SUBJECTS.includes(t.subject as never) || !isText(t.title) || !isText(t.scope)) {
      return fail(`Test ${t.id}: datos incompletos.`);
    }
    if (!Array.isArray(t.questions) || t.questions.length === 0) {
      return fail(`Test ${t.id}: sin preguntas.`);
    }
    const missing = t.questions.find((id) => !ids.has(id as string));
    if (missing !== undefined) {
      return fail(`Test ${t.id}: la pregunta ${String(missing)} no existe.`);
    }
    if (typeof t.limit_min !== 'number' || t.limit_min <= 0) {
      return fail(`Test ${t.id}: tiempo límite inválido.`);
    }
    if (typeof t.pass_ref !== 'number' || t.pass_ref < 0) {
      return fail(`Test ${t.id}: referencia de aprobado inválida.`);
    }
  }
  return { ok: true, bank: raw as unknown as Bank };
}

function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function summarizeBankChange(prev: Bank | null, next: Bank): string {
  const head = `Banco nuevo del ${dayMonth(next.built)}: ${next.tests.length} tests, ${next.questions.length} preguntas`;
  if (prev === null) return `${head}. ¿Reemplazar?`;
  const diff = next.tests.length - prev.tests.length;
  const sign = diff >= 0 ? '+' : '';
  return `${head} (${sign}${diff} tests desde el ${dayMonth(prev.built)}). ¿Reemplazar?`;
}
