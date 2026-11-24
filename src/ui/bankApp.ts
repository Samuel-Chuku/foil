import { planHistory } from '../ai/history'
import type { RunJob } from '../ai/job'
import type { ReceiptImage } from '../ai/receipt'
import type { Reading } from '../ai/run'
import type { RawHistoryRow } from '../verify/history'
import type { Credit } from '../verify/types'
import type { LedgerApi } from './useLedger'

export type BankAppResult = {
  reading: Reading<RawHistoryRow[]>
  added: Credit[]
}

// Reads a bank-app history screenshot on the device and adds the money it
// shows that the alerts did not.
export async function importBankApp(
  image: ReceiptImage,
  opts: { bank: string | null; day: number },
  jobs: RunJob,
  ledger: LedgerApi,
): Promise<BankAppResult> {
  const reading = await jobs(planHistory(image))
  const added = await ledger.importHistory(reading.fields, opts)
  return { reading, added }
}

export function fileToImage(file: File): Promise<ReceiptImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ mimeType: file.type, base64: url.split(',')[1] ?? '' })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
