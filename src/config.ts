/** Client-side product policy and public deployment configuration. */

const RAW_BASE_URL: string =
  import.meta.env.VITE_GEOHISTORY_API_BASE_URL ?? 'http://localhost:8787'

export const API_BASE_URL: string = RAW_BASE_URL.replace(/\/+$/, '')

/**
 * OpenFreeMap is the keyless production default. It publishes MapLibre styles
 * backed by OpenStreetMap/OpenMapTiles data with no account, key, or cookie.
 * Deployments can replace the complete style URL without changing map logic.
 */
export const MAP_STYLE_URL: string =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron'

export const LADDER_KM = [5, 15, 50, 150] as const
export const TARGET_RESULTS = 12
export const SIGNIFICANCE_FLOOR = 0.05
export const EXCLUDED_CATEGORIES = ['birth', 'death'] as const
export const DEBOUNCE_MS = 400
