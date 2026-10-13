import { useEffect, useState } from 'preact/hooks';
import {
  finishAttempt,
  goTo,
  pauseAttempt,
  resumeAttempt,
  selectAnswer,
  toggleDoubt,
  toggleStuck,
} from '../domain/attempts';
import {
  elapsedSecs,
  formatClock,
  isExpired,
  isOvertime,
  isPaused,
  remainingSecs,
} from '../domain/timer';
import { LETTERS, type Attempt } from '../domain/types';
import { useNow } from './useNow';

interface RunnerProps {
  attempt: Attempt;
  now: () => number;
  confirmFn: (message: string) => boolean;
  onChange: (attempt: Attempt) => void;
  onFinished: (attempt: Attempt) => void;
}

/** One question per screen, with the clock, flags, navigation and the question grid. */
export function Runner({ attempt: a, now, confirmFn, onChange, onFinished }: RunnerProps) {
  const nowMs = useNow(now);
  const [showGrid, setShowGrid] = useState(false);
  const item = a.items[a.current];
  const question = a.questions[a.current];
  const paused = isPaused(a.timer);
  const elapsed = () => elapsedSecs(a.timer, now());

  useEffect(() => {
    if (a.status === 'in_progress' && isExpired(a.timer, nowMs)) {
      onFinished(finishAttempt(a, nowMs));
    }
  }, [nowMs, a, onFinished]);

  // Practice mode: leaving the app (call, lock screen) counts as a pause.
  useEffect(() => {
    if (a.mode !== 'practice') return undefined;
    const handler = () => {
      const t = now();
      onChange(document.visibilityState === 'hidden' ? pauseAttempt(a, t) : resumeAttempt(a, t));
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [a, now, onChange]);

  const blanks = a.items.filter((i) => i.ans === null).length;
  const finish = () => {
    if (confirmFn(`¿Terminar el test? Quedan ${blanks} en blanco.`)) {
      onFinished(finishAttempt(a, now()));
    }
  };
  const move = (index: number) => onChange(goTo(a, index, elapsed()));
  const togglePause = () =>
    onChange(paused ? resumeAttempt(a, now()) : pauseAttempt(a, now()));

  return (
    <main class="runner">
      <header class="runner-bar">
        <span class={isOvertime(a.timer, nowMs) ? 'clock overtime' : 'clock'} role="timer">
          {formatClock(remainingSecs(a.timer, nowMs))}
        </span>
        <span class="progress">{`${a.current + 1} / ${a.items.length}`}</span>
        {a.mode === 'practice' && (
          <button type="button" onClick={togglePause}>
            {paused ? 'Reanudar' : 'Pausa'}
          </button>
        )}
      </header>

      {paused ? (
        <section class="paused">
          <p>En pausa</p>
        </section>
      ) : (
        <section class="question">
          <p class="stem">{question.stem}</p>
          <ol class="options">
            {LETTERS.map((letter) => (
              <li key={letter}>
                <button
                  type="button"
                  class="option"
                  aria-pressed={item.ans === letter}
                  onClick={() => onChange(selectAnswer(a, letter, elapsed()))}
                >
                  <span class="letter">{letter})</span> {question.options[letter]}
                </button>
              </li>
            ))}
          </ol>
          <div class="flags">
            <button type="button" aria-pressed={item.doubt} onClick={() => onChange(toggleDoubt(a))}>
              Duda
            </button>
            <button type="button" aria-pressed={item.stuck} onClick={() => onChange(toggleStuck(a))}>
              Atasco
            </button>
          </div>
        </section>
      )}

      <nav class="runner-nav">
        <button type="button" disabled={a.current === 0} onClick={() => move(a.current - 1)}>
          Anterior
        </button>
        <button type="button" aria-expanded={showGrid} onClick={() => setShowGrid(!showGrid)}>
          Cuadrícula
        </button>
        <button
          type="button"
          disabled={a.current === a.items.length - 1}
          onClick={() => move(a.current + 1)}
        >
          Siguiente
        </button>
      </nav>

      {showGrid && (
        <div class="grid">
          {a.items.map((it, index) => (
            <button
              type="button"
              key={it.q}
              aria-label={`Ir a la pregunta ${index + 1}`}
              class={[
                'cell',
                it.ans ? 'answered' : 'blank',
                it.doubt || it.stuck ? 'flagged' : '',
                index === a.current ? 'current' : '',
              ].join(' ')}
              onClick={() => {
                move(index);
                setShowGrid(false);
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}

      <button type="button" class="finish" onClick={finish}>
        Terminar
      </button>
    </main>
  );
}
