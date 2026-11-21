import { fingerprint } from '../capture/imageMatch'
import type { ProductPhoto } from '../ledger/types'

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The picture could not be opened.'))
    img.src = src
  })
}

function draw(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(
    1,
    maxSide / Math.max(img.naturalWidth, img.naturalHeight),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

// A small thumbnail for the screen and the fingerprint customer pictures are
// matched against. Works on a data URL, a blob URL or an object URL.
export async function photoFrom(src: string): Promise<ProductPhoto> {
  const img = await load(src)
  // The fingerprint averages cells, so a few hundred pixels is plenty.
  const work = draw(img, 256)
  const pixels = work
    .getContext('2d')!
    .getImageData(0, 0, work.width, work.height)
  return {
    thumb: draw(img, 160).toDataURL('image/jpeg', 0.8),
    print: fingerprint(pixels),
  }
}

export async function photoFromFile(file: File): Promise<ProductPhoto> {
  const url = URL.createObjectURL(file)
  try {
    return await photoFrom(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}
