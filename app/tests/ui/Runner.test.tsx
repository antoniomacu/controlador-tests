import { fireEvent, render, screen } from '@testing-library/preact';
import { createAttempt } from '../../src/domain/attempts';
import type { Attempt, Question } from '../../src/domain/types';
import { Runner } from '../../src/ui/Runner';

const T0 = 1_000_000;
const q = (n: number): Question => ({
  id: `X#${n}`,
  subject: 'temario',
  tema: 1,
  group: '1',
  stem: `Enunciado ${n}`,
  answer: 'a',
  level: 'N1',
  options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` },
});

function setup(mode: 'exam' | 'practice' = 'exam', nowMs = T0 + 5000) {
  const attempt = createAttempt({
    uuid: 'u',
    testId: 'X',
    title: 'Test X',
    subject: 'temario',
    kind: 'fixed',
    mode,
    questions: [q(1), q(2)],
    limitMin: 2,
    passRef: 1,
    attemptNumber: 1,
    nowMs: T0,
  });
  const onChange = vi.fn<(a: Attempt) => void>();
  const onFinished = vi.fn<(a: Attempt) => void>();
  const onAbandon = vi.fn<(uuid: string) => void>();
  const confirmFn = vi.fn(() => true);
  const now = () => nowMs;
  render(
    <Runner
      attempt={attempt}
      now={now}
      confirmFn={confirmFn}
      onChange={onChange}
      onFinished={onFinished}
      onAbandon={onAbandon}
    />,
  );
  return { attempt, onChange, onFinished, onAbandon, confirmFn };
}

describe('Runner', () => {
  it('shows the question, progress and remaining time', () => {
    setup();
    expect(screen.getByText('Enunciado 1')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('01:55')).toBeTruthy();
  });

  it('selecting an option reports the new attempt', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /A1/ }));
    expect(onChange.mock.calls[0][0].items[0].ans).toBe('a');
    expect(onChange.mock.calls[0][0].items[0].first_answered_at_secs).toBe(5);
  });

  it('toggles doubt and stuck', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Duda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atasco' }));
    expect(onChange.mock.calls[0][0].items[0].doubt).toBe(true);
    expect(onChange.mock.calls[1][0].items[0].stuck).toBe(true);
  });

  it('navigates with next and via the grid', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onChange.mock.calls[0][0].current).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cuadrícula' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a la pregunta 2' }));
    expect(onChange.mock.calls[1][0].current).toBe(1);
  });

  it('finishing asks for confirmation mentioning blanks', () => {
    const { onFinished, confirmFn } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(confirmFn).toHaveBeenCalledWith('¿Terminar el test? Quedan 2 en blanco.');
    expect(onFinished.mock.calls[0][0].status).toBe('finished');
  });

  it('auto-finishes an exam when time is up', () => {
    const { onFinished } = setup('exam', T0 + 200_000);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0][0].total_secs).toBe(120);
  });

  it('practice mode shows overtime and a pause button', () => {
    setup('practice', T0 + 130_000);
    expect(screen.getByText('+00:10')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausa' })).toBeTruthy();
  });

  it('abandons after confirmation without finishing', () => {
    const { onAbandon, onFinished, confirmFn } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Abandonar' }));
    expect(confirmFn).toHaveBeenCalledWith(
      '¿Abandonar este intento? Se borrará y no contará para nada.',
    );
    expect(onAbandon).toHaveBeenCalledWith('u');
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('exam mode has no pause button', () => {
    setup('exam');
    expect(screen.queryByRole('button', { name: 'Pausa' })).toBeNull();
  });

  it('puts Abandonar in the top bar, once, still behind a confirmation', () => {
    const { onAbandon, confirmFn } = setup();
    const buttons = screen.getAllByRole('button', { name: 'Abandonar' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest('header.runner-bar')).not.toBeNull();
    fireEvent.click(buttons[0]);
    expect(confirmFn).toHaveBeenCalledWith(
      '¿Abandonar este intento? Se borrará y no contará para nada.',
    );
    expect(onAbandon).toHaveBeenCalledWith('u');
  });
});
