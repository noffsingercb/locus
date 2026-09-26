/** Deterministic client-side radius escalation. */

import type { NearbyResponse } from './api'
import { LADDER_KM, TARGET_RESULTS } from './config'

export interface LadderOutcome {
  response: NearbyResponse
  rungKm: number
  previousRungKm: number | null
  /** Count returned by the previous short rung; null on a first-rung answer. */
  previousReturned: number | null
  satisfied: boolean
  requestCount: number
}

export interface LadderOptions {
  rungs?: readonly number[]
  target?: number
}

function artifactIdentity(response: NearbyResponse): string | null {
  return response.datasetBuild ?? response.datasetVersion
}

export async function walkLadder(
  query: (radiusKm: number) => Promise<NearbyResponse>,
  options: LadderOptions = {},
): Promise<LadderOutcome> {
  const rungs = options.rungs ?? LADDER_KM
  const target = options.target ?? TARGET_RESULTS
  if (rungs.length === 0) throw new Error('The ladder needs at least one rung.')

  let requestCount = 0
  let baseline: string | null | undefined
  let restarted = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let previousRungKm: number | null = null
    let previousReturned: number | null = null
    let last: Omit<LadderOutcome, 'satisfied' | 'requestCount'> | null = null
    let restartNeeded = false

    for (const rungKm of rungs) {
      const response = await query(rungKm)
      requestCount += 1
      const identity = artifactIdentity(response)

      if (baseline === undefined) {
        baseline = identity
      } else if (identity !== baseline) {
        if (!restarted) {
          restarted = true
          baseline = undefined
          restartNeeded = true
          break
        }
        baseline = identity
        last = { response, rungKm, previousRungKm, previousReturned }
        break
      }

      last = { response, rungKm, previousRungKm, previousReturned }
      if (response.returned >= target) {
        return { ...last, satisfied: true, requestCount }
      }
      previousRungKm = rungKm
      previousReturned = response.returned
    }

    if (restartNeeded) continue
    if (last === null) throw new Error('The ladder produced no usable response.')
    return {
      ...last,
      satisfied: last.response.returned >= target,
      requestCount,
    }
  }

  throw new Error('The ladder restarted without settling.')
}
