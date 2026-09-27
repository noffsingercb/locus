import { describe, expect, it } from 'vitest'
import { walkLadder } from '../src/ladder'
import { makeEntries, makeResponse } from './fixtures'

const RUNGS = [5, 15, 50, 150] as const

function recorder(
  countsByRung: Record<number, number>,
  buildByRung: Record<number, string> = {},
) {
  const asked: number[] = []
  const query = async (radiusKm: number) => {
    asked.push(radiusKm)
    const response = makeResponse(radiusKm, makeEntries(countsByRung[radiusKm] ?? 0))
    const build = buildByRung[radiusKm]
    return build === undefined ? response : { ...response, datasetBuild: build }
  }
  return { asked, query }
}

describe('radius ladder', () => {
  it('stops at the first rung that meets the target and records the prior count', async () => {
    const { asked, query } = recorder({ 5: 4, 15: 12 })
    const outcome = await walkLadder(query, { rungs: RUNGS })
    expect(asked).toEqual([5, 15])
    expect(outcome.rungKm).toBe(15)
    expect(outcome.previousRungKm).toBe(5)
    expect(outcome.previousReturned).toBe(4)
    expect(outcome.satisfied).toBe(true)
  })

  it('does not treat one row as satisfied', async () => {
    const { asked, query } = recorder({ 5: 0, 15: 1, 50: 12 })
    const outcome = await walkLadder(query, { rungs: RUNGS })
    expect(asked).toEqual([5, 15, 50])
    expect(outcome.previousReturned).toBe(1)
  })

  it('returns the final short or empty answer', async () => {
    const short = await walkLadder(recorder({ 5: 0, 15: 0, 50: 2, 150: 4 }).query, { rungs: RUNGS })
    expect(short.response.returned).toBe(4)
    expect(short.satisfied).toBe(false)
    const empty = await walkLadder(recorder({ 5: 0, 15: 0, 50: 0, 150: 0 }).query, { rungs: RUNGS })
    expect(empty.response.returned).toBe(0)
  })

  it('never issues more than one request per rung for a stable build', async () => {
    const { asked, query } = recorder({})
    const outcome = await walkLadder(query, { rungs: RUNGS })
    expect(asked).toHaveLength(RUNGS.length)
    expect(outcome.requestCount).toBe(RUNGS.length)
  })

  it('restarts when the full artifact build changes even if datasetVersion does not', async () => {
    const { asked, query } = recorder(
      { 5: 0, 15: 12 },
      { 5: 'build-a', 15: 'build-b' },
    )
    const outcome = await walkLadder(query, { rungs: RUNGS })
    expect(asked.slice(0, 3)).toEqual([5, 15, 5])
    expect(outcome.response.datasetVersion).toBe('dump-v0.6.1')
  })
})
