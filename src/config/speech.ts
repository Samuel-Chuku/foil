// The languages the owner may speak to the desk in, from the shop's market,
// best first. Chrome's on-device packs cover some English variants and not
// others, so nearby ones are tried too.
export function speechLangs(locale: string): string[] {
  return locale.startsWith('en-')
    ? [...new Set([locale, 'en-GB', 'en-US'])]
    : [locale]
}
