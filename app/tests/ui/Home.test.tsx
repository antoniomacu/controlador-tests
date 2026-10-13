import { fireEvent, render, screen } from '@testing-library/preact';
import type { Attempt, Bank } from '../../src/domain/types';
import { Home } from '../../src/ui/Home';

const bank: Bank = {
  schema: 1,
  built: 'x',
  questions: [
    {
      id: 'A#1',
      subject: 'temario',
      tema: 4,
      stem: 's',
      answer: 'a',
      level: 'N1',
      options: { a: '1', b: '2', c: '3', d: '4' },
    },
  ],
  tests: [
    {
      id: 'SYN-T4-001',
      subject: 'temario',
      scope: 'T4',
      title: 'Tema 4: Cartografía',
      questions: ['A#1'],
      limit_min: 1,
      pass_ref: 0,
      synthetic: true,
    },
  ],
};
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-14T12:00:00Z');
const done = (finished: string, exported = false) =>
  ({
    uuid: finished,
    test_id: 'SYN-T4-001',
    status: 'finished',
    finished,
    started: finished,
    exported,
    title: 'Tema 4: Cartografía',
    items: [{ key: 'a', ans: 'a' }],
  }) as unknown as Attempt;

function renderHome(attempts: Attempt[], over: Record<string, unknown> = {}) {
  const props = {
    bank,
    attempts,
    subject: 'temario' as const,
    nowMs: NOW,
    message: null,
    onSubject: vi.fn(),
    onOpenTest: vi.fn(),
    onRandom: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onOpenAttempt: vi.fn(),
    ...over,
  };
  render(<Home {...props} />);
  return props;
}

describe('Home', () => {
  it('lists tests by scope with their status', () => {
    renderHome([done('2026-10-13T10:00:00Z')]);
    expect(screen.getByText('T4')).toBeTruthy();
    expect(screen.getByText('2026-10-13 · neta 1 · 1 intento(s)')).toBeTruthy();
  });

  it('shows "Sin hacer" for untaken tests and opens setup on tap', () => {
    const props = renderHome([]);
    expect(screen.getByText('Sin hacer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tema 4: Cartografía/ }));
    expect(props.onOpenTest).toHaveBeenCalledWith('SYN-T4-001');
  });

  it('disables export when nothing is finished', () => {
    renderHome([]);
    const button = screen.getByRole('button', { name: 'Exportar resultados (0)' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the export reminder after 7 days', () => {
    const old = new Date(NOW - 8 * DAY).toISOString();
    renderHome([done(old)]);
    expect(screen.getByText('1 intento(s) sin exportar — exporta ya')).toBeTruthy();
  });

  it('asks for a bank when there is none', () => {
    renderHome([], { bank: null });
    expect(screen.getByText('No hay banco. Importa bank.json para empezar.')).toBeTruthy();
  });
});
