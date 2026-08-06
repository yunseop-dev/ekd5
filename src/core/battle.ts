// 전투 리듀서: BattleState + BattleAction → BattleState (순수 함수, 원본 불변)
// 공격 해소 순서: 명중 → 회심 → 데미지 → 2회 공격 → 반격 (조조전 사양)

import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { STRATEGIES } from '../data/strategies'
import { TERRAIN } from '../data/terrain'
import type { CombatStats } from './formulas'
import {
  affinityMultiplier,
  applyExp,
  combatStats,
  critRate,
  doubleAttackRate,
  expGain,
  hitRate,
  maxHp,
  maxMp,
  physicalDamage,
  strategyDamage,
  strategyHitRate,
} from './formulas'
import type { MoveContext, MovementRange, Occupancy } from './movement'
import { keyOf, manhattan, movementRange } from './movement'
import { nextInt, roll } from './rng'
import type {
  BattleAction,
  BattleState,
  OfficerDef,
  StageDef,
  StrategyDef,
  UnitClassDef,
  UnitState,
  Vec2,
} from './types'
import { CRIT_MULTIPLIER } from './types'

// ---------- 조회 헬퍼 ----------

export const officerOf = (unit: UnitState): OfficerDef => OFFICERS[unit.officerId]
export const classOf = (unit: UnitState): UnitClassDef => CLASSES[unit.classId]

export function unitAt(state: BattleState, pos: Vec2): UnitState | undefined {
  return state.units.find((u) => u.hp > 0 && u.pos.x === pos.x && u.pos.y === pos.y)
}

export function livingUnits(state: BattleState, faction?: UnitState['faction']): UnitState[] {
  return state.units.filter((u) => u.hp > 0 && (faction === undefined || u.faction === faction))
}

const hostileTo = (a: UnitState['faction']): UnitState['faction'][] =>
  a === 'enemy' ? ['player', 'ally'] : ['enemy']

export const isHostile = (a: UnitState, b: UnitState): boolean => hostileTo(a.faction).includes(b.faction)

/** 버프 반영된 실효 전투 능력치 */
export function effectiveStats(unit: UnitState): CombatStats {
  const base = combatStats(officerOf(unit).stats, classOf(unit).growth, unit.level)
  for (const buff of unit.buffs) {
    base[buff.stat] = Math.max(1, base[buff.stat] + buff.amount)
  }
  return base
}

/** 유닛이 서 있는 지형의 물리 지형효과 % */
export function terrainEffectOf(state: BattleState, unit: UnitState): number {
  const tile = state.map.tiles[unit.pos.y][unit.pos.x]
  return TERRAIN[tile].effect[classOf(unit).moveProfile]
}

/** 현재 레벨에서 사용 가능한 책략 목록 */
export function knownStrategies(unit: UnitState): StrategyDef[] {
  return classOf(unit)
    .strategies.filter((s) => s.learnLevel <= unit.level)
    .map((s) => STRATEGIES[s.strategyId])
}

/** 이동범위 계산용 컨텍스트 (적 = 차단, 아군·우군 = 통과만) */
export function moveContextFor(state: BattleState, unit: UnitState): MoveContext {
  const profile = classOf(unit).moveProfile
  return {
    width: state.map.width,
    height: state.map.height,
    costAt: (pos) => TERRAIN[state.map.tiles[pos.y][pos.x]].cost[profile],
    occupancyAt: (pos): Occupancy => {
      const other = unitAt(state, pos)
      if (!other || other.id === unit.id) return 'free'
      return isHostile(unit, other) ? 'block' : 'pass'
    },
    movePoints: classOf(unit).move,
  }
}

export function movementRangeOf(state: BattleState, unit: UnitState): MovementRange {
  return movementRange(unit.pos, moveContextFor(state, unit))
}

// ---------- 전투 예측 (UI 예측 패널 + AI 공용) ----------

export interface AttackForecast {
  damage: number // 랜덤 가산 제외 기대 데미지
  hitRate: number
  critRate: number
  doubleRate: number
  willCounter: boolean
  counterDamage: number
  counterHitRate: number
}

