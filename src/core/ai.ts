// 적 AI — 유틸리티 스코어링 (docs/research/tech.md §3)
// (도달 가능 칸 × 공격 가능 대상) 조합을 열거해
// 점수 = 기대 데미지 − 기대 반격 데미지 + 킬 보너스 + 지형 보정 으로 채점, 최고점 실행.
// behavior: guard = 현재 위치에서 공격만(이동 추격 안 함), pursue = 최근접 적에게 접근.

import { TERRAIN } from '../data/terrain'
import {
  applyAction,
  canAct,
  canCast,
  classOf,
  effectiveStats,
  hasStatus,
  hitRateAgainst,
  isHostile,
  knownStrategies,
  livingUnits,
  movementRangeOf,
  strategyRateAgainst,
  terrainEffectOf,
  unitAt,
} from './battle'
import {
  affinityMultiplier,
  COUNTER_DAMAGE_SCALE,
  critRate as critRateOf,
  doubleAttackRate,
  hitRate,
  physicalDamage,
  strategyDamage,
  strategyHealAmount,
} from './formulas'
import { manhattan, strategyAreaCells } from './movement'
import type { BattleAction, BattleState, Faction, StatusId, StrategyArea, UnitState, Vec2 } from './types'

const KILL_BONUS = 40
/** 회복 1점의 가치 계수 — 데미지 1점보다 낮게 본다 (기대값이 비슷하면 공격을 고른다) */
const HEAL_VALUE = 0.8
/** 회복 후보로 삼을 최소 손실 비율 — 스치기만 한 아군에 힐을 낭비하지 않는다 */
const HEAL_MIN_LOSS_RATIO = 0.25
/** 버프/디버프 1대상의 고정 가치 — 공격 기대값과 겨루기엔 소박한 값(대개 공격이 이긴다) */
const BUFF_VALUE = 12
/**
 * 상태이상 1대상의 고정 가치 (BUFF_VALUE의 연장선).
 * 혼란(행동 전면 봉쇄) > 금책(책략만) > 부동·독(부분 봉쇄/지속딜) 순.
 * 매혹은 부여 수단이 없어 기재하지 않는다 — 미기재 상태는 BUFF_VALUE로 본다.
 */
const STATUS_VALUE: Partial<Record<StatusId, number>> = {
  confusion: 18,
  seal: 14,
  immobile: 10,
  poison: 10,
}
/** 버프 판단용 전투 반경 — 이 거리 안에 적이 있는 아군만 강화 대상으로 본다 */
const COMBAT_RADIUS = 4

interface UnitPlan {
  moveTo: Vec2 | null
  act: BattleAction
  score: number
}

function terrainEffectAt(state: BattleState, unit: UnitState, pos: Vec2): number {
  const tile = state.map.tiles[pos.y][pos.x]
  return TERRAIN[tile].effect[classOf(unit).moveProfile]
}

/** cell에서 target을 물리 공격할 때의 기대 점수 */
function scorePhysical(state: BattleState, unit: UnitState, cell: Vec2, target: UnitState): number {
  const uStats = effectiveStats(unit)
  const tStats = effectiveStats(target)
  const uCls = classOf(unit)
  const tCls = classOf(target)

  const dmg = physicalDamage({
    atk: uStats.atk,
    def: tStats.def,
    atkTerrainEffect: terrainEffectAt(state, unit, cell),
    defTerrainEffect: terrainEffectOf(state, target),
    attackerLevel: unit.level,
    multipliers: [affinityMultiplier(uCls, tCls)],
  })
  const hit = hitRateAgainst(uStats.agi, target, tStats.agi) / 100 // 혼란 대상은 확정 피격
  const dbl = doubleAttackRate(uStats.agi, tStats.agi) / 100
  const crit = critRateOf(uStats.morale, tStats.morale) / 100
  const expected = dmg * hit * (1 + dbl) * (1 + 0.5 * crit)

  let score = expected
  if (expected >= target.hp) score += KILL_BONUS
  if (target.isLeader) score += 10 // 주인공 우선 압박

  // 반격 리스크 (근접 공격 시). 혼란에 걸린 상대는 반격하지 못한다 (statuses.md §1)
  const dist = manhattan(cell, target.pos)
  if (!uCls.ranged && dist === 1 && !tCls.ranged && tCls.minRange <= 1 && canAct(target)) {
    const counterDmg = physicalDamage({
      atk: tStats.atk,
      def: uStats.def,
      atkTerrainEffect: terrainEffectOf(state, target),
      defTerrainEffect: terrainEffectAt(state, unit, cell),
      attackerLevel: target.level,
      multipliers: [affinityMultiplier(tCls, uCls), COUNTER_DAMAGE_SCALE],
    })
    score -= counterDmg * (hitRate(tStats.agi, uStats.agi) / 100)
  }

  score += terrainEffectAt(state, unit, cell) / 20 // 좋은 지형 선호 (약한 가중치)
  return score
}

