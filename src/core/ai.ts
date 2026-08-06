// 적 AI — 유틸리티 스코어링 (docs/research/tech.md §3)
// (도달 가능 칸 × 공격 가능 대상) 조합을 열거해
// 점수 = 기대 데미지 − 기대 반격 데미지 + 킬 보너스 + 지형 보정 으로 채점, 최고점 실행.
// behavior: guard = 현재 위치에서 공격만(이동 추격 안 함), pursue = 최근접 적에게 접근.

import { TERRAIN } from '../data/terrain'
import {
  applyAction,
  classOf,
  effectiveStats,
  isHostile,
  knownStrategies,
  livingUnits,
  movementRangeOf,
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
  strategyHitRate,
} from './formulas'
import { manhattan } from './movement'
import type { BattleAction, BattleState, Faction, UnitState, Vec2 } from './types'

const KILL_BONUS = 40

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
  const hit = hitRate(uStats.agi, tStats.agi) / 100
  const dbl = doubleAttackRate(uStats.agi, tStats.agi) / 100
  const crit = critRateOf(uStats.morale, tStats.morale) / 100
  const expected = dmg * hit * (1 + dbl) * (1 + 0.5 * crit)

  let score = expected
  if (expected >= target.hp) score += KILL_BONUS
  if (target.isLeader) score += 10 // 주인공 우선 압박

  // 반격 리스크 (근접 공격 시)
  const dist = manhattan(cell, target.pos)
  if (!uCls.ranged && dist === 1 && !tCls.ranged && tCls.minRange <= 1) {
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

/** cell에서 target에게 책략을 쓸 때의 기대 점수 (가장 좋은 책략 선택) */
function scoreStrategy(
  state: BattleState,
  unit: UnitState,
  cell: Vec2,
  target: UnitState,
): { score: number; strategyId: string } | null {
  const uStats = effectiveStats(unit)
  const tStats = effectiveStats(target)
  let best: { score: number; strategyId: string } | null = null

  for (const strategy of knownStrategies(unit)) {
    if (strategy.kind !== 'damage') continue
    if (unit.mp < strategy.mpCost) continue
    if (strategy.element === 'fire' && state.weather === 'rain') continue
    if (manhattan(cell, target.pos) > strategy.range) continue

    const dmg = strategyDamage(uStats.mind, tStats.mind, unit.level, strategy.power!)
    const hit =
      strategyHitRate(uStats.mind, uStats.morale, tStats.mind, tStats.morale, strategy.capHitRate) / 100
    let score = dmg * hit - strategy.mpCost * 0.5
    if (dmg * hit >= target.hp) score += KILL_BONUS

    if (!best || score > best.score) best = { score, strategyId: strategy.id }
  }
  return best
}

/** 유닛 하나의 행동 계획 결정 */
export function decideUnit(state: BattleState, unit: UnitState): UnitPlan {
  const hostiles = livingUnits(state).filter((u) => isHostile(unit, u))
  const cls = classOf(unit)

  // guard: 이동하지 않음. 현재 위치에서 공격 가능할 때만 행동.
  const range = movementRangeOf(state, unit)
  const candidateCells: Vec2[] =
    unit.behavior === 'guard'
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
