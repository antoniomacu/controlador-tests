import {
  deleteAttempt,
  getBank,
  getMeta,
  listAttempts,
  openAppDb,
  putAttempt,
  putAttempts,
  putBank,
  requestPersistence,
  setMeta,
} from '../../src/storage/db';
import type { Attempt, Bank } from '../../src/domain/types';

let n = 0;
const fresh = () => openAppDb(`test-db-${n++}`);

const bank = {
  schema: 2,
  built: 'x',
  groups: { temario: {}, ingles: {} },
  questions: [],
  tests: [],
} as Bank;
const attempt = (uuid: string, started: string) => ({ uuid, started }) as unknown as Attempt;

describe('db', () => {
  it('stores and replaces the bank', async () => {
    const db = await fresh();
    expect(await getBank(db)).toBeNull();
    await putBank(db, bank);
    expect(await getBank(db)).toEqual(bank);
  });

  it('upserts attempts and lists them by start time', async () => {
    const db = await fresh();
    await putAttempts(db, [attempt('b', '2026-10-14T20:00'), attempt('a', '2026-10-14T19:00')]);
    await putAttempt(db, { ...attempt('b', '2026-10-14T20:00'), total_secs: 5 } as Attempt);
    const all = await listAttempts(db);
    expect(all.map((a) => a.uuid)).toEqual(['a', 'b']);
    expect(all[1].total_secs).toBe(5);
  });

  it('deletes an attempt', async () => {
    const db = await fresh();
    await putAttempts(db, [attempt('a', '1'), attempt('b', '2')]);
    await deleteAttempt(db, 'a');
    expect((await listAttempts(db)).map((x) => x.uuid)).toEqual(['b']);
  });

  it('stores meta values', async () => {
    const db = await fresh();
    expect(await getMeta<string>(db, 'lastExport')).toBeNull();
    await setMeta(db, 'lastExport', '2026-10-14');
    expect(await getMeta<string>(db, 'lastExport')).toBe('2026-10-14');
  });

  it('requests persistence when available', async () => {
    const yes = { storage: { persist: async () => true } } as never;
    expect(await requestPersistence(yes)).toBe(true);
    expect(await requestPersistence({} as never)).toBe(false);
  });
});
