import { describe, it, expect } from 'vitest'
import { angle } from '../geometry'

const P = (x: number, y: number) => ({ x, y })

describe('geometry.angle', () => {
  it('right angle = 90', () => {
    expect(angle(P(1, 0), P(0, 0), P(0, 1))).toBeCloseTo(90, 10)
    expect(angle(P(-0.1, -0.1), P(0, 0), P(-0.1, 0.1))).toBeCloseTo(90, 10)
  })

  it('straight = 180', () => {
    expect(angle(P(-1, 0), P(0, 0), P(1, 0))).toBeCloseTo(180, 10)
    expect(angle(P(0.2, 0.5), P(0.5, 0.575), P(0.8, 0.65))).toBeCloseTo(180, 6)
  })

  it('folded = 0', () => {
    expect(angle(P(1, 0), P(0, 0), P(2, 0))).toBeCloseTo(0, 6)
  })

  it('45 and 135 degrees', () => {
    expect(angle(P(1, 0), P(0, 0), P(1, 1))).toBeCloseTo(45, 10)
    expect(angle(P(1, 0), P(0, 0), P(-1, 1))).toBeCloseTo(135, 10)
  })

  it('is symmetric in a and c', () => {
    const cases: [number, number, number, number, number, number][] = [
      [0.3, 0.4, 0.4, 0.5, 0.3, 0.6],
      [0.11, 0.97, 0.5, 0.5, 0.82, 0.13],
      [-3, 7, 1, 1, 4, -2],
    ]
    for (const [ax, ay, bx, by, cx, cy] of cases) {
      expect(angle(P(ax, ay), P(bx, by), P(cx, cy))).toBe(angle(P(cx, cy), P(bx, by), P(ax, ay)))
    }
  })

  it('does not depend on segment length', () => {
    expect(angle(P(10, 0), P(0, 0), P(0, 0.001))).toBeCloseTo(90, 8)
  })

  it('clamps floating error: collinear points never return NaN', () => {
    // These produce dot/mag a hair outside [-1, 1] without the clamp.
    const pts: [number, number][] = [[0.1, 0.1], [0.3, 0.3], [0.7, 0.7], [1 / 3, 1 / 3], [0.123456789, 0.987654321]]
    for (let i = 0; i < 200; i++) {
      const k = 1 + i * 0.1373
      for (const [x, y] of pts) {
        const straight = angle(P(-x * k, -y * k), P(0, 0), P(x, y))
        const folded = angle(P(x * k, y * k), P(0, 0), P(x, y))
        expect(Number.isNaN(straight)).toBe(false)
        expect(Number.isNaN(folded)).toBe(false)
        expect(straight).toBeCloseTo(180, 5)
        expect(folded).toBeCloseTo(0, 5)
      }
    }
  })

  it('zero-length segment returns NaN', () => {
    expect(angle(P(0, 0), P(0, 0), P(1, 0))).toBeNaN()
    expect(angle(P(1, 0), P(0, 0), P(0, 0))).toBeNaN()
    expect(angle(P(0.5, 0.5), P(0.5, 0.5), P(0.5, 0.5))).toBeNaN()
  })
})
