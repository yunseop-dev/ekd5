// 시드 기반 결정적 RNG (mulberry32).
// 전투 상태에 rngState를 저장해 같은 시드 = 같은 전개를 보장한다.
// (리플레이, 테스트, 모드 커뮤니티 표준 "난수고정" 난이도 옵션의 기반)

export interface RngResult<T> {
  value: T
  nextState: number
}

function mulberry32(state: number): { value: number; nextState: number } {
  let a = (state + 0x6d2b79f5) | 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { value, nextState: a }
}

/** [0, 1) 실수 */
export function nextFloat(state: number): RngResult<number> {
  const r = mulberry32(state)
  return { value: r.value, nextState: r.nextState }
}

/** [min, max] 정수 (양 끝 포함) */
export function nextInt(state: number, min: number, max: number): RngResult<number> {
  const r = mulberry32(state)
  return { value: min + Math.floor(r.value * (max - min + 1)), nextState: r.nextState }
}

/** percent% 확률로 true (0~100) */
export function roll(state: number, percent: number): RngResult<boolean> {
  const r = mulberry32(state)
  return { value: r.value * 100 < percent, nextState: r.nextState }
}
