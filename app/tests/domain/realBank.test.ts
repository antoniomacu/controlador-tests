import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateBank } from '../../src/domain/bank';

const REAL = join(homedir(), 'Documents/controlador/Primer Examen/app-sync/bank.json');

describe.skipIf(!existsSync(REAL))('real bank.json from build_bank.py', () => {
  it('passes the app validation', () => {
    const result = validateBank(JSON.parse(readFileSync(REAL, 'utf-8')));
    expect(result).toMatchObject({ ok: true });
  });
});
