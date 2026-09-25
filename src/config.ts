/**
 * Client-side product policy.
 *
 * Every value in this file is a Locus decision. The upstream primitive takes
 * one explicit radius per call and holds no opinion about ladders, category
 * taste, or interaction timing -- that separation is the whole point of the
 * seam, so these constants must never migrate into the API.
 */

const RAW_BASE_URL: string =
  import.meta.env.VITE_GEOHISTORY_API_BASE_URL ?? 'http://localhost:8787'

/** Configured GeoHistory origin, trailing slashes removed. */
export const API_BASE_URL: string = RAW_BASE_URL.replace(/\/+$/, '')

/**
 * The radius ladder, in km.
 *
 * Measured, not guessed: the density study found Denver and Paris fill at
 * 5 km, Milton and Thun need 50 km, and rural South Dakota needs 150 km once
 * births and deaths are excluded. Open ocean fills at no rung, which is a
 * real answer rather than a failure.
 */
export const LADDER_KM = [5, 15, 50, 150] as const

/** Target result count. A rung is satisfied only when it returns this many. */
export const TARGET_RESULTS = 12

export const SIGNIFICANCE_FLOOR = 0.05

/**
 * Biography dominates dense areas -- roughly 85% of rows within 5 km of Paris
 * are births and deaths. Excluding them is what makes the list answer "what
 * happened here" instead of "who was born here".
 */
export const EXCLUDED_CATEGORIES = ['birth', 'death'] as const

/** Settle time after the last pointer movement. Courtesy, not enforcement. */
export const DEBOUNCE_MS = 400
