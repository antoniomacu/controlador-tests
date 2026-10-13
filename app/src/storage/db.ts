import { openDB, type IDBPDatabase } from 'idb';
import type { Attempt, Bank } from '../domain/types';

/** IndexedDB layout: `meta` (key/value: bank, lastExport) and `attempts` (keyed by uuid). */
export type Db = IDBPDatabase;

export function openAppDb(name = 'controlador-tests'): Promise<Db> {
  return openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('attempts', { keyPath: 'uuid' });
    },
  });
}

export async function getBank(db: Db): Promise<Bank | null> {
  return ((await db.get('meta', 'bank')) as Bank | undefined) ?? null;
}

export async function putBank(db: Db, bank: Bank): Promise<void> {
  await db.put('meta', bank, 'bank');
}

export async function listAttempts(db: Db): Promise<Attempt[]> {
  const all = (await db.getAll('attempts')) as Attempt[];
  return all.sort((a, b) => a.started.localeCompare(b.started));
}

export async function putAttempt(db: Db, attempt: Attempt): Promise<void> {
  await db.put('attempts', attempt);
}

export async function putAttempts(db: Db, attempts: readonly Attempt[]): Promise<void> {
  const tx = db.transaction('attempts', 'readwrite');
  await Promise.all([...attempts.map((a) => tx.store.put(a)), tx.done]);
}

/** Removes an abandoned attempt; it is never exported or registered. */
export async function deleteAttempt(db: Db, uuid: string): Promise<void> {
  await db.delete('attempts', uuid);
}

export async function getMeta<T>(db: Db, key: string): Promise<T | null> {
  return ((await db.get('meta', key)) as T | undefined) ?? null;
}

export async function setMeta(db: Db, key: string, value: unknown): Promise<void> {
  await db.put('meta', value, key);
}

/** Asks iOS to keep this app's data under storage pressure. */
export async function requestPersistence(nav: Pick<Navigator, 'storage'>): Promise<boolean> {
  return (await nav.storage?.persist?.()) ?? false;
}
