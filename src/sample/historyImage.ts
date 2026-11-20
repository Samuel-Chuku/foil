import type { RawHistoryRow } from '../verify/history'
import type { ReceiptPicture } from './receiptImage'

// Draws a sample bank-app history as a PNG in a plain style with no bank's
// logo or branding: the bank is printed as text.
export function drawHistory(
  bankName: string,
  heading: string,
  rows: RawHistoryRow[],
): ReceiptPicture {
  const width = 420
  const height = 150 + rows.length * 62
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('This browser cannot draw the sample screenshot.')

  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, width, height)
  g.fillStyle = '#1d3b53'
  g.fillRect(0, 0, width, 60)
  g.fillStyle = '#ffffff'
  g.font = 'bold 22px sans-serif'
  g.fillText(bankName, 20, 38)
  g.font = '15px sans-serif'
  g.fillText('Transaction history', width - 170, 38)

  g.fillStyle = '#555555'
  g.font = 'bold 15px sans-serif'
  g.fillText(heading, 20, 100)

  let y = 130
  for (const r of rows) {
    const out = r.amountText.trim().startsWith('-')
    g.fillStyle = '#111111'
    g.font = /\d{12,}/.test(r.description)
      ? '14px monospace'
      : '15px sans-serif'
    // Long descriptions are cut short, as bank apps do, to clear the amount.
    let text = r.description
    while (text.length > 4 && g.measureText(text).width > width - 170) {
      text = `${text.slice(0, -2)}…`
    }
    g.fillText(text, 20, y)
    g.fillStyle = '#777777'
    g.font = '13px sans-serif'
    g.fillText(`${r.direction} · ${r.dateTime}`, 20, y + 22)
    g.fillStyle = out ? '#b3261e' : '#1b7a3a'
    g.font = 'bold 16px sans-serif'
    const w = g.measureText(r.amountText).width
    g.fillText(r.amountText, width - 20 - w, y + 10)
    g.strokeStyle = '#e4e4e4'
    g.beginPath()
    g.moveTo(20, y + 36)
    g.lineTo(width - 20, y + 36)
    g.stroke()
    y += 62
  }

  const src = canvas.toDataURL('image/png')
  return { mimeType: 'image/png', base64: src.split(',')[1] ?? '', src }
}
