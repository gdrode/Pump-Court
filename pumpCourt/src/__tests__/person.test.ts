import { describe, expect, it } from 'vitest'
import { bodyOf, createPersonLock, PERSON, startScore } from '../person'
import type { Landmark } from '../pose'

/** 33 landmarks, all invisible except a left side placed from `pts` (x, y in 0..1). */
function pose(pts: Record<number, [number, number]>): Landmark[] {
  const out: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
  for (const [i, [x, y]] of Object.entries(pts)) out[Number(i)] = { x, y, z: 0, visibility: 0.95 }
  return out
}

/** Side-on plank, shoulder at (x, y), `len` = shoulder to ankle. Hands under the shoulder. */
const plank = (x: number, y: number, len: number) =>
  pose({ 11: [x, y], 13: [x, y + len * 0.15], 15: [x, y + len * 0.3], 23: [x + len * 0.5, y + len * 0.02], 25: [x + len * 0.75, y + len * 0.04], 27: [x + len, y + len * 0.06] })

/** Standing, head up: shoulder at (x, y), ankle `len` below. */
const standing = (x: number, y: number, len: number) =>
  pose({ 11: [x, y], 13: [x, y + len * 0.2], 15: [x, y + len * 0.35], 23: [x, y + len * 0.45], 25: [x, y + len * 0.7], 27: [x, y + len] })

describe('person', () => {
  it('scores a big, level body on the floor above a standing one', () => {
    expect(startScore(plank(0.2, 0.6, 0.5), 1)).toBeGreaterThan(startScore(standing(0.5, 0.2, 0.7), 1))
    expect(startScore(plank(0.2, 0.6, 0.6), 1)).toBeGreaterThan(startScore(plank(0.6, 0.6, 0.2), 1)) // closer wins
    expect(bodyOf(pose({ 11: [0.1, 0.1] }), 1)).toBeNull()
  })

  it('keeps following the same person when someone better placed walks in', () => {
    const lock = createPersonLock()
    const me = plank(0.1, 0.6, 0.3)
    expect(lock.pick([me], 1, 0)).toEqual({ pose: me, switched: true })
    const bigger = plank(0.5, 0.65, 0.45)
    const moved = plank(0.12, 0.6, 0.3)
    const r = lock.pick([bigger, moved], 1, 33)
    expect(r.pose).toBe(moved)
    expect(r.switched).toBe(false)
  })

  it('recalibrate: drops the current person for the best other one', () => {
    const lock = createPersonLock()
    const a = plank(0.1, 0.6, 0.3)
    const crowd = standing(0.8, 0.1, 0.6)
    const next = plank(0.45, 0.62, 0.4)
    lock.pick([a], 1, 0)
    lock.recalibrate()
    const r = lock.pick([crowd, a, next], 1, 33)
    expect(r).toEqual({ pose: next, switched: true })
    // ...and sticks with them afterwards.
    expect(lock.pick([a, plank(0.46, 0.62, 0.4)], 1, 66).switched).toBe(false)
  })

  it('recalibrate with nobody else in view keeps the current person', () => {
    const lock = createPersonLock()
    const a = plank(0.1, 0.6, 0.3)
    lock.pick([a], 1, 0)
    lock.recalibrate()
    expect(lock.pick([a], 1, 33)).toEqual({ pose: a, switched: false })
  })

  it('waits for a lost player, then takes whoever is best placed', () => {
    const lock = createPersonLock()
    lock.pick([plank(0.1, 0.6, 0.3)], 1, 0)
    const other = plank(0.6, 0.6, 0.3)
    expect(lock.pick([other], 1, 500).pose).toBeUndefined()
    expect(lock.pick([other], 1, PERSON.lostMs + 100)).toEqual({ pose: other, switched: true })
  })
})
