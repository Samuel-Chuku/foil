export type ChatLine = {
  from: 'customer' | 'vendor'
  time: string
  text?: string
  image?: boolean
  voice?: boolean
}

// The chat as the model sees it: who said what, newest last, trimmed from the
// oldest end to fit the on-device request limit with room for the prompt.
export function transcript(lines: ChatLine[], maxChars = 3000): string {
  const rendered = lines.map((l) => {
    const who = l.from === 'customer' ? 'Customer' : 'You'
    const what =
      l.text?.trim() ||
      (l.image ? '[sent an image]' : l.voice ? '[sent a voice note]' : '')
    return `${who} (${l.time}): ${what}`
  })
  const kept: string[] = []
  let size = 0
  for (const line of rendered.reverse()) {
    if (size + line.length + 1 > maxChars) break
    kept.unshift(line)
    size += line.length + 1
  }
  return kept.join('\n')
}
