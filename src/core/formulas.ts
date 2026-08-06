// 조조전(1998) 전투 공식 — 한국 모딩 커뮤니티 역공학 확정치 기반.
// 근거: docs/research/caocao.md §3~4 (디시 고전게임갤 분석글 + 나무위키 병과 문서)
// 모든 공식은 정수 연산(소수점 버림). 원작은 C 정수 나눗셈이므로 trunc 사용.

import type { GrowthGrade, GrowthGrades, OfficerStats, UnitClassDef } from './types'
import { CRIT_MULTIPLIER, EXP_PER_LEVEL, MAX_LEVEL } from './types'

const t = Math.trunc

// ---------- 성장 ----------

// 등급별 레벨당 성장치. 근거: "B등급 = +3/레벨", "만렙50 기준 S는 B보다 100(=+2/lv), A는 50(=+1/lv) 높음"
const GROWTH_PER_LEVEL: Record<GrowthGrade, number> = { S: 5, A: 4, B: 3, C: 2 }

/** 부대 능력치 = floor(장수 능력치 / 2) + 성장등급 × 레벨 */
export function unitStat(officerStat: number, grade: GrowthGrade, level: number): number {
  return t(officerStat / 2) + GROWTH_PER_LEVEL[grade] * level
}

export interface CombatStats {
  atk: number // 공격력 (무력)
  def: number // 방어력 (통솔)
  mind: number // 정신력 (지력)
  agi: number // 순발력 (민첩)
  morale: number // 사기 (운)
}

export function combatStats(officer: OfficerStats, growth: GrowthGrades, level: number): CombatStats {
  return {
    atk: unitStat(officer.str, growth.atk, level),
    def: unitStat(officer.ldr, growth.def, level),
    mind: unitStat(officer.int, growth.mind, level),
    agi: unitStat(officer.agi, growth.agi, level),
    morale: unitStat(officer.luck, growth.morale, level),
  }
}

export function maxHp(cls: UnitClassDef, level: number): number {
  return cls.hpBase + cls.hpGrowth * level
}

export function maxMp(cls: UnitClassDef, level: number): number {
  return cls.mpBase + cls.mpGrowth * level
}

// ---------- 명중 / 회심 / 2회 공격 ----------

/**
 * 물리 명중률 (%). r = 공격자 순발력 / 방어자 순발력. 하한 30, 상한 100.
 * r<1/3→30 | r<1/2→90r | r<1→60r+30 | r<2→10r+80 | r≥2→100
 * 체감 검증치: 순발 동급 90%, 0.75배 75%, 0.5배 60%
 */
export function hitRate(attackerAgi: number, defenderAgi: number): number {
  if (defenderAgi <= 0) return 100
  const r = attackerAgi / defenderAgi
  let rate: number
  if (r < 1 / 3) rate = 30
  else if (r < 1 / 2) rate = 90 * r
  else if (r < 1) rate = 60 * r + 30
  else if (r < 2) rate = 10 * r + 80
  else rate = 100
  return Math.max(30, Math.min(100, t(rate)))
}

/**
 * 2회 공격(순발력 비율) / 회심의 일격(사기 비율) 공통 곡선 (%).
 * r<1→1 | r<2→18r−16 | r<3→80r−140 | r≥3→100
 * 체감 검증치: 사기 2배 = 회심 20%, 1.6배 = 12.8%, 2.4배 = 52%
 */
export function ratioChance(attackerStat: number, defenderStat: number): number {
  if (defenderStat <= 0) return 100
  const r = attackerStat / defenderStat
  let rate: number
  if (r < 1) rate = 1
  else if (r < 2) rate = 18 * r - 16
  else if (r < 3) rate = 80 * r - 140
  else rate = 100
  return Math.max(1, Math.min(100, rate))
}

export const doubleAttackRate = (attackerAgi: number, defenderAgi: number): number =>
  ratioChance(attackerAgi, defenderAgi)

export const critRate = (attackerMorale: number, defenderMorale: number): number =>
  ratioChance(attackerMorale, defenderMorale)

/**
 * 책략 명중률 (%) = 물리 명중 공식에 (정신력+사기)를 대입 × 책략별 한계명중.
 */
export function strategyHitRate(
  casterMind: number,
  casterMorale: number,
  targetMind: number,
  targetMorale: number,
  capHitRate: number,
): number {
  const base = hitRate(casterMind + casterMorale, targetMind + targetMorale)
  return t((base * capHitRate) / 100)
}

