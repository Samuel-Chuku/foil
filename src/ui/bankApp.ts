import { lagosFromEpoch } from '../verify/time'
import { readHistoryImage } from '../ai/history'
import type { ReceiptImage } from '../ai/receipt'
import type { Reading } from '../ai/run'
import type { RawHistoryRow } from '../verify/history'
import type { Credit } from '../verify/types'
import type { DeviceApi } from './useDevice'
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
  device: DeviceApi,
  ledger: LedgerApi,
): Promise<BankAppResult> {
  await device.ready()
  const reading = await readHistoryImage(image, device.consent)
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

// Midnight today in the shop's city, as the wall-clock milliseconds used
// everywhere else.
export function lagosToday(epochMs: number): number {
  const lagos = lagosFromEpoch(epochMs)
  return lagos - (lagos % 86_400_000)
}
