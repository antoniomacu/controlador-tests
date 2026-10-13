import { fireEvent, render, screen } from '@testing-library/preact';
import {
  createAttempt,
  finishAttempt,
  goTo,
  selectAnswer,
  toggleDoubt,
} from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';
import { Results } from '../../src/ui/Results';

const T0 = 1_000_000;
const q = (n: number, answer: 'a' | 'b'): Question => ({
  id: `X#${n}`,
  subject: 'temario',
  tema: 1,
  stem: `Enunciado ${n}`,
  answer,
  level: 'N2',
  options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` },
  cite: `T1, pág. ${n}`,
  explanation: `**Explicación** ${n}`,
  hook: `Gancho **clave ${n}**`,
});

function finished(): Attempt {
  let a = createAttempt({
    uuid: 'u',
    testId: 'X',
    title: 'Test X',
    subject: 'temario',
    kind: 'fixed',
    mode: 'exam',
    questions: [q(1, 'a'), q(2, 'a'), q(3, 'b')],
    limitMin: 3,
    passRef: 1,
    attemptNumber: 1,
    nowMs: T0,
  });
  a = selectAnswer(a, 'a', 1); // 1 correct
  a = goTo(a, 1, 2);
  a = selectAnswer(a, 'b', 3); // 2 wrong
  a = goTo(a, 2, 4);
  a = toggleDoubt(a); // 3 blank + doubt
  return finishAttempt(a, T0 + 65_000);
}

describe('Results', () => {
  it('summarises the score, pass reference and time', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getByText('Aciertos 1 · Fallos 1 · Blancos 1')).toBeTruthy();
    expect(screen.getByText('Nota neta 0.67')).toBeTruthy();
    expect(screen.getByText('Referencia de aprobado 1: no alcanzada')).toBeTruthy();
    expect(screen.getByText('Tiempo 01:05 de 03:00 · Modo examen')).toBeTruthy();
  });

  it('filters the review list', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Fallos' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Enunciado 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dudas' }));
    expect(screen.getByText('Enunciado 3')).toBeTruthy();
  });

  it('renders explanation markdown, citation and hook', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    expect(screen.getAllByText('Explicación')[0].tagName).toBe('STRONG');
    expect(screen.getByText('[T1, pág. 2] · N2')).toBeTruthy();
    expect(screen.getByText('clave 2').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('marks the correct option and a wrong choice in text, not only colour', () => {
    render(<Results attempt={finished()} onChange={vi.fn()} onHome={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fallos' }));
    expect(screen.getByText('a) A2 — correcta')).toBeTruthy();
    expect(screen.getByText('b) B2 — tu respuesta')).toBeTruthy();
  });

  it('offers a cause only on wrong or doubted questions and reports the change', () => {
    const onChange = vi.fn<(a: Attempt) => void>();
    render(<Results attempt={finished()} onChange={onChange} onHome={vi.fn()} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    fireEvent.change(selects[0], { target: { value: 'Confundí dos conceptos' } });
    expect(onChange.mock.calls[0][0].items[1].cause).toBe('Confundí dos conceptos');
  });
});
