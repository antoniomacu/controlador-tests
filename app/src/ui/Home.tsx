import { needsExportReminder, pendingExportCount } from '../domain/attempts';
import { score } from '../domain/scoring';
import type { Attempt, Bank, Subject, TestDef } from '../domain/types';

interface HomeProps {
  bank: Bank | null;
  attempts: Attempt[];
  subject: Subject;
  nowMs: number;
  message: string | null;
  onSubject: (subject: Subject) => void;
  onOpenTest: (testId: string) => void;
  onRandom: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onOpenAttempt: (uuid: string) => void;
}

function status(test: TestDef, attempts: Attempt[]): string {
  const done = attempts.filter((a) => a.test_id === test.id && a.status === 'finished');
  if (done.length === 0) return 'Sin hacer';
  const last = done[done.length - 1];
  const day = (last.finished ?? last.started).slice(0, 10);
  return `${day} · neta ${score(last.items).net} · ${done.length} intento(s)`;
}

export function Home(p: HomeProps) {
  const tests = (p.bank?.tests ?? []).filter((t) => t.subject === p.subject);
  const scopes = [...new Set(tests.map((t) => t.scope))];
  const finished = p.attempts.filter((a) => a.status === 'finished');
  const pending = pendingExportCount(p.attempts);
  const hasQuestions = (p.bank?.questions ?? []).some((q) => q.subject === p.subject);

  return (
    <main class="home">
      <nav class="tabs" role="tablist">
        {(['temario', 'ingles'] as const).map((s) => (
          <button
            type="button"
            role="tab"
            key={s}
            aria-selected={p.subject === s}
            onClick={() => p.onSubject(s)}
          >
            {s === 'temario' ? 'Temario' : 'Inglés'}
          </button>
        ))}
      </nav>

      {p.message && (
        <p class="banner" role="status">
          {p.message}
        </p>
      )}
      {needsExportReminder(p.attempts, p.nowMs) && (
        <p class="banner warn" role="alert">
          {`${pending} intento(s) sin exportar — exporta ya`}
        </p>
      )}
      {!p.bank && <p class="empty">No hay banco. Importa bank.json para empezar.</p>}

      {scopes.map((scope) => (
        <section key={scope} class="scope">
          <h2>{scope}</h2>
          {tests
            .filter((t) => t.scope === scope)
            .map((t) => (
              <button
                type="button"
                key={t.id}
                class="test-row"
                onClick={() => p.onOpenTest(t.id)}
              >
                <span class="title">{t.title}</span>
                <span class="id">{t.id}</span>
                <span class="status">{status(t, p.attempts)}</span>
              </button>
            ))}
        </section>
      ))}

      <button type="button" class="random" disabled={!hasQuestions} onClick={p.onRandom}>
        Práctica aleatoria
      </button>

      {finished.length > 0 && (
        <section class="history">
          <h2>Historial</h2>
          {finished
            .slice(-10)
            .reverse()
            .map((a) => (
              <button
                type="button"
                key={a.uuid}
                class="history-row"
                onClick={() => p.onOpenAttempt(a.uuid)}
              >
                {`${a.title} · ${(a.finished ?? '').slice(0, 10)} · neta ${score(a.items).net}`}
              </button>
            ))}
        </section>
      )}

      <footer class="sync">
        <label class="import">
          Importar banco
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) p.onImport(file);
              input.value = '';
            }}
          />
        </label>
        <button type="button" disabled={finished.length === 0} onClick={p.onExport}>
          {`Exportar resultados (${pending})`}
        </button>
      </footer>
    </main>
  );
}