export function forecastAttack(state: BattleState, attacker: UnitState, defender: UnitState): AttackForecast {
  const aStats = effectiveStats(attacker)
  const dStats = effectiveStats(defender)
  const aCls = classOf(attacker)
  const dCls = classOf(defender)
  const dist = manhattan(attacker.pos, defender.pos)

  const damage = physicalDamage({
    atk: aStats.atk,
    def: dStats.def,
    atkTerrainEffect: terrainEffectOf(state, attacker),
    defTerrainEffect: terrainEffectOf(state, defender),
    attackerLevel: attacker.level,
    multipliers: [affinityMultiplier(aCls, dCls)],
  })

  // 반격: 직접(근접) 공격에만, 반격측 사거리에 거리 1이 포함될 때, 항상 1회
  const willCounter = !aCls.ranged && dist === 1 && !dCls.ranged && dCls.minRange <= 1

  return {
    damage,
    hitRate: hitRate(aStats.agi, dStats.agi),
    critRate: critRate(aStats.morale, dStats.morale),
    doubleRate: doubleAttackRate(aStats.agi, dStats.agi),
    willCounter,
    counterDamage: willCounter
      ? physicalDamage({
          atk: dStats.atk,
          def: aStats.def,
          atkTerrainEffect: terrainEffectOf(state, defender),
          defTerrainEffect: terrainEffectOf(state, attacker),
          attackerLevel: defender.level,
          multipliers: [affinityMultiplier(dCls, aCls)],
        })
      : 0,
    counterHitRate: willCounter ? hitRate(dStats.agi, aStats.agi) : 0,
  }
}

// ---------- 전투 생성 ----------

export function createBattle(stage: StageDef, seed: number): BattleState {
  const units: UnitState[] = stage.units.map((def, i) => {
    const officer = OFFICERS[def.officerId]
    const cls = CLASSES[officer.classId]
    const level = def.level ?? officer.level
    return {
      id: `u${i}_${def.officerId}`,
      officerId: def.officerId,
      classId: officer.classId,
      faction: def.faction,
      pos: { ...def.pos },
      level,
      exp: 0,
      hp: maxHp(cls, level),
      maxHp: maxHp(cls, level),
      mp: maxMp(cls, level),
      maxMp: maxMp(cls, level),
      moved: false,
      acted: false,
      statuses: [],
      buffs: [],
      isLeader: def.isLeader,
      isBoss: def.isBoss,
      behavior: def.behavior,
    }
  })

  return {
    stageId: stage.id,
    map: stage.map,
    units,
    turn: 1,
    phase: 'player',
    weather: stage.weather,
    rngState: seed,
    result: 'ongoing',
    log: [{ type: 'battleStart', message: `${stage.name} — 전투 개시` }],
    spawnedReinforcements: [],
  }
}

// ---------- 내부 유틸 ----------

function log(state: BattleState, type: string, message: string): void {
  state.log.push({ type, message })
}

const nameOf = (unit: UnitState): string => officerOf(unit).name

/** 경험치 부여 + 레벨업 처리 (state를 직접 수정) */
function grantExp(state: BattleState, unit: UnitState, targetLevel: number, defeated: boolean): void {
  if (unit.faction !== 'player') return // 적/우군은 성장하지 않음
  const gained = expGain(unit.level, targetLevel, defeated)
  const progress = applyExp(unit.level, unit.exp, gained)
  unit.exp = progress.exp
  if (progress.levelsGained > 0) {
    const cls = classOf(unit)
    const newMaxHp = maxHp(cls, progress.level)
    const newMaxMp = maxMp(cls, progress.level)
    unit.hp += newMaxHp - unit.maxHp
    unit.mp += newMaxMp - unit.maxMp
    unit.maxHp = newMaxHp
    unit.maxMp = newMaxMp
    unit.level = progress.level
    log(state, 'levelUp', `${nameOf(unit)} 레벨 ${progress.level} 달성!`)
  }
}

function dealDamage(state: BattleState, target: UnitState, amount: number): void {
  target.hp = Math.max(0, target.hp - amount)
  if (target.hp === 0) {
    log(state, 'defeat', `${nameOf(target)} 부대 괴멸!`)
    triggerReinforcements(state, { type: 'unitDefeated', unitId: target.id })
  }
}