/** 중심 칸을 기준으로 책략 범위 안에 들어오는 생존 유닛 목록 (리듀서와 같은 strategyAreaCells 사용) */
function unitsInArea(state: BattleState, area: StrategyArea, center: Vec2): UnitState[] {
  const found: UnitState[] = []
  for (const cell of strategyAreaCells(area, center)) {
    const u = unitAt(state, cell)
    if (u) found.push(u)
  }
  return found
}

/** 같은 능력치에 이미 걸린 버프/디버프가 있는지 (중복 시전 방지) */
const hasBuffOn = (unit: UnitState, stat: string): boolean => unit.buffs.some((b) => b.stat === stat)

/**
 * 방해 책략 1대상의 가치 — 0이면 후보에서 빠진다.
 * 이미 걸린 상태는 재부여해도 지속턴이 늘지 않으니(원작 사양) 가치가 없고,
 * 봉쇄형은 그 봉쇄가 실제로 아픈 상대에게만 값을 준다.
 */
function statusValueAgainst(foe: UnitState, statusId: StatusId): number {
  if (hasStatus(foe, statusId)) return 0
  // 금책: 쓸 책략도 MP도 없는 상대에겐 무의미
  if (statusId === 'seal' && (knownStrategies(foe).length === 0 || foe.mp <= 0)) return 0
  // 부동: 붙어야 때리는 근접 병과에게만 치명적 (원거리는 제자리에서 계속 쏜다)
  if (statusId === 'immobile' && classOf(foe).ranged) return 0
  return STATUS_VALUE[statusId] ?? BUFF_VALUE
}

/** 지원 책략의 중심 좌표 — 자기 자신이 대상이면 이동 후 위치, 아니면 아군 위치 */
const supportTargetOf = (unit: UnitState, cell: Vec2, ally: UnitState): Vec2 =>
  ally.id === unit.id ? cell : ally.pos

/**
 * cell에서 target(적)을 중심으로 공격/방해 책략을 쓸 때의 기대 점수 (가장 좋은 책략 선택).
 * 범위 책략은 중심 칸 주변까지 훑어 기대 데미지를 **합산**한다 — 밀집한 적을 노리게 하는 핵심.
 * 후보 중심은 적 유닛 위치로 한정한다 (빈 칸까지 열면 탐색이 폭발한다).
 */
function scoreStrategy(
  state: BattleState,
  unit: UnitState,
  cell: Vec2,
  target: UnitState,
): { score: number; strategyId: string } | null {
  if (!canCast(unit)) return null // 혼란·금책
  const uStats = effectiveStats(unit)
  let best: { score: number; strategyId: string } | null = null

  for (const strategy of knownStrategies(unit)) {
    if (strategy.kind !== 'damage' && strategy.kind !== 'debuff' && strategy.kind !== 'status') continue
    if (unit.mp < strategy.mpCost) continue
    if (strategy.element === 'fire' && state.weather === 'rain') continue
    if (manhattan(cell, target.pos) > strategy.range) continue

    // 범위 안의 적만 계산 (오사 없음 — 리듀서의 per-cell 진영 필터와 같은 규칙)
    const affected = unitsInArea(state, strategy.area, target.pos).filter((u) => isHostile(unit, u))
    if (affected.length === 0) continue

    let value = 0
    for (const foe of affected) {
      const fStats = effectiveStats(foe)
      // 혼란 대상 확정 피격까지 반영된 실효 명중률 (리듀서와 같은 헬퍼)
      const hit = strategyRateAgainst(uStats, foe, strategy.capHitRate) / 100
      if (strategy.kind === 'damage') {
        const dmg = strategyDamage(uStats.mind, fStats.mind, unit.level, strategy.power!)
        value += dmg * hit
        if (dmg * hit >= foe.hp) value += KILL_BONUS
      } else if (strategy.kind === 'status') {
        // 방해계는 상태 가치 + (독연·포박처럼 위력이 있으면) 기대 데미지.
        // 데미지와 상태는 독립 판정이라 기대값도 각각 곱해서 더한다.
        value += statusValueAgainst(foe, strategy.inflicts!) * hit
        if (strategy.power !== undefined) {
          const dmg = strategyDamage(uStats.mind, fStats.mind, unit.level, strategy.power)
          value += dmg * hit
          if (dmg * hit >= foe.hp) value += KILL_BONUS
        }
      } else if (!hasBuffOn(foe, strategy.buff!.stat)) {
        value += BUFF_VALUE * hit
      }
    }
    if (value <= 0) continue

    const score = value - strategy.mpCost * 0.5
    if (!best || score > best.score) best = { score, strategyId: strategy.id }
  }
  return best
}

