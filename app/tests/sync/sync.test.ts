import { buildResultsFile, deliverFile } from '../../src/sync/exportResults';
import { readBankFile } from '../../src/sync/importBank';
import type { Attempt } from '../../src/domain/types';

const finished = {
  uuid: 'u',
  test_id: 'T',
  kind: 'fixed',
  mode: 'exam',
  attempt: 1,
  started: 's',
  finished: 'f',
  limit_min: 1,
  total_secs: 1,
  status: 'finished',
  items: [],
  exported: false,
} as unknown as Attempt;

describe('readBankFile', () => {
  it('rejects non-JSON with a readable message', async () => {
    const result = await readBankFile(new Blob(['not json']));
    expect(result).toEqual({ ok: false, error: 'El archivo no es JSON válido.' });
  });

  it('validates parsed JSON', async () => {
    const result = await readBankFile(new Blob([JSON.stringify({ schema: 1, attempts: [] })]));
    expect(result).toEqual({ ok: false, error: 'Este archivo es un results.json, no un banco.' });
  });
});

describe('buildResultsFile', () => {
  it('returns null when nothing is finished', () => {
    const open = { ...finished, status: 'in_progress' } as Attempt;
    expect(buildResultsFile([open], new Date(2026, 9, 14, 21, 5))).toBeNull();
  });

  it('names the file by local date and time', async () => {
    const file = buildResultsFile([finished], new Date(2026, 9, 14, 21, 5));
    expect(file?.name).toBe('results-20261014-2105.json');
    expect(JSON.parse(await (file as File).text()).attempts).toHaveLength(1);
  });
});

describe('deliverFile', () => {
  const file = new File(['{}'], 'results-x.json', { type: 'application/json' });

  it('shares when the share sheet supports files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const out = await deliverFile(file, { canShare: () => true, share }, download);
    expect(out).toBe('shared');
    expect(download).not.toHaveBeenCalled();
  });

  it('reports a dismissed share sheet as cancelled', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(abort) };
    expect(await deliverFile(file, nav, vi.fn())).toBe('cancelled');
  });

  it('falls back to a download when sharing is unavailable or fails', async () => {
    const download = vi.fn();
    expect(await deliverFile(file, {}, download)).toBe('downloaded');
    const failing = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('x')) };
    expect(await deliverFile(file, failing, download)).toBe('downloaded');
    expect(download).toHaveBeenCalledTimes(2);
  });
});
