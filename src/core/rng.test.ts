import { describe, expect, it } from 'vitest'
import { nextFloat, nextInt, roll } from './rng'

describe('rng', () => {
  it('같은 시드는 같은 값을 낸다 (결정성)', () => {
    const a = nextFloat(12345)
    const b = nextFloat(12345)
    expect(a.value).toBe(b.value)
    expect(a.nextState).toBe(b.nextState)
  })

  it('상태가 진행되면 다른 값이 나온다', () => {
    const a = nextFloat(12345)
    const b = nextFloat(a.nextState)
    expect(a.value).not.toBe(b.value)
  })

  it('nextInt는 [min, max] 범위를 벗어나지 않는다', () => {
    let state = 42
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(state, 0, 7)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThanOrEqual(7)
      state = r.nextState
    }
  })

  it('nextInt는 양 끝값을 실제로 생성한다', () => {
    let state = 1
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const r = nextInt(state, 0, 3)
      seen.add(r.value)
      state = r.nextState
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]))
  })

  it('roll(100)은 항상 true, roll(0)은 항상 false', () => {
    let state = 7
    for (let i = 0; i < 100; i++) {
      const yes = roll(state, 100)
      const no = roll(state, 0)
      expect(yes.value).toBe(true)
      expect(no.value).toBe(false)
      state = yes.nextState
    }
  })

  it('roll(50)은 대략 절반 확률 (±10%p)', () => {
    let state = 99
    let hits = 0
    const n = 5000
    for (let i = 0; i < n; i++) {
      const r = roll(state, 50)
      if (r.value) hits++
      state = r.nextState
    }
    expect(hits / n).toBeGreaterThan(0.4)
    expect(hits / n).toBeLessThan(0.6)
  })
})