/**
 * cell에서 ally(아군/우군)를 중심으로 회복·강화 책략을 쓸 때의 기대 점수.
 * 회복은 실제 회복될 HP의 합, 버프는 대상 수 × 고정 가치로 본다 —
 * 공격 기대값과 같은 저울에 올려두고 더 좋은 쪽을 고르게 한다.
 *
 * 자기 자신을 노리는 경우 중심은 **이동 후 위치(cell)** 다 — state의 pos는 아직 이동 전이라
 * 범위 계산에서 자기 자신만 따로 얹는다 (supportTargetOf가 리듀서에 넘길 좌표와 같은 규칙).
 */
function scoreSupportStrategy(
  state: BattleState,
  unit: UnitState,
  cell: Vec2,
  ally: UnitState,
): { score: number; strategyId: string } | null {
  if (!canCast(unit)) return null // 혼란·금책
  let best: { score: number; strategyId: string } | null = null
  const center = supportTargetOf(unit, cell, ally)
  const hostiles = livingUnits(state).filter((u) => isHostile(unit, u))
  /** 버프 판정용 위치 — 자기 자신은 이동 후 위치로 본다 */
  const posOf = (u: UnitState): Vec2 => (u.id === unit.id ? cell : u.pos)

  for (const strategy of knownStrategies(unit)) {
    if (strategy.kind !== 'heal' && strategy.kind !== 'buff') continue
    if (strategy.targets === 'enemy') continue
    if (strategy.targets === 'self' && ally.id !== unit.id) continue
    if (unit.mp < strategy.mpCost) continue
    if (manhattan(cell, center) > strategy.range) continue

    const areaCells = strategyAreaCells(strategy.area, center)
    const affected: UnitState[] = []
    // 이동 후 자기 위치가 범위에 들면 자신도 대상 (state의 낡은 pos 대신 cell로 판정)
    if (areaCells.some((c) => c.x === cell.x && c.y === cell.y)) affected.push(unit)
    for (const c of areaCells) {
      const other = unitAt(state, c)
      if (other && other.id !== unit.id && !isHostile(unit, other)) affected.push(other)
    }
    let value = 0

    if (strategy.kind === 'heal') {
      // 중심 대상의 손실이 미미하면 후보에서 뺀다 (힐 스팸 방지)
      if (ally.maxHp - ally.hp < ally.maxHp * HEAL_MIN_LOSS_RATIO) continue
      // 회복량은 리듀서와 같은 원작 공식 (base + 시전자 정신력/mindDiv)
      const amount = strategyHealAmount(strategy.heal!, effectiveStats(unit).mind)
      for (const friend of affected) {
        value += Math.min(amount, friend.maxHp - friend.hp) * HEAL_VALUE
      }
    } else {
      for (const friend of affected) {
        if (hasBuffOn(friend, strategy.buff!.stat)) continue
        // 전투 반경 안에 적이 있는 아군만 강화한다 (후방 대기 부대에 버프 낭비 금지)
        if (!hostiles.some((h) => manhattan(h.pos, posOf(friend)) <= COMBAT_RADIUS)) continue
        value += BUFF_VALUE
      }
    }
    if (value <= 0) continue

    const score = value - strategy.mpCost * 0.5
    if (!best || score > best.score) best = { score, strategyId: strategy.id }
  }
  return best
}

