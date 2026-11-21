import { logoColors, type BrandFont } from '../capture/brand'
import { loadImage } from './receiptImage'

// Reads the vendor's logo and font files on this computer. Nothing is
// uploaded anywhere; the results are kept in this browser.

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_SIDE = 256
const FONT_EXT = /\.(ttf|otf|woff2?)$/i
const FONT_MAX_BYTES = 1.5 * 1024 * 1024

const asDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })

// The logo shrunk to at most 256 px a side, as PNG, with the colours it uses.
export async function readLogo(
  file: File,
): Promise<{ logo: string; colors: string[] }> {
  if (!LOGO_TYPES.includes(file.type)) {
    throw new Error('Choose a PNG, JPEG, WebP or SVG picture for the logo.')
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error('That logo file is over 5 MB. Choose a smaller one.')
  }
  const img = await loadImage(await asDataUrl(file))
  const w = img.naturalWidth || LOGO_SIDE
  const h = img.naturalHeight || LOGO_SIDE
  const scale = Math.min(1, LOGO_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('This browser cannot read the logo.')
  g.drawImage(img, 0, 0, canvas.width, canvas.height)
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data
  return { logo: canvas.toDataURL('image/png'), colors: logoColors(pixels) }
}

export async function readFont(file: File): Promise<BrandFont> {
  if (!FONT_EXT.test(file.name)) {
    throw new Error('Choose a font file ending in .ttf, .otf, .woff or .woff2.')
  }
  if (file.size > FONT_MAX_BYTES) {
    throw new Error('That font file is over 1.5 MB. Choose a smaller one.')
  }
  const dataUrl = await asDataUrl(file)
  // Loading it once here catches a broken or renamed file before it is saved.
  await new FontFace('ShopBrandCheck', `url(${dataUrl})`).load().catch(() => {
    throw new Error('That font file could not be opened.')
  })
  return { kind: 'file', name: file.name.replace(FONT_EXT, ''), dataUrl }
}
