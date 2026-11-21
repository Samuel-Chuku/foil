import { useEffect, useState } from 'react'
import type { Brand } from '../capture/brand'
import type { CustomerReceipt } from '../capture/customerReceipt'
import { drawCustomerReceipt, receiptLook } from './receiptImage'

export type ReceiptPicture = { canvas: HTMLCanvasElement; src: string }

// The receipt drawn in the shop's look, redrawn only when the receipt or the
// look changes. Null while the font and logo load.
export function useReceiptPicture(
  receipt: CustomerReceipt,
  brand: Brand,
): ReceiptPicture | null {
  const key = JSON.stringify([receipt, brand])
  const [picture, setPicture] = useState<{
    key: string
    value: ReceiptPicture
  } | null>(null)
  useEffect(() => {
    let live = true
    const [r, b] = JSON.parse(key) as [CustomerReceipt, Brand]
    void receiptLook(b).then((look) => {
      if (!live) return
      const canvas = drawCustomerReceipt(r, look)
      setPicture({ key, value: { canvas, src: canvas.toDataURL('image/png') } })
    })
    return () => {
      live = false
    }
  }, [key])
  // A picture of the previous receipt is never shown for this one.
  return picture?.key === key ? picture.value : null
}
