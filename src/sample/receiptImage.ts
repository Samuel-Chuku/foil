import type { SampleReceipt } from './pack'

export type ReceiptPicture = { mimeType: string; base64: string; src: string }

// Draws a sample receipt as a PNG in the plain style most Nigerian banking apps
// use, with no bank's logo or branding: the issuer is printed as text.
export function drawReceipt(r: SampleReceipt): ReceiptPicture {
  const width = 400
  const rows: [string, string][] = [
    ['Sender', r.sender],
    ['Beneficiary', r.recipient],
    ['Beneficiary bank', r.recipientBank],
    ...(r.sessionId ? [['Session ID', r.sessionId] as [string, string]] : []),
    ...(r.reference
      ? [['Transaction reference', r.reference] as [string, string]]
      : []),
    ['Date', r.dateTime],
  ]
  const height = 250 + rows.length * 56
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('This browser cannot draw the sample receipt.')

  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, width, height)
  g.fillStyle = '#1d3b53'
  g.fillRect(0, 0, width, 64)
  g.fillStyle = '#ffffff'
  g.font = 'bold 26px sans-serif'
  g.fillText(r.issuer, 24, 42)

  g.fillStyle = '#555555'
  g.font = '15px sans-serif'
  g.fillText('Transfer receipt', 24, 98)
  g.fillStyle = '#111111'
  g.font = 'bold 34px sans-serif'
  g.fillText(r.amountText, 24, 142)
  g.fillStyle = '#1b7a3a'
  g.font = 'bold 17px sans-serif'
  g.fillText(r.statusText, 24, 172)

  let y = 220
  for (const [label, value] of rows) {
    g.fillStyle = '#666666'
    g.font = '14px sans-serif'
    g.fillText(label, 24, y)
    g.fillStyle = '#111111'
    g.font = /^\d{12,}$/.test(value) ? '16px monospace' : '17px sans-serif'
    g.fillText(value, 24, y + 22)
    g.strokeStyle = '#e4e4e4'
    g.beginPath()
    g.moveTo(24, y + 36)
    g.lineTo(width - 24, y + 36)
    g.stroke()
    y += 56
  }

  const src = canvas.toDataURL('image/png')
  return { mimeType: 'image/png', base64: src.split(',')[1] ?? '', src }
}
