import { useState } from 'preact/hooks';
import { availableCount, randomTestId, sampleQuestions, temasOf } from '../domain/sampler';
import type { Bank, Mode, Question, Subject, TestDef } from '../domain/types';

export interface BeginInput {
  testId: string;
  title: string;
  subject: Subject;
  kind: 'fixed' | 'random';
  mode: Mode;
  questions: Question[];
  limitMin: number;
  passRef: number;
}

interface SetupProps {
  bank: Bank;
  subject: Subject;
  test: TestDef | null;
  attemptNumber: number;
  now: () => number;
  onBegin: (input: BeginInput) => void;
  onCancel: () => void;
}

/** Mode choice for a fixed test, or chapters and count for random practice. */
export function Setup({ bank, subject, test, attemptNumber, now, onBegin, onCancel }: SetupProps) {
  const [mode, setMode] = useState<Mode>('exam');
  const [temas, setTemas] = useState<number[]>([]);
  const [count, setCount] = useState(20);
  const available = availableCount(bank.questions, subject, temas);
  const effective = Math.max(0, Math.min(count, available));
  const limit = test ? test.limit_min : effective;
  const canStart = test !== null || effective > 0;

  const toggleTema = (tema: number) =>
    setTemas(temas.includes(tema) ? temas.filter((t) => t !== tema) : [...temas, tema]);

  const begin = () => {
    if (test) {
      const byId = new Map(bank.questions.map((q) => [q.id, q]));
      onBegin({
        testId: test.id,
        title: test.title,
        subject,
        kind: 'fixed',
        mode,
        questions: test.questions.map((id) => byId.get(id) as Question),
        limitMin: test.limit_min,
        passRef: test.pass_ref,
      });
      return;
    }
    const nowMs = now();
    const questions = sampleQuestions(bank.questions, {
      subject,
      temas,
      count: effective,
      seed: nowMs,
    });
    const sorted = [...temas].sort((a, b) => a - b);
    onBegin({
      testId: randomTestId(sorted, new Date(nowMs)),
      title: `Práctica aleatoria — temas ${sorted.join(', ')}`,
      subject,
      kind: 'random',
      mode,
      questions,
      limitMin: questions.length,
      passRef: Math.floor(questions.length / 2),
    });
  };

  return (
    <main class="setup">
      <h1>{test ? test.title : 'Práctica aleatoria'}</h1>
      {test && attemptNumber > 1 && (
        <p class="banner warn">{`Intento ${attemptNumber}: no cuenta en tus series.`}</p>
      )}

      <fieldset>
        <legend>Modo</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'exam'}
            onChange={() => setMode('exam')}
          />
          Examen (corte duro)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === 'practice'}
            onChange={() => setMode('practice')}
          />
          Práctica (límite blando, con pausa)
        </label>
      </fieldset>

      {!test && (
        <fieldset>
          <legend>Temas</legend>
          {temasOf(bank.questions, subject).map((tema) => (
            <label key={tema}>
              <input
                type="checkbox"
                checked={temas.includes(tema)}
                onChange={() => toggleTema(tema)}
              />
              {`Tema ${tema}`}
            </label>
          ))}
          <label>
            Preguntas
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, available)}
              value={count}
              onInput={(e) => setCount(Number((e.target as HTMLInputElement).value) || 1)}
            />
          </label>
          <p>{`Disponibles: ${available}`}</p>
        </fieldset>
      )}

      <p>{`Tiempo: ${limit} min`}</p>
      <div class="actions">
        <button type="button" onClick={onCancel}>
          Volver
        </button>
        <button type="button" class="primary" disabled={!canStart} onClick={begin}>
          Empezar
        </button>
      </div>
    </main>
  );
}
