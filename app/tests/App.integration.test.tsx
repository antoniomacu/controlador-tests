import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../src/App';
import type { Bank } from '../src/domain/types';
import { getMeta, listAttempts, openAppDb, putBank, setMeta, type Db } from '../src/storage/db';

const bank: Bank = {
  schema: 2,
  built: '2026-10-13T18:00:00+02:00',
  groups: { temario: { '4': 'Tema 4' }, ingles: {} },
  questions: [1, 2].map((n) => ({
    id: `SYN-T4-001#${n}`,
    subject: 'temario' as const,
    tema: 4,
    group: '4',
    stem: `Enunciado ${n}`,
    answer: 'a' as const,
    level: 'N1' as const,
    options: { a: `A${n}`, b: `B${n}`, c: `C${n}`, d: `D${n}` },
    explanation: 'Porque sí.',
  })),
  tests: [
    {
      id: 'SYN-T4-001',
      subject: 'temario',
      scope: 'T4',
      title: 'Tema 4',
      questions: ['SYN-T4-001#1', 'SYN-T4-001#2'],
      limit_min: 2,
      pass_ref: 1,
      synthetic: true,
    },
    {
      id: 'SYN-T3-001',
      subject: 'temario',
      scope: 'T3',
      title: 'Tema 3',
      questions: ['SYN-T4-001#1'],
      limit_min: 2,
      pass_ref: 1,
      synthetic: true,
    },
  ],
};

let n = 0;
let db: Db;
let clock = 1_000_000;
const now = () => clock;
const newId = () => `id-${n}`;
const confirmFn = () => true;

beforeEach(async () => {
  db = await openAppDb(`app-it-${n++}`);
  await putBank(db, bank);
  clock = 1_000_000;
});

function mount(extra: Record<string, unknown> = {}) {
  return render(<App db={db} now={now} newId={newId} confirmFn={confirmFn} {...extra} />);
}

async function startTest() {
  fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByText('Enunciado 1');
}

async function finishAndGoHome() {
  fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Volver al inicio' }));
}

/** The iPhone back gesture: a drag from the left edge across most of the screen. */
function swipeBack(fromX = 5) {
  fireEvent.touchStart(document, { touches: [{ clientX: fromX, clientY: 300 }] });
  fireEvent.touchMove(document, { touches: [{ clientX: fromX + 500, clientY: 310 }] });
  fireEvent.touchEnd(document, { changedTouches: [{ clientX: fromX + 500, clientY: 310 }] });
}

