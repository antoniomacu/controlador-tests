import { useState } from 'preact/hooks';
import { isWrong, setCause } from '../domain/attempts';
import { passes, score } from '../domain/scoring';
import { formatClock } from '../domain/timer';
import { CAUSES, LETTERS, type Attempt, type Cause, type Item, type Letter } from '../domain/types';
import { Markdown } from './Markdown';

type Filter = 'all' | 'wrong' | 'blank' | 'doubt';
const FILTERS: [Filter, string][] = [
  ['all', 'Todas'],
  ['wrong', 'Fallos'],
  ['blank', 'Blancos'],
  ['doubt', 'Dudas'],
];
const matches: Record<Filter, (i: Item) => boolean> = {
  all: () => true,
  wrong: isWrong,
  blank: (i) => i.ans === null,
  doubt: (i) => i.doubt,
};

interface ResultsProps {
  attempt: Attempt;
  onChange: (attempt: Attempt) => void;
  onHome: () => void;
}

/** Text marker so correctness never depends on colour alone. */
function marker(letter: Letter, item: Item): string {
  if (letter === item.key) return ' — correcta';
  if (letter === item.ans) return ' — tu respuesta';
  return '';
}

export function Results({ attempt: a, onChange, onHome }: ResultsProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const s = score(a.items);
  const ok = passes(s, a.pass_ref);
  const mode = a.mode === 'exam' ? 'Modo examen' : 'Modo práctica';

  return (
    <main class="results">
      <header>
        <h1>{a.title}</h1>
        <p>{`Aciertos ${s.correct} · Fallos ${s.wrong} · Blancos ${s.blank}`}</p>
        <p class="net">{`Nota neta ${s.net}`}</p>
        <p class={ok ? 'pass' : 'fail'}>
          {`Referencia de aprobado ${a.pass_ref}: ${ok ? 'alcanzada' : 'no alcanzada'}`}
        </p>
        <p>{`Tiempo ${formatClock(a.total_secs)} de ${formatClock(a.limit_min * 60)} · ${mode}`}</p>
      </header>

      <div class="filters" role="group" aria-label="Filtrar preguntas">
        {FILTERS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {a.items.map((item, index) => {
        if (!matches[filter](item)) return null;
        const q = a.questions[index];
        return (
          <article key={item.q} class="review">
            <h2>{`Pregunta ${index + 1}`}</h2>
            <p class="stem">{q.stem}</p>
            <ol class="options">
              {LETTERS.map((letter) => (
                <li
                  key={letter}
                  class={[
                    letter === item.key ? 'correct' : '',
                    letter === item.ans && letter !== item.key ? 'chosen-wrong' : '',
                  ].join(' ')}
                >
                  {`${letter}) ${q.options[letter]}${marker(letter, item)}`}
                </li>
              ))}
            </ol>
            {q.cite && <p class="cite">{`[${q.cite}] · ${q.level}`}</p>}
            {q.explanation && <Markdown text={q.explanation} />}
            {q.hook && (
              <div class="hook">
                <Markdown text={q.hook} />
              </div>
            )}
            {(isWrong(item) || item.doubt) && (
              <label class="cause">
                Causa
                <select
                  value={item.cause ?? ''}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value;
                    onChange(setCause(a, index, value === '' ? null : (value as Cause)));
                  }}
                >
                  <option value="">—</option>
                  {CAUSES.map((cause) => (
                    <option key={cause} value={cause}>
                      {cause}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </article>
        );
      })}

      <button type="button" class="home" onClick={onHome}>
        Volver al inicio
      </button>
    </main>
  );
}