// ---------- 데미지 ----------

export interface PhysicalDamageInput {
  atk: number
  def: number
  atkTerrainEffect: number // 공격자 지형효과 % (100 = 무보정)
  defTerrainEffect: number
  attackerLevel: number
  /** 상성/회심 등 곱연산 배율 목록 (예: [1.5, 1.5]) */
  multipliers?: number[]
  /** 시드 랜덤 가산치 (0~7). battle.ts에서 rng로 생성해 주입 */
  randomBonus?: number
}

/**
 * 물리 데미지 = (공격력×지형효과 − 방어력×지형효과) / 2 + 공격자 레벨 + 25
 * 이후 상성/회심 배율을 곱연산(단계마다 버림), 최소 1.
 */
export function physicalDamage(input: PhysicalDamageInput): number {
  const atkEff = t((input.atk * input.atkTerrainEffect) / 100)
  const defEff = t((input.def * input.defTerrainEffect) / 100)
  let dmg = t((atkEff - defEff) / 2) + input.attackerLevel + 25
  for (const m of input.multipliers ?? []) {
    dmg = t(dmg * m)
  }
  dmg += input.randomBonus ?? 0
  return Math.max(1, dmg)
}

/**
 * 책략 데미지 = ((시전자 정신력 − 대상 정신력) / 3 + 시전자 레벨 + 25) × 위력계수%
 * 지형효과는 책략에 적용하지 않음. 최소 1.
 */
export function strategyDamage(
  casterMind: number,
  targetMind: number,
  casterLevel: number,
  power: number,
  randomBonus = 0,
): number {
  const base = t((casterMind - targetMind) / 3) + casterLevel + 25
  const dmg = t((base * power) / 100) + randomBonus
  return Math.max(1, dmg)
}

// ---------- 상성 ----------

/**
 * 상성 배율 — 삼각형: 기병 > 보병 > 궁병 > 기병 (단방향 +50%)
 *  - 원거리(ranged) → 기병(mounted): ×1.5 (弓克骑) [CN·KR 일치]
 *  - 기병 → 보병: ×1.5 (骑克步) [CN 百度经验]
 *  - 보병 → 궁병: ×1.5 (步克弓) [CN 百度经验]
 *  - 보병 → 기병(mounted): ×0.5 (딜 반감) [KR 나무위키]
 * ※ 출처 충돌: KR 나무위키는 궁→기 +50%와 보→기 반감만 명시(나머지는 스탯 창발),
 *   CN 百度经验은 삼각 +50%를 명시 — 삼각형이 완성되는 CN 서술을 채택 (docs/research/ux.md 부록).
 */
export function affinityMultiplier(attacker: UnitClassDef, defender: UnitClassDef): number {
  if (attacker.category === 'infantry' && defender.mounted) return 0.5
  if (attacker.ranged && defender.mounted) return 1.5
  if (attacker.category === 'cavalry' && defender.category === 'infantry') return 1.5
  if (attacker.category === 'infantry' && defender.category === 'archer') return 1.5
  return 1
}

/** 반격 데미지 배율 — 반격은 본 공격 데미지의 80% (docs/research/ux.md §5) */
export const COUNTER_DAMAGE_SCALE = 0.8

export const critMultiplier = CRIT_MULTIPLIER

// ---------- 경험치 / 레벨 ----------

/**
 * 경험치 획득량 (원작 정확 공식 미확보 — 근사치, docs/research/caocao.md §3 참고).
 * 원칙: 레벨 차가 크면 급감, 격파 시 대폭 보너스, 최소 1.
 */
export function expGain(actorLevel: number, targetLevel: number, defeated: boolean): number {
  const diff = targetLevel - actorLevel
  const base = defeated ? 50 : 10
  return Math.max(1, Math.min(EXP_PER_LEVEL, base + diff * 5))
}

export interface LevelProgress {
  level: number
  exp: number
  levelsGained: number
}

/** 경험치 적용: 100마다 레벨업, 상한 Lv50 (도달 시 초과 경험치 소멸) */
export function applyExp(level: number, exp: number, gained: number): LevelProgress {
  let newLevel = level
  let newExp = exp + gained
  let levelsGained = 0
  while (newExp >= EXP_PER_LEVEL && newLevel < MAX_LEVEL) {
    newExp -= EXP_PER_LEVEL
    newLevel += 1
    levelsGained += 1
  }
  if (newLevel >= MAX_LEVEL) newExp = 0
  return { level: newLevel, exp: newExp, levelsGained }
}
