import { fireEvent, render, screen } from '@testing-library/preact';
import type { Bank, Question } from '../../src/domain/types';
import { Setup, type BeginInput } from '../../src/ui/Setup';

const q = (id: string, tema: number): Question => ({
  id,
  subject: 'temario',
  tema,
  group: String(tema),
  stem: id,
  answer: 'a',
  level: 'N1',
  options: { a: '1', b: '2', c: '3', d: '4' },
});
const bank: Bank = {
  schema: 2,
  built: 'x',
  groups: { temario: { '3': 'Tema 3', '4': 'Tema 4' }, ingles: { morfo: 'Morfología' } },
  questions: [
    q('A#1', 3),
    q('A#2', 3),
    q('B#1', 4),
    { ...q('E#1', 0), subject: 'ingles', tema: null, group: 'morfo' },
  ],
  tests: [
    {
      id: 'SYN-T3-001',
      subject: 'temario',
      scope: 'T3',
      title: 'Tema 3',
      questions: ['A#1', 'A#2'],
      limit_min: 2,
      pass_ref: 1,
      synthetic: true,
    },
  ],
};
const NOW = new Date(2026, 9, 14, 20, 30, 15).getTime();
const now = () => NOW;

describe('Setup', () => {
  it('starts a fixed test in the chosen mode', () => {
    const onBegin = vi.fn<(i: BeginInput) => void>();
    render(
      <Setup
        bank={bank}
        subject="temario"
        test={bank.tests[0]}
        attemptNumber={1}
        now={now}
        onBegin={onBegin}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Tiempo: 2 min')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Práctica (límite blando, con pausa)'));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(onBegin.mock.calls[0][0]).toMatchObject({
      testId: 'SYN-T3-001',
      kind: 'fixed',
      mode: 'practice',
      limitMin: 2,
      passRef: 1,
    });
    expect(onBegin.mock.calls[0][0].questions.map((x) => x.id)).toEqual(['A#1', 'A#2']);
  });

  it('warns that repeat attempts do not count', () => {
    render(
      <Setup
        bank={bank}
        subject="temario"
        test={bank.tests[0]}
        attemptNumber={2}
        now={now}
        onBegin={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Intento 2: no cuenta en tus series.')).toBeTruthy();
  });

  it('builds a random test from ticked chapters, capped at what is available', () => {
    const onBegin = vi.fn<(i: BeginInput) => void>();
    render(
      <Setup
        bank={bank}
        subject="temario"
        test={null}
        attemptNumber={1}
        now={now}
        onBegin={onBegin}
        onCancel={vi.fn()}
      />,
    );
    const start = screen.getByRole('button', { name: 'Empezar' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Tema 3 (2)'));
    fireEvent.click(start);
    const input = onBegin.mock.calls[0][0];
    expect(input).toMatchObject({
      testId: 'RND-T3-20261014-203015',
      kind: 'random',
      mode: 'exam',
      limitMin: 2,
      passRef: 1,
    });
    expect(input.questions).toHaveLength(2);
  });
});

describe('Setup in English', () => {
  it('offers areas with labels and builds an RND-ING test', () => {
    const onBegin = vi.fn<(i: BeginInput) => void>();
    render(
      <Setup
        bank={bank}
        subject="ingles"
        test={null}
        attemptNumber={1}
        now={now}
        onBegin={onBegin}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/Tema 3/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Morfología (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(onBegin.mock.calls[0][0]).toMatchObject({
      testId: 'RND-ING-20261014-203015',
      kind: 'random',
      subject: 'ingles',
      title: 'Práctica aleatoria — Morfología',
    });
  });
});