/** 한 번의 타격 해소 (명중 → 회심 → 데미지). 명중 여부 반환 */
function resolveStrike(state: BattleState, attacker: UnitState, defender: UnitState): boolean {
  const aStats = effectiveStats(attacker)
  const dStats = effectiveStats(defender)

  const hitRoll = roll(state.rngState, hitRate(aStats.agi, dStats.agi))
  state.rngState = hitRoll.nextState
  if (!hitRoll.value) {
    log(state, 'miss', `${nameOf(attacker)}의 공격이 빗나갔다!`)
    return false
  }

  const critRoll = roll(state.rngState, critRate(aStats.morale, dStats.morale))
  state.rngState = critRoll.nextState

  const bonus = nextInt(state.rngState, 0, 7)
  state.rngState = bonus.nextState

  const multipliers = [affinityMultiplier(classOf(attacker), classOf(defender))]
  if (critRoll.value) multipliers.push(CRIT_MULTIPLIER)

  const dmg = physicalDamage({
    atk: aStats.atk,
    def: dStats.def,
    atkTerrainEffect: terrainEffectOf(state, attacker),
    defTerrainEffect: terrainEffectOf(state, defender),
    attackerLevel: attacker.level,
    multipliers,
    randomBonus: bonus.value,
  })

  log(
    state,
    critRoll.value ? 'crit' : 'hit',
    `${nameOf(attacker)} → ${nameOf(defender)}: ${dmg} 데미지${critRoll.value ? ' (회심의 일격!)' : ''}`,
  )
  dealDamage(state, defender, dmg)
  grantExp(state, attacker, defender.level, defender.hp === 0)
  return true
}

// ---------- 승패 판정 ----------

function checkVictory(state: BattleState, stage: StageDef): void {
  if (state.result !== 'ongoing') return

  // 패배: 주인공 격파
  const leader = state.units.find((u) => u.faction === 'player' && u.isLeader)
  if (leader && leader.hp <= 0) {
    state.result = 'defeat'
    log(state, 'defeat', '주인공 부대 괴멸 — 패배...')
    return
  }

  for (let i = 0; i < stage.victory.length; i++) {
    const cond = stage.victory[i]
    let met = false
    switch (cond.type) {
      case 'annihilation':
        met = livingUnits(state, 'enemy').length === 0
        break
      case 'defeatBoss':
        met = !state.units.some((u) => u.faction === 'enemy' && u.isBoss && u.hp > 0)
        break
      case 'reachPoint': {
        const unit = cond.unitId
          ? state.units.find((u) => u.id === cond.unitId || u.officerId === cond.unitId)
          : state.units.find((u) => u.faction === 'player' && u.isLeader)
        met = !!unit && unit.hp > 0 && unit.pos.x === cond.pos.x && unit.pos.y === cond.pos.y
        break
      }
      case 'surviveTurns':
        met = state.turn > cond.turns
        break
    }
    if (met) {
      state.result = 'victory'
      log(state, 'victory', '승리!')
      // 2차 승리조건 보너스 (시리즈 전통: 생존 전원 +50)
      if (i > 0 && stage.bonusExp) {
        for (const u of livingUnits(state, 'player')) {
          const progress = applyExp(u.level, u.exp, stage.bonusExp)
          u.level = progress.level
          u.exp = progress.exp
        }
        log(state, 'bonus', `2차 승리조건 달성 — 생존 전원 경험치 +${stage.bonusExp}`)
      }
      return
    }
  }
}

// ---------- 증원 ----------

