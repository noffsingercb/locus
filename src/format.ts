/**
 * Display formatting. Deterministic and locale-independent on purpose: two
 * people looking at the same pin should read the same strings.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return 'distance unknown'
  if (km < 1) return `${Math.round(km * 1000)} m away`
  if (km < 10) return `${km.toFixed(1)} km away`
  return `${Math.round(km)} km away`
}

/**
 * Renders a partial ISO date at the precision the dataset actually claims.
 * A row known only to the year must not be displayed as 1 January.
 */
export function formatEventDate(dateStart: string, datePrecision: string | null): string {
  const year = dateStart.slice(0, 4)
  const precision = datePrecision ?? ''

  if (precision === 'year' || dateStart.length === 4) return year

  const monthIndex = Number.parseInt(dateStart.slice(5, 7), 10) - 1
  const month = MONTHS[monthIndex] ?? ''
  if (precision === 'month' || dateStart.length === 7 || month === '') {
    return month === '' ? year : `${month} ${year}`
  }

  const day = Number.parseInt(dateStart.slice(8, 10), 10)
  if (!Number.isFinite(day)) return `${month} ${year}`
  return `${day} ${month} ${year}`
}
