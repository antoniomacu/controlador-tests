import { needsExportReminder, pendingExportCount } from '../domain/attempts';
import { ALL, historyFor, isLowScore, scopesFor, type ScopeFilter } from '../domain/history';
import { score } from '../domain/scoring';
import type { Attempt, Bank, Subject, TestDef } from '../domain/types';

/** The three pages of a subject. Held by App so a result screen returns to the same one. */
export type HomeSection = 'temas' | 'historial' | 'practica';

const SECTIONS: { id: HomeSection; label: string }[] = [
  { id: 'temas', label: 'Temas' },
  { id: 'historial', label: 'Historial' },
  { id: 'practica', label: 'Práctica' },
];

/** A tap in the pinned header shows new content from its top, not mid-page. */
function toTop() {
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' });
}

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
  /** Chapter filter: `ALL` or one scope; held by App so it survives navigation. */
  scope: ScopeFilter;
  onScope: (scope: ScopeFilter) => void;
  section: HomeSection;
  onSection: (section: HomeSection) => void;
  /** Back into the test left half-way through with the edge swipe. */
  onResume: () => void;
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
  const scopes = scopesFor(p.bank, p.subject);
  const shown = p.scope === ALL ? scopes : scopes.filter((s) => s === p.scope);
  const history = historyFor(p.attempts, p.bank, p.subject, p.scope);
  const finished = p.attempts.filter((a) => a.status === 'finished');
  const pending = pendingExportCount(p.attempts);
  const open = p.attempts.find((a) => a.status === 'in_progress');
  const hasQuestions = (p.bank?.questions ?? []).some((q) => q.subject === p.subject);

  return (
    <main class="home">
      {/* Subject, section and chapter rows are pinned together, padded below the iOS status bar. */}
      <header class="home-top">
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
        <nav class="sections" role="tablist" aria-label="Sección">
          {SECTIONS.map((s) => (
            <button
              type="button"
              role="tab"
              key={s.id}
              aria-selected={p.section === s.id}
              onClick={() => {
                p.onSection(s.id);
                toTop();
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {p.section !== 'practica' && scopes.length > 1 && (
          <nav class="scopes" aria-label="Temas">
            {[ALL, ...scopes].map((s) => (
              <button
                type="button"
                key={s}
                aria-pressed={p.scope === s}
                ref={(el) => {
                  if (el && p.scope === s)
                    el.scrollIntoView?.({
                      inline: 'nearest',
                      block: 'nearest',
                    });
                }}
                onClick={() => {
                  p.onScope(s);
                  toTop();
                }}
              >
                {s === ALL ? 'Todos' : s}
              </button>
            ))}
          </nav>
        )}
      </header>

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
      {open && (
        <button type="button" class="resume" onClick={p.onResume}>
          {`Continuar: ${open.title}`}
        </button>
      )}
      {!p.bank && <p class="empty">No hay banco. Importa bank.json para empezar.</p>}

      {p.section === 'temas' &&
        shown.map((scope) => (
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

      {p.section === 'practica' && (
        <button type="button" class="random" disabled={!hasQuestions} onClick={p.onRandom}>
          Práctica aleatoria
        </button>
      )}

      {p.section === 'historial' && (
        <section class="history">
          <h2>{p.scope === ALL ? 'Historial' : `Historial · ${p.scope}`}</h2>
          {history.map((a) => (
            <button
              type="button"
              key={a.uuid}
              class="history-row"
              onClick={() => p.onOpenAttempt(a.uuid)}
            >
              <span class="what">{`${a.title} · ${(a.finished ?? '').slice(0, 10)}`}</span>
              <span class="net">{`neta ${score(a.items).net}`}</span>
              {isLowScore(a) && <span class="low">bajo</span>}
            </button>
          ))}
          {history.length === 0 && (
            <p class="empty">{p.scope === ALL ? 'Sin intentos.' : `Sin intentos en ${p.scope}.`}</p>
          )}
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
