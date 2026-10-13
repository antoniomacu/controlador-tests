import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../src/App';
import type { Bank } from '../src/domain/types';
import { listAttempts, openAppDb, putBank, type Db } from '../src/storage/db';

const bank: Bank = {
  schema: 1,
  built: '2026-10-13T18:00:00+02:00',
  questions: [1, 2].map((n) => ({
    id: `SYN-T4-001#${n}`,
    subject: 'temario' as const,
    tema: 4,
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
    expect(screen.getByText('Sin hacer')).toBeTruthy();
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
});
