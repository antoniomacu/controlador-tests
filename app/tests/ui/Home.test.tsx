import { fireEvent, render, screen } from '@testing-library/preact';
import type { Attempt, Bank } from '../../src/domain/types';
import { ALL } from '../../src/domain/history';
import { Home } from '../../src/ui/Home';

const bank: Bank = {
  schema: 2,
  built: 'x',
  groups: { temario: { '4': 'Tema 4' }, ingles: {} },
  questions: [
    {
      id: 'A#1',
      subject: 'temario',
      tema: 4,
      group: '4',
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
    {
      id: 'SYN-T3-001',
      subject: 'temario',
      scope: 'T3',
      title: 'Tema 3: Meteorología',
      questions: ['A#1'],
      limit_min: 1,
      pass_ref: 0,
      synthetic: true,
    },
  ],
};
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-14T12:00:00Z');
const done = (finished: string, exported = false, testId = 'SYN-T4-001', passRef = 0) =>
  ({
    uuid: `${testId}@${finished}`,
    test_id: testId,
    subject: 'temario',
    pass_ref: passRef,
    status: 'finished',
    finished,
    started: finished,
    exported,
    title: 'Tema 4: Cartografía',
    items: [{ key: 'a', ans: 'a' }],
  }) as unknown as Attempt;

function baseProps(attempts: Attempt[]) {
  return {
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
    scope: ALL,
    onScope: vi.fn(),
    section: 'temas' as const,
    onSection: vi.fn(),
    onResume: vi.fn(),
  };
}

function renderHome(attempts: Attempt[], over: Record<string, unknown> = {}) {
  const props = { ...baseProps(attempts), ...over };
  render(<Home {...props} />);
  return props;
}

/** Like renderHome, but hands back unmount so one test can render several sections. */
function renderHomeWith(over: Record<string, unknown>) {
  const props = { ...baseProps([]), ...over };
  return render(<Home {...props} />);
}

describe('Home', () => {
  it('lists tests by scope with their status', () => {
    renderHome([done('2026-10-13T10:00:00Z')]);
    expect(screen.getByRole('heading', { name: 'T4' })).toBeTruthy();
    expect(screen.getByText('2026-10-13 · neta 1 · 1 intento(s)')).toBeTruthy();
  });

  it('shows "Sin hacer" for untaken tests and opens setup on tap', () => {
    const props = renderHome([]);
    expect(screen.getAllByText('Sin hacer').length).toBeGreaterThan(0);
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

  it('shows a pinned chapter row with Todos pressed and every chapter section', () => {
    renderHome([]);
    const nav = screen.getByRole('navigation', { name: 'Temas' });
    const chips = Array.from(nav.querySelectorAll('button')).map((b) => b.textContent);
    expect(chips).toEqual(['Todos', 'T4', 'T3']);
    expect(screen.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'T3' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T4' })).toBeTruthy();
  });

  it('asks to change chapter when a chip is tapped', () => {
    const props = renderHome([]);
    fireEvent.click(screen.getByRole('button', { name: 'T4' }));
    expect(props.onScope).toHaveBeenCalledWith('T4');
  });

  it('shows only the chosen chapter, with all of its attempts and none of the others', () => {
    const t4 = Array.from({ length: 12 }, (_, i) =>
      done(`2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const t3 = done('2026-10-20T10:00:00Z', false, 'SYN-T3-001');
    renderHome([...t4, t3], { scope: 'T4', section: 'historial' });
    expect(screen.getByRole('heading', { name: 'Historial · T4' })).toBeTruthy();
    const rows = document.querySelectorAll('.history-row');
    expect(rows).toHaveLength(12);
    expect(Array.from(rows).some((r) => r.textContent?.includes('Tema 3'))).toBe(false);
  });

  it('flags a low score with the word bajo, not colour alone', () => {
    renderHome([done('2026-10-13T10:00:00Z', false, 'SYN-T4-001', 10)], { section: 'historial' });
    const row = document.querySelector('.history-row');
    expect(row?.querySelector('.low')?.textContent).toBe('bajo');
  });

  it('does not flag a passing score', () => {
    renderHome([done('2026-10-13T10:00:00Z', false, 'SYN-T4-001', 0)], { section: 'historial' });
    expect(document.querySelector('.history-row')).not.toBeNull();
    expect(document.querySelector('.history-row .low')).toBeNull();
  });

  it('hides the chapter row for a subject with a single scope', () => {
    renderHome([], { subject: 'ingles' });
    expect(screen.queryByRole('navigation', { name: 'Temas' })).toBeNull();
  });

  it('shows only that chapter\'s tests under Temas, without history or random practice', () => {
    renderHome([done('2026-10-13T10:00:00Z')], { scope: 'T4' });
    expect(screen.getByRole('heading', { name: 'T4' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'T3' })).toBeNull();
    expect(document.querySelector('.history-row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Práctica aleatoria' })).toBeNull();
  });

  it('offers Temas, Historial and Práctica in the pinned header, Temas selected', () => {
    renderHome([]);
    const header = document.querySelector('header.home-top')!;
    const sections = header.querySelector('[role="tablist"][aria-label="Sección"]');
    expect(sections).not.toBeNull();
    const tabs = Array.from(sections!.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Temas', 'Historial', 'Práctica']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('asks to change section when a section tab is tapped', () => {
    const props = renderHome([]);
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(props.onSection).toHaveBeenCalledWith('historial');
  });

  it('shows the history with the chapter row and no test list under Historial', () => {
    renderHome([done('2026-10-13T10:00:00Z')], { section: 'historial' });
    expect(screen.getByRole('navigation', { name: 'Temas' })).toBeTruthy();
    expect(document.querySelectorAll('.history-row')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'T4' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tema 3: Meteorología/ })).toBeNull();
  });

  it('says there are no attempts when the chosen history is empty', () => {
    renderHome([], { section: 'historial', scope: 'T3' });
    expect(screen.getByText('Sin intentos en T3.')).toBeTruthy();
  });

  it('shows only random practice, without chapter row, under Práctica', () => {
    const props = renderHome([done('2026-10-13T10:00:00Z')], { section: 'practica' });
    expect(screen.queryByRole('navigation', { name: 'Temas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'T4' })).toBeNull();
    expect(document.querySelector('.history-row')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Práctica aleatoria' }));
    expect(props.onRandom).toHaveBeenCalled();
  });

  it('keeps the sync footer in every section', () => {
    for (const section of ['temas', 'historial', 'practica'] as const) {
      const { unmount } = renderHomeWith({ section });
      expect(screen.getByText('Importar banco')).toBeTruthy();
      unmount();
    }
  });

  it('offers to continue an unfinished test from every section', () => {
    const open = { ...done('2026-10-13T10:00:00Z'), status: 'in_progress' } as Attempt;
    const props = renderHome([open], { section: 'practica' });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar: Tema 4: Cartografía' }));
    expect(props.onResume).toHaveBeenCalled();
  });

  it('shows no continue button when nothing is in progress', () => {
    renderHome([done('2026-10-13T10:00:00Z')]);
    expect(screen.queryByRole('button', { name: /Continuar/ })).toBeNull();
  });

  it('takes the page back to the top when the section changes mid-scroll', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    renderHome([]);
    fireEvent.click(screen.getByRole('tab', { name: 'Práctica' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('takes the page back to the chapter row when a chip is tapped mid-scroll', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    renderHome([]);
    fireEvent.click(screen.getByRole('button', { name: 'T4' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('keeps the subject tabs and the chapter row in the same pinned header', () => {
    renderHome([]);
    const header = document.querySelector('header.home-top');
    expect(header).not.toBeNull();
    expect(header!.querySelector('[role="tablist"]')).not.toBeNull();
    expect(header!.querySelector('nav[aria-label="Temas"]')).not.toBeNull();
  });
});
