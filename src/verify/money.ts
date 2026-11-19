// Amounts are kept in kobo so sums and comparisons never meet floating-point error.
export function parseNairaKobo(text: string): number | null {
  const s = text
    .toLowerCase()
    .replace(/ngn|naira|₦|#|[+−-]/g, '')
    .replace(/\bn(?=\s*\d)/g, '')
    .replace(/[,\s]/g, '')
  const m = /^(\d+(?:\.\d{1,2})?)(k|m)?$/.exec(s)
  if (!m) return null
  const scale = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1
  const [whole = '0', frac = ''] = m[1]!.split('.')
  const kobo = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return kobo * scale
}

export function formatNaira(kobo: number): string {
  const naira = kobo / 100
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: kobo % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}