function triggerReinforcements(
  state: BattleState,
  event: { type: 'turnStart'; turn: number } | { type: 'unitDefeated'; unitId: string },
): void {
  const stage = state.__stage
  if (!stage) return
  stage.reinforcements.forEach((r, idx) => {
    if (state.spawnedReinforcements.includes(idx)) return
    const t = r.trigger
    const matched =
      (t.type === 'turnStart' && event.type === 'turnStart' && t.turn === event.turn) ||
      (t.type === 'unitDefeated' && event.type === 'unitDefeated' && t.unitId === event.unitId)
    if (!matched) return

    state.spawnedReinforcements.push(idx)
    r.units.forEach((def, j) => {
      if (unitAt(state, def.pos)) return // 자리가 막혀 있으면 등장 취소 (단순화)
      const officer = OFFICERS[def.officerId]
      const cls = CLASSES[officer.classId]
      const level = def.level ?? officer.level
      state.units.push({
        id: `r${idx}_${j}_${def.officerId}`,
        officerId: def.officerId,
        classId: officer.classId,
        faction: def.faction,
        pos: { ...def.pos },
        level,
        exp: 0,
        hp: maxHp(cls, level),
        maxHp: maxHp(cls, level),
        mp: maxMp(cls, level),
        maxMp: maxMp(cls, level),
        moved: false,
        acted: false,
        statuses: [],
        buffs: [],
        isLeader: def.isLeader,
        isBoss: def.isBoss,
        behavior: def.behavior,
      })
    })
    log(state, 'reinforcement', '적 증원 부대 등장!')
  })
}

// ---------- 메인 리듀서 ----------

// 증원/승패 조건 평가를 위해 스테이지 정의를 상태에 부착 (직렬화 시 제외 가능)
declare module './types' {
  interface BattleState {
    __stage?: StageDef
  }
}

export function attachStage(state: BattleState, stage: StageDef): BattleState {
  state.__stage = stage
  return state
}

export function startBattle(stage: StageDef, seed: number): BattleState {
  return attachStage(createBattle(stage, seed), stage)
}

