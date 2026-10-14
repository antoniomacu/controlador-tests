/** Shared types for the bank, attempts and the exported results file (spec §5). */

export type Letter = 'a' | 'b' | 'c' | 'd';
export const LETTERS: readonly Letter[] = ['a', 'b', 'c', 'd'];
export type Subject = 'temario' | 'ingles';
export const SUBJECTS: readonly Subject[] = ['temario', 'ingles'];
export type Level = 'N1' | 'N2' | 'N3';
export type Mode = 'exam' | 'practice';

/** Closed failure-cause lists, verbatim from each subject's GUIA-REGISTRO.md. */
export const TEMARIO_CAUSES = [
  'No conocía el dato',
  'Confundí dos conceptos',
  'Lo recordaba mal',
  'Mala lectura del enunciado',
  'Dudé entre dos opciones',
  'Sin tiempo',
  'Otro',
] as const;
export const INGLES_CAUSES = [
  'No conocia la palabra',
  'Elegi por como sonaba',
  'Confundi dos palabras proximas',
  'No conocia la regla',
  'Aplique mal la regla',
  'Mala lectura del enunciado',
  'Dude entre dos opciones',
  'Sin tiempo',
  'Otro',
] as const;
export type Cause = (typeof TEMARIO_CAUSES)[number] | (typeof INGLES_CAUSES)[number];
export const CAUSES_BY_SUBJECT: Record<Subject, readonly Cause[]> = {
  temario: TEMARIO_CAUSES,
  ingles: INGLES_CAUSES,
};


export interface Question {
  id: string;
  subject: Subject;
  /** Chapter for Temario; null for English. */
  tema: number | null;
  /** What random practice draws from: the chapter ("4") or the English area ("morfo"). */
  group: string;
  stem: string;
  options: Record<Letter, string>;
  answer: Letter;
  level?: Level | null;
  /** Shown in review: the page citation (Temario) or the exam anchor (English). */
  ref?: string | null;
  subtipo?: string | null;
  cite?: string | null;
  explanation?: string | null;
  hook?: string | null;
}

export interface TestDef {
  id: string;
  subject: Subject;
  scope: string;
  title: string;
  questions: string[];
  limit_min: number;
  pass_ref: number;
  synthetic: boolean;
}

export interface Bank {
  schema: 2;
  built: string;
  /** Display labels of every group that has questions, per subject. */
  groups: Record<Subject, Record<string, string>>;
  questions: Question[];
  tests: TestDef[];
}

export interface Item {
  q: string;
  key: Letter;
  ans: Letter | null;
  doubt: boolean;
  stuck: boolean;
  secs: number;
  first_answered_at_secs: number | null;
  cause: Cause | null;
}

export interface TimerState {
  mode: Mode;
  limitSecs: number;
  startedAtMs: number;
  pausedTotalMs: number;
  pausedAtMs: number | null;
}

export interface Attempt {
  uuid: string;
  test_id: string;
  kind: 'fixed' | 'random';
  mode: Mode;
  attempt: number;
  started: string;
  finished: string | null;
  limit_min: number;
  total_secs: number;
  status: 'in_progress' | 'finished';
  items: Item[];
  // App-only fields, never exported:
  title: string;
  subject: Subject;
  pass_ref: number;
  questions: Question[];
  current: number;
  mark_secs: number;
  timer: TimerState;
  exported: boolean;
}

export type ExportItem = Item;
export type ExportAttempt = Pick<
  Attempt,
  | 'uuid'
  | 'test_id'
  | 'kind'
  | 'mode'
  | 'attempt'
  | 'started'
  | 'finished'
  | 'limit_min'
  | 'total_secs'
  | 'status'
  | 'subject'
> & { items: ExportItem[] };

export interface ResultsFile {
  schema: 1;
  exported: string;
  attempts: ExportAttempt[];
}
