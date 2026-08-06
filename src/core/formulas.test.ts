// 조조전 역공학 공식의 커뮤니티 검증 수치를 그대로 테스트로 옮김.
// 근거: docs/research/caocao.md §4 (디시 분석글 + 나무위키 병과 문서)

import { describe, expect, it } from 'vitest'
import {
  affinityMultiplier,
  applyExp,
  critRate,
  doubleAttackRate,
  expGain,
  hitRate,
  physicalDamage,
  ratioChance,
  strategyDamage,
  strategyHitRate,
  unitStat,
} from './formulas'
import type { UnitClassDef } from './types'

describe('unitStat (부대 능력치)', () => {
  it('부대 초기치(Lv0) = 장수 능력치의 절반', () => {
    expect(unitStat(90, 'B', 0)).toBe(45)
  })

  it('검증 예시: 민첩 90, 순발 B등급, Lv10 = 45 + 3×10 = 75', () => {
    expect(unitStat(90, 'B', 10)).toBe(75)
  })

  it('만렙(50) 기준 S등급은 B등급보다 100 높다', () => {
    expect(unitStat(80, 'S', 50) - unitStat(80, 'B', 50)).toBe(100)
  })

  it('만렙(50) 기준 A등급은 B등급보다 50 높다', () => {
    expect(unitStat(80, 'A', 50) - unitStat(80, 'B', 50)).toBe(50)
  })
})

describe('hitRate (물리 명중률)', () => {
  it('순발력 동급 = 90%', () => {
    expect(hitRate(100, 100)).toBe(90)
  })

  it('r=0.75 → 75% (60r+30 구간)', () => {
    expect(hitRate(75, 100)).toBe(75)
  })

  it('r=0.5 → 60% (구간 경계)', () => {
    expect(hitRate(50, 100)).toBe(60)
  })

  it('r=0.4 → 36% (90r 구간)', () => {
    expect(hitRate(40, 100)).toBe(36)
  })

  it('하한 30%: 순발력이 3분의 1 미만이어도 30%', () => {
    expect(hitRate(10, 100)).toBe(30)
  })

  it('상한 100%: 순발력 2배 이상이면 100%', () => {
    expect(hitRate(200, 100)).toBe(100)
    expect(hitRate(500, 100)).toBe(100)
  })

  it('r=1.5 → 95% (10r+80 구간)', () => {
    expect(hitRate(150, 100)).toBe(95)
  })
})

describe('ratioChance (회심/2회공격 공통 곡선)', () => {
  it('열세(r<1)면 1%', () => {
    expect(ratioChance(50, 100)).toBe(1)
  })

  it('커뮤니티 검증치: 사기 2배 = 20% (허저 S급 vs 잡병 B급)', () => {
    expect(critRate(200, 100)).toBe(20)
  })

  it('커뮤니티 검증치: 사기 1.6배 = 12.8% (조비 A급 vs B급)', () => {
    expect(critRate(160, 100)).toBeCloseTo(12.8)
  })

  it('커뮤니티 검증치: 순발 2.4배 = 52% (연병 버프 받은 전위)', () => {
    expect(doubleAttackRate(240, 100)).toBeCloseTo(52)
  })

  it('r≥3이면 100% (둔병 디버프까지 걸면 확정 2회 공격)', () => {
    expect(doubleAttackRate(300, 100)).toBe(100)
  })
})

describe('strategyHitRate (책략 명중률)', () => {
  it('정신+사기 동급 × 한계명중 100% = 90%', () => {
    expect(strategyHitRate(100, 50, 100, 50, 100)).toBe(90)
  })

  it('한계명중 33%(해일급)이면 동급 상대 29%', () => {
    // floor(90 × 33 / 100) = 29
    expect(strategyHitRate(100, 50, 100, 50, 33)).toBe(29)
  })

  it('사기 버프는 책략 방어에 기여한다 (대상 사기 상승 → 명중 하락)', () => {
    const before = strategyHitRate(100, 50, 80, 30, 100)
    const after = strategyHitRate(100, 50, 80, 80, 100)
    expect(after).toBeLessThan(before)
  })
})