async function startPractice(title = /Tema 4/) {
  fireEvent.click(await screen.findByRole('button', { name: title }));
  fireEvent.click(screen.getByLabelText(/Práctica \(límite blando/));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
  await screen.findByText(/Enunciado/);
}

describe('App', () => {
  it('persists every action and resumes on the same question after a restart', async () => {
    mount();
    await startTest();
    fireEvent.click(screen.getByRole('button', { name: /A1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(async () => {
      const [saved] = await listAttempts(db);
      expect(saved.items[0].ans).toBe('a');
      expect(saved.current).toBe(1);
    });

    cleanup();
    mount();
    expect(await screen.findByText('Enunciado 2')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('finishes an exam that expired while the app was closed', async () => {
    mount();
    await startTest();
    cleanup();

    clock += 10 * 60 * 1000;
    mount();
    expect(await screen.findByText('Tiempo 02:00 de 02:00 · Modo examen')).toBeTruthy();
    const [saved] = await listAttempts(db);
    expect(saved.status).toBe('finished');
  });

  it('does not mark attempts exported when the share sheet is dismissed', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(abort) };
    mount({ nav, download: vi.fn() });
    await startTest();
    await finishAndGoHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar resultados (1)' }));
    await waitFor(() => expect(nav.share).toHaveBeenCalled());
    const [saved] = await listAttempts(db);
    expect(saved.exported).toBe(false);
  });

  it('marks attempts exported after a successful share', async () => {
    const nav = { canShare: () => true, share: vi.fn().mockResolvedValue(undefined) };
    mount({ nav });
    await startTest();
    await finishAndGoHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar resultados (1)' }));
    expect(await screen.findByRole('button', { name: 'Exportar resultados (0)' })).toBeTruthy();
    const [saved] = await listAttempts(db);
    expect(saved.exported).toBe(true);
  });

  it('abandoning deletes the attempt and returns home', async () => {
    mount();
    await startTest();
    fireEvent.click(screen.getByRole('button', { name: 'Abandonar' }));
    expect(await screen.findByRole('button', { name: /Tema 4/ })).toBeTruthy();
    await waitFor(async () => expect(await listAttempts(db)).toHaveLength(0));
    expect(screen.getAllByText('Sin hacer')).toHaveLength(2);
  });

  it('keeps working with a schema-1 bank stored before the update', async () => {
    const v1 = {
      ...bank,
      schema: 1,
      groups: undefined,
      questions: bank.questions.map(({ group: _g, ...q }) => ({ ...q, cite: 'T4, pág. 1' })),
    };
    await putBank(db, v1 as never);
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Práctica' }));
    fireEvent.click(screen.getByRole('button', { name: 'Práctica aleatoria' }));
    fireEvent.click(screen.getByLabelText(/Tema 4/));
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText(/Enunciado/)).toBeTruthy();
  });

  it('keeps the old bank when an invalid file is imported', async () => {
    const { container } = mount();
    await screen.findByRole('button', { name: /Tema 4/ });
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const bad = new File([JSON.stringify({ schema: 1, attempts: [] })], 'results.json');
    fireEvent.change(input, { target: { files: [bad] } });
    expect(await screen.findByText('Este archivo es un results.json, no un banco.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tema 4/ })).toBeTruthy();
  });

  const pressed = (name: string) =>
    screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

  it('keeps the chosen chapter after a test and after opening an attempt', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'T4' }));
    await startTest();
    await finishAndGoHome();
    expect(pressed('T4')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    fireEvent.click(document.querySelector('.history-row') as Element);
    fireEvent.click(await screen.findByRole('button', { name: 'Volver al inicio' }));
    // Back on the same section and chapter the attempt was opened from.
    expect(screen.getByRole('tab', { name: 'Historial' }).getAttribute('aria-selected')).toBe('true');
    expect(pressed('T4')).toBe(true);
  });

  it('keeps one chapter per subject when switching tabs', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'T4' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Inglés' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Temario' }));
    expect(pressed('T4')).toBe(true);
  });

  it('remembers the chapter across a restart', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'T4' }));
    await waitFor(async () => expect(await getMeta(db, 'scopeFilter')).toEqual({ temario: 'T4' }));
    cleanup();
    mount();
    await screen.findByRole('button', { name: 'T4' });
    expect(pressed('T4')).toBe(true);
  });

  it('falls back to Todos when the remembered chapter is no longer in the bank', async () => {
    await setMeta(db, 'scopeFilter', { temario: 'T7' });
    mount();
    await screen.findByRole('button', { name: 'Todos' });
    expect(pressed('Todos')).toBe(true);
    expect(screen.getByRole('heading', { name: 'T4' })).toBeTruthy();
  });

  it('deletes a finished, unexported attempt from its result screen', async () => {
    mount();
    await startTest();
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar intento' }));
    expect(await screen.findByRole('button', { name: 'Exportar resultados (0)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
    expect(screen.getByText('Sin intentos.')).toBeTruthy();
    expect(document.querySelector('.history-row')).toBeNull();
    await waitFor(async () => expect(await listAttempts(db)).toHaveLength(0));
  });

  describe('edge swipe back', () => {
    it('returns from an attempt review to the Historial it was opened from', async () => {
      mount();
      await startTest();
      await finishAndGoHome();
      fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
      fireEvent.click(document.querySelector('.history-row') as Element);
      await screen.findByRole('button', { name: 'Volver al inicio' });
      swipeBack();
      expect(screen.getByRole('tab', { name: 'Historial' }).getAttribute('aria-selected')).toBe(
        'true',
      );
      expect(screen.queryByRole('button', { name: 'Volver al inicio' })).toBeNull();
    });

    it('returns from the setup screen to home', async () => {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
      swipeBack();
      expect(screen.queryByRole('button', { name: 'Empezar' })).toBeNull();
      expect(screen.getByRole('tab', { name: 'Temas' })).toBeTruthy();
    });

    it('ignores a drag that does not start at the left edge', async () => {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: /Tema 4/ }));
      swipeBack(100);
      expect(screen.getByRole('button', { name: 'Empezar' })).toBeTruthy();
    });

    it('leaves a practice test without asking, paused, and resumes it from home', async () => {
      const ask = vi.fn(() => true);
      mount({ confirmFn: ask });
      await startPractice();
      swipeBack();
      expect(ask).not.toHaveBeenCalled();
      await waitFor(async () => {
        const [saved] = await listAttempts(db);
        expect(saved.status).toBe('in_progress');
        expect(saved.timer.pausedAtMs).not.toBeNull();
      });
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
      expect(await screen.findByText('Enunciado 1')).toBeTruthy();
      await waitFor(async () => expect((await listAttempts(db))[0].timer.pausedAtMs).toBeNull());
    });

    it('warns before leaving a real exam and stays when the warning is declined', async () => {
      const ask = vi.fn(() => false);
      mount({ confirmFn: ask });
      await startTest();
      swipeBack();
      expect(ask).toHaveBeenCalledWith(
        '¿Salir del examen? El reloj sigue corriendo y se terminará solo al acabar el tiempo.',
      );
      expect(screen.getByText('Enunciado 1')).toBeTruthy();
    });

    it('keeps an exam left from the runner, which finishes itself once its time is up', async () => {
      mount();
      await startTest();
      swipeBack();
      expect(screen.getByRole('button', { name: /Continuar/ })).toBeTruthy();
      expect((await listAttempts(db))[0].status).toBe('in_progress');
      clock += 10 * 60 * 1000;
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
      expect(await screen.findByText('Tiempo 02:00 de 02:00 · Modo examen')).toBeTruthy();
    });

    it('asks before replacing an unfinished test with a new one', async () => {
      const ask = vi.fn(() => true);
      mount({ confirmFn: ask });
      await startPractice();
      swipeBack();
      await startPractice(/Tema 3/);
      expect(ask).toHaveBeenCalledWith(
        'Tienes un test sin terminar (Tema 4). ¿Abandonarlo y empezar este?',
      );
      await waitFor(async () => {
        const saved = await listAttempts(db);
        expect(saved).toHaveLength(1);
        expect(saved[0].test_id).toBe('SYN-T3-001');
      });
    });
  });
});
