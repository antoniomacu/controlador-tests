import { validateBank, type BankResult } from '../domain/bank';

export async function readBankFile(file: Blob): Promise<BankResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }
  return validateBank(raw);
}