/** 유닛 하나의 행동 계획 결정 */
export function decideUnit(state: BattleState, unit: UnitState): UnitPlan {
  const hostiles = livingUnits(state).filter((u) => isHostile(unit, u))
  // 회복·강화 후보 (자기 자신 포함). 지원 책략이 없는 병과는 이 목록을 쓰지 않는다.
  const friendlies = livingUnits(state).filter((u) => !isHostile(unit, u))
  const cls = classOf(unit)

  // guard: 이동하지 않음. 현재 위치에서 공격 가능할 때만 행동.
  // 부동(immobile)도 같은 취급 — 제자리에서 공격·책략만 검토한다 (리듀서 canMove 게이트와 같은 결론).
  const range = movementRangeOf(state, unit)
  const candidateCells: Vec2[] =
    unit.behavior === 'guard' || hasStatus(unit, 'immobile')
      ? [unit.pos]
      : [...range.values()].filter((c) => c.canStop).map((c) => c.pos)

  let best: UnitPlan | null = null

  for (const cell of candidateCells) {
    for (const target of hostiles) {
      const dist = manhattan(cell, target.pos)

      // 물리 공격
      if (dist >= cls.minRange && dist <= cls.maxRange) {
        const score = scorePhysical(state, unit, cell, target)
        if (!best || score > best.score) {
          best = {
            moveTo: cell === unit.pos ? null : cell,
            act: { type: 'attack', unitId: unit.id, targetId: target.id },
            score,
          }
        }
      }

      // 책략
      const strat = scoreStrategy(state, unit, cell, target)
      if (strat && (!best || strat.score > best.score)) {
        best = {
          moveTo: cell === unit.pos ? null : cell,
          act: { type: 'strategy', unitId: unit.id, strategyId: strat.strategyId, target: target.pos },
          score: strat.score,
        }
      }
    }

    // 지원 책략 (회복/강화) — 아군 위치를 중심으로 채점해 공격 후보와 같은 저울에 올린다
    for (const ally of friendlies) {
      const support = scoreSupportStrategy(state, unit, cell, ally)
      if (support && (!best || support.score > best.score)) {
        best = {
          moveTo: cell === unit.pos ? null : cell,
          act: {
            type: 'strategy',
            unitId: unit.id,
            strategyId: support.strategyId,
            target: supportTargetOf(unit, cell, ally),
          },
          score: support.score,
        }
      }
    }
  }

  if (best) return best

  // 공격 불가: pursue면 최근접 적 방향으로 이동, guard면 대기
  if (unit.behavior !== 'guard' && hostiles.length > 0) {
    let bestCell: Vec2 | null = null
    let bestDist = Infinity
    for (const cell of candidateCells) {
      const nearest = Math.min(...hostiles.map((h) => manhattan(cell, h.pos)))
      if (nearest < bestDist) {
        bestDist = nearest
        bestCell = cell
      }
    }
    if (bestCell && (bestCell.x !== unit.pos.x || bestCell.y !== unit.pos.y)) {
      return { moveTo: bestCell, act: { type: 'wait', unitId: unit.id }, score: 0 }
    }
  }

  return { moveTo: null, act: { type: 'wait', unitId: unit.id }, score: 0 }
}

export interface AiStep {
  state: BattleState
  /** 이번 스텝에 행동한 유닛 (UI 하이라이트용). 없으면 페이즈 종료 스텝 */
  actedUnitId: string | null
  done: boolean
}

/**
 * AI 유닛 1기만 실행하는 스텝 함수 — UI가 유닛 단위로 순차 재생할 수 있게 한다.
 * 미행동 유닛이 없으면 endPhase를 적용하고 done을 반환.
 */
export function stepAiUnit(state: BattleState, faction: Faction): AiStep {
  if (state.phase !== faction || state.result !== 'ongoing') {
    return { state, actedUnitId: null, done: true }
  }

  const unit = livingUnits(state, faction).find((u) => !u.acted)
  if (!unit) {
    return { state: applyAction(state, { type: 'endPhase' }), actedUnitId: null, done: true }
  }

  let current = state
  const plan = decideUnit(current, unit)
  if (plan.moveTo && !unitAt(current, plan.moveTo)) {
    current = applyAction(current, { type: 'move', unitId: unit.id, to: plan.moveTo })
  }
  current = applyAction(current, plan.act)
  // 계획이 거부됐다면(상태 변화로 무효화) 안전하게 대기 처리해 무한 루프 방지
  const after = current.units.find((u) => u.id === unit.id)
  if (current.result === 'ongoing' && after && after.hp > 0 && !after.acted) {
    current = applyAction(current, { type: 'wait', unitId: unit.id })
  }
  return { state: current, actedUnitId: unit.id, done: current.result !== 'ongoing' }
}

/** 해당 진영 전 유닛의 AI 턴 실행 후 페이즈 종료까지 진행 (stepAiUnit 루프) */
export function runAiPhase(state: BattleState, faction: Faction): BattleState {
  let current = state
  for (;;) {
    const step = stepAiUnit(current, faction)
    current = step.state
    if (step.done) return current
  }
}
