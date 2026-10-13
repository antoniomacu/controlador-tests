import { summarizeBankChange, validateBank } from '../../src/domain/bank';
import type { Bank } from '../../src/domain/types';

function validBank(): Bank {
  return {
    schema: 1,
    built: '2026-10-13T18:00:00+02:00',
    questions: [
      {
        id: 'SYN-T4-001#1',
        subject: 'temario',
        tema: 4,
        stem: '¿?',
        answer: 'c',
        level: 'N1',
        options: { a: '1', b: '2', c: '3', d: '4' },
        cite: 'T4, pág. 6',
        explanation: 'x',
        hook: null,
        subtipo: 't4-x',
      },
    ],
    tests: [
      {
        id: 'SYN-T4-001',
        subject: 'temario',
        scope: 'T4',
        title: 'Tema 4',
        questions: ['SYN-T4-001#1'],
        limit_min: 1,
        pass_ref: 0,
        synthetic: true,
      },
    ],
  };
}

describe('validateBank', () => {
  it('accepts a valid bank', () => {
    expect(validateBank(validBank()).ok).toBe(true);
  });

  it('recognises a results file picked by mistake', () => {
    expect(validateBank({ schema: 1, exported: 'x', attempts: [] })).toEqual({
      ok: false,
      error: 'Este archivo es un results.json, no un banco.',
    });
  });

  it('rejects non-objects and unknown schema versions', () => {
    expect(validateBank(null)).toEqual({ ok: false, error: 'El archivo no es un banco.' });
    expect(validateBank({ ...validBank(), schema: 2 })).toEqual({
      ok: false,
      error: 'Versión de banco no soportada: 2.',
    });
  });

  it('names the broken question', () => {
    const bank = validBank();
    (bank.questions[0] as unknown as Record<string, unknown>).answer = 'e';
    expect(validateBank(bank)).toEqual({
      ok: false,
      error: 'Pregunta SYN-T4-001#1: respuesta inválida.',
    });
  });

  it('rejects a test that references a missing question', () => {
    const bank = validBank();
    bank.tests[0].questions = ['NOPE#1'];
    expect(validateBank(bank)).toEqual({
      ok: false,
      error: 'Test SYN-T4-001: la pregunta NOPE#1 no existe.',
    });
  });

  it('rejects duplicate question IDs', () => {
    const bank = validBank();
    bank.questions.push({ ...bank.questions[0] });
    expect(validateBank(bank)).toEqual({ ok: false, error: 'Pregunta SYN-T4-001#1 repetida.' });
  });
});

describe('summarizeBankChange', () => {
  it('describes a first import', () => {
    expect(summarizeBankChange(null, validBank())).toBe(
      'Banco nuevo del 13/10: 1 tests, 1 preguntas. ¿Reemplazar?',
    );
  });

  it('describes the difference with the previous bank', () => {
    const prev = { ...validBank(), built: '2026-10-08T10:00:00+02:00', tests: [] };
    expect(summarizeBankChange(prev, validBank())).toBe(
      'Banco nuevo del 13/10: 1 tests, 1 preguntas (+1 tests desde el 08/10). ¿Reemplazar?',
    );
  });
});
