const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'chief', 'engr'])

export function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !TITLES.has(t))
}

// Scores how much of the receipt's sender name appears in an alert's sender or
// narration, from 0 to 1. Order is ignored ("Okafor, Adaeze"), and so are the
// ways banks mangle names: truncation ("ADAEZE OKA"), split words ("OKA FOR")
// and words glued to the narration ("OKAFORTRANSFER").
export function nameScore(receiptName: string, alertText: string): number {
  const wanted = nameTokens(receiptName)
  if (wanted.length === 0) return 0
  const have = nameTokens(alertText)
  const squashed = have.join('')
  // A whole name read with its spaces dropped ("AMAKAOBI") is still that name.
  const whole = wanted.join('')
  if (whole.length >= 6 && squashed.includes(whole)) return 1
  const found = wanted.filter(
    (w) =>
      have.includes(w) ||
      have.some((h) => h.length >= 3 && w.startsWith(h)) ||
      (w.length >= 4 && squashed.includes(w)),
  )
  return found.length / wanted.length
}
