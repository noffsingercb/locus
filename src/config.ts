/** Client-side product policy and public deployment configuration. */

const RAW_BASE_URL: string =
  import.meta.env.VITE_GEOHISTORY_API_BASE_URL ?? 'http://localhost:8787'

export const API_BASE_URL: string = RAW_BASE_URL.replace(/\/+$/, '')

/**
 * CARTO Voyager is the keyless production default. Both values remain
 * configurable so deployment is not coupled permanently to one tile service.
 */
export const TILE_URL: string =
  import.meta.env.VITE_TILE_URL ??
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

export const TILE_ATTRIBUTION: string =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  '&copy; OpenStreetMap contributors &copy; CARTO'

export const LADDER_KM = [5, 15, 50, 150] as const
export const TARGET_RESULTS = 12
export const SIGNIFICANCE_FLOOR = 0.05
export const EXCLUDED_CATEGORIES = ['birth', 'death'] as const
export const DEBOUNCE_MS = 400
