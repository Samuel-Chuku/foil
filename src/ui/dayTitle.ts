// A shop day such as "2026-11-27" as words: "Friday, 27 November".
export function dayTitle(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
