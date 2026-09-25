import { describe, expect, it } from 'vitest'
import { walkLadder } from '../src/ladder'
import { makeEntries, makeResponse } from './fixtures'

const RUNGS = [5, 15, 50, 150] as const

/** Records which rungs were asked for, so escalation is observable. */
function recorder(countsByRung: Record<number, number>, datasetByRung: Record<number, string> = {}) {
  const asked: number[] = []
  const query = async (radiusKm: number) => {
    asked.push(radiusKm)
    const response = makeResponse(radiusKm, makeEntries(countsByRung[radiusKm] ?? 0))
    const version = datasetByRung[radiusKm]
    return version === undefined ? response : { ...response, datasetVersion: version }
  }
  return { asked, query }
}

describe('radius ladder', () => {
  it('stops at the first rung that meets the target', async () => {
    const { asked, query } = recorder({ 5: 4, 15: 12, 50: 30, 150: 40 })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    expect(asked).toEqual([5, 15])
    expect(outcome.rungKm).toBe(15)
    expect(outcome.previousRungKm).toBe(5)
    expect(outcome.satisfied).toBe(true)
    expect(outcome.requestCount).toBe(2)
  })

  it('does not treat a single row as a satisfied rung', async () => {
    const { asked, query } = recorder({ 5: 0, 15: 1, 50: 12 })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    expect(asked).toEqual([5, 15, 50])
    expect(outcome.rungKm).toBe(50)
    expect(outcome.satisfied).toBe(true)
  })

  it('shows what exists when the final rung falls short', async () => {
    const { asked, query } = recorder({ 5: 0, 15: 0, 50: 2, 150: 4 })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    expect(asked).toEqual([5, 15, 50, 150])
    expect(outcome.rungKm).toBe(150)
    expect(outcome.satisfied).toBe(false)
    expect(outcome.response.returned).toBe(4)
  })

  it('treats zero at the final rung as a valid answer, not an error', async () => {
    const { query } = recorder({ 5: 0, 15: 0, 50: 0, 150: 0 })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    expect(outcome.response.returned).toBe(0)
    expect(outcome.satisfied).toBe(false)
    expect(outcome.rungKm).toBe(150)
  })

  it('never issues more requests than there are rungs', async () => {
    const { asked, query } = recorder({ 5: 0, 15: 0, 50: 0, 150: 0 })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    expect(asked).toHaveLength(RUNGS.length)
    expect(outcome.requestCount).toBe(RUNGS.length)
  })

  it('is deterministic: identical inputs walk identical rungs', async () => {
    const first = recorder({ 5: 0, 15: 3, 50: 12 })
    const second = recorder({ 5: 0, 15: 3, 50: 12 })
    const a = await walkLadder(first.query, { rungs: RUNGS })
    const b = await walkLadder(second.query, { rungs: RUNGS })

    expect(first.asked).toEqual(second.asked)
    expect(a.rungKm).toBe(b.rungKm)
  })

  it('restarts once when the dataset version changes mid-walk', async () => {
    const { asked, query } = recorder({ 5: 0, 15: 12 }, { 15: 'dump-v0.7' })
    const outcome = await walkLadder(query, { rungs: RUNGS })

    // 5, 15 (mismatch detected), then a clean restart from the first rung.
    expect(asked.slice(0, 3)).toEqual([5, 15, 5])
    expect(outcome.response.datasetVersion).toBe('dump-v0.7')
  })
})
