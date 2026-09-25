/**
 * The radius ladder: Locus's answer to a thin result, and pure client policy.
 *
 * The API answers one radius truthfully and stops. Widening the search is a
 * product decision about how far away still counts as "near here", so it is
 * made here, sequentially, with a hard ceiling of one request per rung.
 */

import type { NearbyResponse } from './api'
import { LADDER_KM, TARGET_RESULTS } from './config'

export interface LadderOutcome {
  response: NearbyResponse
  /** The rung whose answer is being shown. */
  rungKm: number
  /** The last rung that came back short, or null when the first rung filled. */
  previousRungKm: number | null
  /** True when the shown rung met the target count. */
  satisfied: boolean
  requestCount: number
}

export interface LadderOptions {
  rungs?: readonly number[]
  target?: number
}

/**
 * Walks the rungs in order and stops at the first one that meets the target.
 *
 * Deterministic by construction: the same coordinate against the same dataset
 * always issues the same requests and stops at the same rung. A dataset
 * version change mid-walk invalidates the comparison between rungs, so the
 * walk restarts once from the first rung rather than mixing two datasets into
 * one answer.
 */
export async function walkLadder(
  query: (radiusKm: number) => Promise<NearbyResponse>,
  options: LadderOptions = {},
): Promise<LadderOutcome> {
  const rungs = options.rungs ?? LADDER_KM
  const target = options.target ?? TARGET_RESULTS
  if (rungs.length === 0) throw new Error('The ladder needs at least one rung.')

  let requestCount = 0
  let datasetVersion: string | null | undefined
  let restarted = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let previousRungKm: number | null = null
    let last: Omit<LadderOutcome, 'satisfied' | 'requestCount'> | null = null
    let mismatch = false

    for (const rungKm of rungs) {
      const response = await query(rungKm)
      requestCount += 1

      if (datasetVersion === undefined) {
        datasetVersion = response.datasetVersion
      } else if (response.datasetVersion !== datasetVersion) {
        datasetVersion = response.datasetVersion
        mismatch = true
        break
      }

      last = { response, rungKm, previousRungKm }

      // A rung that returns one row has not answered the question; only the
      // full target counts as satisfied.
      if (response.returned >= target) {
        return { ...last, satisfied: true, requestCount }
      }
      previousRungKm = rungKm
    }

    if (mismatch && !restarted) {
      restarted = true
      continue
    }
    if (last === null) throw new Error('The ladder produced no usable response.')

    // Final rung, short of the target -- including zero, which is a valid
    // answer about the corpus rather than an error.
    return { ...last, satisfied: false, requestCount }
  }

  throw new Error('The ladder restarted without settling.')
}
