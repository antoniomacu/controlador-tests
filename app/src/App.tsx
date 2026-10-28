import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  autoFinishIfExpired,
  createAttempt,
  markExported,
  nextAttemptNumber,
} from './domain/attempts';
import { summarizeBankChange, validateBank } from './domain/bank';
import { ALL, scopesFor, type ScopeFilter } from './domain/history';
import type { Attempt, Bank, Subject } from './domain/types';
import {
  deleteAttempt,
  getBank,
  getMeta,
  listAttempts,
  putAttempt,
  putAttempts,
  putBank,
  setMeta,
  type Db,
} from './storage/db';
import { buildResultsFile, deliverFile, downloadFile, type ShareNav } from './sync/exportResults';
import { readBankFile } from './sync/importBank';
import { Home, type HomeSection } from './ui/Home';
import { Results } from './ui/Results';
import { Runner } from './ui/Runner';
import { Setup, type BeginInput } from './ui/Setup';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; testId: string | null }
  | { name: 'run'; uuid: string }
  | { name: 'results'; uuid: string };

interface AppProps {
  db: Db;
  now?: () => number;
  newId?: () => string;
  confirmFn?: (message: string) => boolean;
  nav?: ShareNav;
  download?: (file: File) => void;
  UpdatePrompt?: (props: { hidden: boolean }) => JSX.Element | null;
}

const defaultNow = () => Date.now();
const defaultId = () => crypto.randomUUID();
const defaultConfirm = (message: string) => window.confirm(message);

export function App({
  db,
  now = defaultNow,
  newId = defaultId,
  confirmFn = defaultConfirm,
  nav = navigator,
  download = downloadFile,
  UpdatePrompt,
}: AppProps) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [subject, setSubject] = useState<Subject>('temario');
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Chapter chip per subject. Held here, not in Home, so it survives a test or a result screen.
  const [scopeBy, setScopeBy] = useState<Partial<Record<Subject, ScopeFilter>>>({});
  // Temas / Historial / Práctica: kept for the session so a result screen returns to it.
  const [section, setSection] = useState<HomeSection>('temas');

  // Startup: resume an open attempt, or finish it if an exam expired while the app was closed.
  useEffect(() => {
    void (async () => {
      // A bank stored by an older app version (schema 1) is upgraded in memory on load.
      const rawBank = await getBank(db);
      const checked = rawBank ? validateBank(rawBank) : null;
      const storedBank = checked?.ok ? checked.bank : null;
      let stored = await listAttempts(db);
      const open = stored.find((a) => a.status === 'in_progress');
      if (open) {
        const checked = autoFinishIfExpired(open, now());
        if (checked !== open) {
          await putAttempt(db, checked);
          stored = stored.map((a) => (a.uuid === checked.uuid ? checked : a));
        }
        setScreen(
          checked.status === 'in_progress'
            ? { name: 'run', uuid: checked.uuid }
            : { name: 'results', uuid: checked.uuid },
        );
      }
      // Read before the first render so a remembered chapter never flashes "Todos".
      setScopeBy((await getMeta<Partial<Record<Subject, ScopeFilter>>>(db, 'scopeFilter')) ?? {});
      setBank(storedBank);
      setAttempts(stored);
      setLoaded(true);
    })();
  }, [db, now]);

  /** Every change is written to IndexedDB immediately, so a killed app loses nothing. */
  const save = useCallback(
    (attempt: Attempt) => {
      setAttempts((prev) =>
        prev.some((a) => a.uuid === attempt.uuid)
          ? prev.map((a) => (a.uuid === attempt.uuid ? attempt : a))
          : [...prev, attempt],
      );
      void putAttempt(db, attempt);
    },
    [db],
  );

  const onFinished = useCallback(
    (attempt: Attempt) => {
      save(attempt);
      setScreen({ name: 'results', uuid: attempt.uuid });
    },
    [save],
  );

  /** Hard-deletes an attempt that never left the phone: abandoned, or deleted from its results. */
  const removeAttempt = useCallback(
    (uuid: string) => {
      setAttempts((prev) => prev.filter((a) => a.uuid !== uuid));
      void deleteAttempt(db, uuid);
      setScreen({ name: 'home' });
    },
    [db],
  );

  function begin(input: BeginInput) {
    const attempt = createAttempt({
      ...input,
      uuid: newId(),
      nowMs: now(),
      attemptNumber: input.kind === 'fixed' ? nextAttemptNumber(attempts, input.testId) : 1,
    });
    save(attempt);
    setScreen({ name: 'run', uuid: attempt.uuid });
  }

  async function onImport(file: File) {
    const result = await readBankFile(file);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (!confirmFn(summarizeBankChange(bank, result.bank))) return;
    await putBank(db, result.bank);
    setBank(result.bank);
    setMessage('Banco importado.');
  }

  async function onExport() {
    const file = buildResultsFile(attempts, new Date(now()));
    if (!file) {
      setMessage('No hay intentos terminados que exportar.');
      return;
    }
    const outcome = await deliverFile(file, nav, download);
    if (outcome === 'cancelled') return;
    const updated = markExported(attempts);
    await putAttempts(db, updated);
    await setMeta(db, 'lastExport', new Date(now()).toISOString());
    setAttempts(updated);
    setMessage(
      outcome === 'shared' ? 'Resultados compartidos.' : 'Resultados guardados en Archivos.',
    );
  }

  function onScope(scope: ScopeFilter) {
    const next = { ...scopeBy, [subject]: scope };
    setScopeBy(next);
    void setMeta(db, 'scopeFilter', next);
  }

  if (!loaded) return <main class="loading">Cargando…</main>;

  // A remembered chapter that a new bank no longer has falls back to "Todos".
  const remembered = scopeBy[subject];
  const scope = remembered && scopesFor(bank, subject).includes(remembered) ? remembered : ALL;

  const current = 'uuid' in screen ? attempts.find((a) => a.uuid === screen.uuid) : undefined;
  let body: JSX.Element;
  if (screen.name === 'run' && current) {
    body = (
      <Runner
        attempt={current}
        now={now}
        confirmFn={confirmFn}
        onChange={save}
        onFinished={onFinished}
        onAbandon={removeAttempt}
      />
    );
  } else if (screen.name === 'results' && current) {
    body = (
      <Results
        attempt={current}
        onChange={save}
        onHome={() => setScreen({ name: 'home' })}
        onDelete={removeAttempt}
        confirmFn={confirmFn}
      />
    );
  } else if (screen.name === 'setup' && bank) {
    const test = screen.testId ? (bank.tests.find((t) => t.id === screen.testId) ?? null) : null;
    body = (
      <Setup
        bank={bank}
        subject={subject}
        test={test}
        attemptNumber={test ? nextAttemptNumber(attempts, test.id) : 1}
        now={now}
        onBegin={begin}
        onCancel={() => setScreen({ name: 'home' })}
      />
    );
  } else {
    body = (
      <Home
        bank={bank}
        attempts={attempts}
        subject={subject}
        nowMs={now()}
        message={message}
        onSubject={setSubject}
        onOpenTest={(testId) => setScreen({ name: 'setup', testId })}
        onRandom={() => setScreen({ name: 'setup', testId: null })}
        onImport={(file) => void onImport(file)}
        onExport={() => void onExport()}
        onOpenAttempt={(uuid) => setScreen({ name: 'results', uuid })}
        scope={scope}
        onScope={onScope}
        section={section}
        onSection={setSection}
      />
    );
  }

  return (
    <>
      {UpdatePrompt && <UpdatePrompt hidden={screen.name === 'run'} />}
      {body}
    </>
  );
}
