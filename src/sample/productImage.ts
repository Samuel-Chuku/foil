// Draws the sample shop's thrift pieces as simple pictures, so the demo can
// match a status reply's thumbnail to stock photos as it would real ones.
// Nothing here depicts a real brand or product.

export type ThriftPiece =
  'denim-jacket' | 'floral-dress' | 'yellow-top' | 'boots'

type Picture = { mimeType: string; base64: string; src: string }

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d')
  if (!g) throw new Error('This browser cannot draw the sample photos.')
  return { c, g }
}

function picture(c: HTMLCanvasElement, type = 'image/jpeg'): Picture {
  const src = c.toDataURL(type, 0.9)
  return { mimeType: type, base64: src.split(',')[1] ?? '', src }
}

function drawPiece(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  piece: ThriftPiece,
) {
  switch (piece) {
    case 'denim-jacket': {
      g.fillStyle = '#d9c6a5'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#3b5f9e'
      g.beginPath()
      g.moveTo(w * 0.3, h * 0.18)
      g.lineTo(w * 0.7, h * 0.18)
      g.lineTo(w * 0.92, h * 0.35)
      g.lineTo(w * 0.85, h * 0.78)
      g.lineTo(w * 0.15, h * 0.78)
      g.lineTo(w * 0.08, h * 0.35)
      g.closePath()
      g.fill()
      g.fillStyle = '#2a4778'
      g.fillRect(w * 0.48, h * 0.2, w * 0.04, h * 0.58)
      g.fillStyle = '#c9a04a'
      for (const y of [0.32, 0.45, 0.58, 0.71]) {
        g.beginPath()
        g.arc(w * 0.56, h * y, w * 0.015, 0, Math.PI * 2)
        g.fill()
      }
      return
    }
    case 'floral-dress': {
      g.fillStyle = '#b9bdc4'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#b3263a'
      g.beginPath()
      g.moveTo(w * 0.4, h * 0.15)
      g.lineTo(w * 0.6, h * 0.15)
      g.lineTo(w * 0.62, h * 0.38)
      g.lineTo(w * 0.85, h * 0.88)
      g.lineTo(w * 0.15, h * 0.88)
      g.lineTo(w * 0.38, h * 0.38)
      g.closePath()
      g.fill()
      g.fillStyle = '#f4e9d8'
      for (let i = 0; i < 40; i++) {
        const x = 0.25 + ((i * 37) % 50) / 100
        const y = 0.4 + ((i * 53) % 45) / 100
        g.beginPath()
        g.arc(w * x, h * y, w * 0.018, 0, Math.PI * 2)
        g.fill()
      }
      return
    }
    case 'yellow-top': {
      g.fillStyle = '#1f6f6b'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#f2c230'
      g.beginPath()
      g.moveTo(w * 0.32, h * 0.25)
      g.lineTo(w * 0.68, h * 0.25)
      g.lineTo(w * 0.88, h * 0.38)
      g.lineTo(w * 0.78, h * 0.48)
      g.lineTo(w * 0.72, h * 0.44)
      g.lineTo(w * 0.72, h * 0.75)
      g.lineTo(w * 0.28, h * 0.75)
      g.lineTo(w * 0.28, h * 0.44)
      g.lineTo(w * 0.22, h * 0.48)
      g.lineTo(w * 0.12, h * 0.38)
      g.closePath()
      g.fill()
      return
    }
    case 'boots': {
      g.fillStyle = '#f3f1ec'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#6b3f1d'
      for (const x of [0.22, 0.54]) {
        g.fillRect(w * x, h * 0.3, w * 0.16, h * 0.4)
        g.fillRect(w * x, h * 0.62, w * 0.28, h * 0.1)
      }
      g.fillStyle = '#2b1a0c'
      for (const x of [0.22, 0.54])
        g.fillRect(w * x, h * 0.71, w * 0.28, h * 0.03)
      return
    }
  }
}

// The vendor's own photo, as posted on their status: portrait.
export function drawPiecePhoto(piece: ThriftPiece): Picture {
  const { c, g } = canvas(360, 480)
  drawPiece(g, 360, 480, piece)
  return picture(c)
}

// What a customer's status reply shows: the centre square, small and
// recompressed.
export function statusThumbnail(piece: ThriftPiece): Picture {
  const full = canvas(360, 480)
  drawPiece(full.g, 360, 480, piece)
  const { c, g } = canvas(96, 96)
  g.drawImage(full.c, 0, 60, 360, 360, 0, 0, 96, 96)
  const src = c.toDataURL('image/jpeg', 0.6)
  return { mimeType: 'image/jpeg', base64: src.split(',')[1] ?? '', src }
}