export function applyAction(prev: BattleState, action: BattleAction): BattleState {
  if (prev.result !== 'ongoing') return prev
  const stage = prev.__stage
  const state: BattleState = structuredClone({ ...prev, __stage: undefined })
  state.__stage = stage

  switch (action.type) {
    case 'move': {
      const unit = state.units.find((u) => u.id === action.unitId)
      if (!unit || unit.hp <= 0 || unit.faction !== state.phase || unit.moved || unit.acted) return prev
      const range = movementRangeOf(state, unit)
      const cell = range.get(keyOf(action.to))
      if (!cell || !cell.canStop) return prev
      unit.pos = { ...action.to }
      unit.moved = true
      break
    }

    case 'attack': {
      const attacker = state.units.find((u) => u.id === action.unitId)
      const defender = state.units.find((u) => u.id === action.targetId)
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) return prev
      if (attacker.faction !== state.phase || attacker.acted) return prev
      if (!isHostile(attacker, defender)) return prev

      const aCls = classOf(attacker)
      const dist = manhattan(attacker.pos, defender.pos)
      if (dist < aCls.minRange || dist > aCls.maxRange) return prev

      // 1타
      resolveStrike(state, attacker, defender)

      // 2회 공격 판정
      if (defender.hp > 0) {
        const aStats = effectiveStats(attacker)
        const dStats = effectiveStats(defender)
        const dbl = roll(state.rngState, doubleAttackRate(aStats.agi, dStats.agi))
        state.rngState = dbl.nextState
        if (dbl.value) {
          log(state, 'double', `${nameOf(attacker)}의 2회 공격!`)
          resolveStrike(state, attacker, defender)
        }
      }

      // 반격 (직접 공격에만, 항상 1회)
      const forecast = forecastAttack(state, attacker, defender)
      if (defender.hp > 0 && forecast.willCounter) {
        log(state, 'counter', `${nameOf(defender)}의 반격!`)
        resolveStrike(state, defender, attacker)
      }

      attacker.acted = true
      attacker.moved = true
      break
    }

    case 'strategy': {
      const caster = state.units.find((u) => u.id === action.unitId)
      if (!caster || caster.hp <= 0 || caster.faction !== state.phase || caster.acted) return prev

      const strategy = knownStrategies(caster).find((s) => s.id === action.strategyId)
      if (!strategy || caster.mp < strategy.mpCost) return prev
      if (manhattan(caster.pos, action.target) > strategy.range) return prev
      // 화계는 우천 시 사용 불가
      if (strategy.element === 'fire' && state.weather === 'rain') return prev

      const targetCells: Vec2[] =
        strategy.area === 'cross'
          ? [
              action.target,
              { x: action.target.x, y: action.target.y - 1 },
              { x: action.target.x, y: action.target.y + 1 },
              { x: action.target.x - 1, y: action.target.y },
              { x: action.target.x + 1, y: action.target.y },
            ]
          : [action.target]

      const primaryTarget = unitAt(state, action.target)
      if (!primaryTarget) return prev
      const validTarget =
        strategy.targets === 'enemy' ? isHostile(caster, primaryTarget) : !isHostile(caster, primaryTarget)
      if (!validTarget) return prev

      caster.mp -= strategy.mpCost
      const cStats = effectiveStats(caster)

      for (const cell of targetCells) {
        const target = unitAt(state, cell)
        if (!target) continue

        if (strategy.kind === 'damage' || strategy.kind === 'debuff') {
          if (!isHostile(caster, target)) continue
          const tStats = effectiveStats(target)
          const hit = roll(
            state.rngState,
            strategyHitRate(cStats.mind, cStats.morale, tStats.mind, tStats.morale, strategy.capHitRate),
          )
          state.rngState = hit.nextState
          if (!hit.value) {
            log(state, 'miss', `${strategy.name}이(가) ${nameOf(target)}에게 통하지 않았다!`)
            continue
          }
          if (strategy.kind === 'damage') {
            const bonus = nextInt(state.rngState, 0, 7)
            state.rngState = bonus.nextState
            const dmg = strategyDamage(cStats.mind, tStats.mind, caster.level, strategy.power!, bonus.value)
            log(state, 'strategy', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${dmg} 데미지`)
            dealDamage(state, target, dmg)
            grantExp(state, caster, target.level, target.hp === 0)
          } else {
            target.buffs.push({ ...strategy.buff!, remainingTurns: strategy.buff!.duration })
            log(state, 'debuff', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}`)
            grantExp(state, caster, target.level, false)
          }
        } else if (strategy.kind === 'heal') {
          if (isHostile(caster, target)) continue
          const healed = Math.min(strategy.healAmount!, target.maxHp - target.hp)
          target.hp += healed
          log(state, 'heal', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${healed} 회복`)
          grantExp(state, caster, target.level, false)
        } else {
          if (isHostile(caster, target)) continue
          target.buffs.push({ ...strategy.buff!, remainingTurns: strategy.buff!.duration })
          log(state, 'buff', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}`)
          grantExp(state, caster, target.level, false)
        }
      }

      caster.acted = true
      caster.moved = true
      break
    }

    case 'wait': {
      const unit = state.units.find((u) => u.id === action.unitId)
      if (!unit || unit.hp <= 0 || unit.faction !== state.phase || unit.acted) return prev
      unit.acted = true
      unit.moved = true
      break
    }

    case 'endPhase': {
      if (state.phase === 'player') {
        state.phase = livingUnits(state, 'ally').length > 0 ? 'ally' : 'enemy'
      } else if (state.phase === 'ally') {
        state.phase = 'enemy'
      } else {
        // 적 페이즈 종료 → 턴 증가, 아군 페이즈
        state.turn += 1
        state.phase = 'player'
        triggerReinforcements(state, { type: 'turnStart', turn: state.turn })
      }

      // 새 페이즈 진영: 행동 초기화 + 버프 턴 감소 + 지형 회복
      for (const unit of livingUnits(state, state.phase)) {
        unit.moved = false
        unit.acted = false
        unit.buffs = unit.buffs
          .map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 }))
          .filter((b) => b.remainingTurns > 0)

        const tile = TERRAIN[state.map.tiles[unit.pos.y][unit.pos.x]]
        if (tile.healPerTurn && unit.hp < unit.maxHp) {
          const healed = Math.min(Math.trunc((unit.maxHp * tile.healPerTurn) / 100), unit.maxHp - unit.hp)
          unit.hp += healed
          log(state, 'terrainHeal', `${nameOf(unit)} — ${tile.name}에서 ${healed} 회복`)
        }
      }
      break
    }
  }

  if (stage) checkVictory(state, stage)
  return state
}
