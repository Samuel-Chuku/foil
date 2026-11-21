import { matchPhoto, type PhotoThresholds } from '../capture/imageMatch'
import type { Product } from '../ledger/types'
import type { ChatMessage } from './host'
import { photoFrom } from './photos'

export type PictureItem =
  | { messageId: string; kind: 'sure'; product: Product }
  | { messageId: string; kind: 'unsure'; candidates: Product[] }

// Items the customer showed rather than named: the vendor's status they
// replied to, or a photo they sent. Matched to stock photos in code. Returns
// the items and the ids of messages whose own image is a product, so those
// are not read as receipts.
export async function pictureItems(
  messages: ChatMessage[],
  products: Product[],
  thresholds: PhotoThresholds,
): Promise<{ items: PictureItem[]; productImages: Set<string> }> {
  const stock = products.flatMap((p) =>
    p.photo ? [{ item: p, print: p.photo.print }] : [],
  )
  const items: PictureItem[] = []
  const productImages = new Set<string>()
  if (stock.length === 0) return { items, productImages }
  for (const m of messages) {
    if (m.from !== 'customer') continue
    for (const [picture, own] of [
      [m.quoted, false],
      [m.image, true],
    ] as const) {
      if (!picture) continue
      const { print } = await photoFrom(picture.src)
      const match = matchPhoto(print, stock, thresholds)
      if (match.kind === 'none') continue
      if (own) productImages.add(m.id)
      items.push(
        match.kind === 'sure'
          ? { messageId: m.id, kind: 'sure', product: match.item }
          : { messageId: m.id, kind: 'unsure', candidates: match.candidates },
      )
    }
  }
  return { items, productImages }
}