describe('physicalDamage (물리 데미지)', () => {
  it('기본식: (공격 − 방어)/2 + 레벨 + 25', () => {
    // (300 - 200)/2 + 10 + 25 = 85
    expect(
      physicalDamage({ atk: 300, def: 200, atkTerrainEffect: 100, defTerrainEffect: 100, attackerLevel: 10 }),
    ).toBe(85)
  })

  it('지형효과는 공/방 각각에 곱해진다 (기병 평지 110% vs 악지 80%)', () => {
    // atk 300×1.1=330, def 200×0.8=160 → (330-160)/2 + 10 + 25 = 120
    expect(
      physicalDamage({ atk: 300, def: 200, atkTerrainEffect: 110, defTerrainEffect: 80, attackerLevel: 10 }),
    ).toBe(120)
  })

  it('방어가 압도해도 최소 데미지 1', () => {
    expect(
      physicalDamage({ atk: 100, def: 900, atkTerrainEffect: 100, defTerrainEffect: 100, attackerLevel: 1 }),
    ).toBe(1)
  })

  it('배율은 곱연산, 단계마다 버림 (원거리→기병 1.5 × 회심 1.5 = 2.25배)', () => {
    const base = physicalDamage({
      atk: 301, def: 200, atkTerrainEffect: 100, defTerrainEffect: 100, attackerLevel: 10,
    })
    // base = trunc(101/2) + 35 = 85
    expect(base).toBe(85)
    const boosted = physicalDamage({
      atk: 301, def: 200, atkTerrainEffect: 100, defTerrainEffect: 100, attackerLevel: 10,
      multipliers: [1.5, 1.5],
    })
    // trunc(85×1.5)=127 → trunc(127×1.5)=190 (곱연산 + 단계별 버림)
    expect(boosted).toBe(190)
  })

  it('랜덤 가산치가 더해진다', () => {
    const a = physicalDamage({
      atk: 300, def: 200, atkTerrainEffect: 100, defTerrainEffect: 100, attackerLevel: 10, randomBonus: 7,
    })
    expect(a).toBe(92)
  })
})

describe('strategyDamage (책략 데미지)', () => {
  it('기본식: ((시전 정신 − 대상 정신)/3 + 레벨 + 25) × 위력%', () => {
    // (150-60)/3 + 20 + 25 = 75, ×70% = 52 (초열)
    expect(strategyDamage(150, 60, 20, 70)).toBe(52)
  })

  it('주작(위력 100%)은 계수 없이 그대로', () => {
    expect(strategyDamage(150, 60, 20, 100)).toBe(75)
  })

  it('정신력이 열세여도 레벨+25 덕에 유효 데미지 (선형 공식 특성)', () => {
    // (60-150)/3 = -30 → -30 + 20 + 25 = 15
    expect(strategyDamage(60, 150, 20, 100)).toBe(15)
  })

  it('최소 1 보장', () => {
    expect(strategyDamage(10, 300, 1, 33)).toBe(1)
  })
})

const mkClass = (over: Partial<UnitClassDef>): UnitClassDef => ({
  id: 'x', name: 'x', tier: 1, category: 'infantry', mounted: false, ranged: false,
  move: 4, minRange: 1, maxRange: 1, moveProfile: 'foot',
  growth: { atk: 'B', def: 'B', mind: 'B', agi: 'B', morale: 'B' },
  hpBase: 100, hpGrowth: 6, mpBase: 10, mpGrowth: 1, strategies: [],
  ...over,
})

describe('affinityMultiplier (상성)', () => {
  const infantry = mkClass({ category: 'infantry' })
  const cavalry = mkClass({ category: 'cavalry', mounted: true })
  const archer = mkClass({ category: 'archer', ranged: true, minRange: 2, maxRange: 2 })

  it('보병 → 기병: 딜 50% 감소', () => {
    expect(affinityMultiplier(infantry, cavalry)).toBe(0.5)
  })

  it('원거리 → 기병: +50% 추가 피해', () => {
    expect(affinityMultiplier(archer, cavalry)).toBe(1.5)
  })

  it('기병 → 보병: +50% (骑克步)', () => {
    expect(affinityMultiplier(cavalry, infantry)).toBe(1.5)
  })

  it('보병 → 궁병: +50% (步克弓)', () => {
    expect(affinityMultiplier(infantry, archer)).toBe(1.5)
  })

  it('역상성/무관 조합은 배율 없음', () => {
    expect(affinityMultiplier(archer, infantry)).toBe(1)
    expect(affinityMultiplier(cavalry, archer)).toBe(1)
  })
})

describe('expGain / applyExp', () => {
  it('동레벨 격파 = 50', () => {
    expect(expGain(10, 10, true)).toBe(50)
  })

  it('레벨 차가 크면 급감하되 최소 1', () => {
    expect(expGain(30, 10, false)).toBe(1)
  })

  it('상한 100', () => {
    expect(expGain(1, 40, true)).toBe(100)
  })

  it('100 도달 시 레벨업, 잔여 경험치 유지', () => {
    expect(applyExp(5, 80, 50)).toEqual({ level: 6, exp: 30, levelsGained: 1 })
  })

  it('한 번에 여러 레벨업 가능', () => {
    expect(applyExp(5, 90, 210)).toEqual({ level: 8, exp: 0, levelsGained: 3 })
  })

  it('Lv50 상한: 초과 경험치 소멸', () => {
    expect(applyExp(49, 90, 200)).toEqual({ level: 50, exp: 0, levelsGained: 1 })
  })
})
