// 전투 리듀서: BattleState + BattleAction → BattleState (순수 함수, 원본 불변)
// 공격 해소 순서: 명중 → 회심 → 데미지 → 2회 공격 → 반격 (조조전 사양)

import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STRATEGIES } from '../data/strategies'
import { TERRAIN } from '../data/terrain'
import type { RosterEntry } from './campaign'
import { canPromoteUnit, classIdOf, consumableCount, removeConsumable, toEquipmentMap } from './campaign'
import type { CombatStats } from './formulas'
import {
  affinityMultiplier,
  applyExp,
  combatStats,
  COUNTER_DAMAGE_SCALE,
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
import { keyOf, manhattan, movementRange, strategyAreaCells } from './movement'
import { nextInt, roll } from './rng'
import type {
  BattleAction,
  BattleState,
  ConsumableStack,
  EquipInstance,
  EquipmentDef,
  EquipSlot,
  OfficerDef,
  OfficerStats,
  StageDef,
  StageUnitDef,
  StrategyDef,
  UnitClassDef,
  UnitState,
  Vec2,
} from './types'
import {
  CRIT_MULTIPLIER,
  EQUIP_EXP_ARMOR_HIT,
  EQUIP_EXP_WEAPON_HIT,
  EQUIP_EXP_WEAPON_MISS,
  EQUIP_EXP_PER_LEVEL,
  EQUIP_GROWTH_NORMAL,
  EQUIP_GROWTH_TREASURE,
  EQUIP_MAX_LEVEL_NORMAL,
  EQUIP_MAX_LEVEL_TREASURE,
} from './types'

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

/** 장착 중인 장비 인스턴스 목록 (미등록 id 포함 — 정의 조회는 호출부에서) */
export function equippedInstances(unit: UnitState): EquipInstance[] {
  return Object.values(unit.equipment ?? {}).filter((i): i is EquipInstance => i !== undefined)
}

/**
 * 장착 중인 장비 정의 목록.
 * 알 수 없는 id는 조용히 무시한다 — 구버전 세이브 승계/데이터 개편 내성 (equipment 자체가 없어도 안전).
 */
export function equippedItems(unit: UnitState): EquipmentDef[] {
  return equippedInstances(unit)
    .map((i) => EQUIPMENT[i.itemId])
    .filter((e): e is EquipmentDef => e !== undefined)
}

/** 장비 종류별 최대 레벨 (일반 Lv3 / 보물 Lv9 — 원작 확정) */
export function equipMaxLevel(def: EquipmentDef): number {
  return def.isTreasure ? EQUIP_MAX_LEVEL_TREASURE : EQUIP_MAX_LEVEL_NORMAL
}

/** 레벨당 성장량 (일반 +10 / 보물 +9 — 원작 확정) */
export function equipGrowthPerLevel(def: EquipmentDef): number {
  return def.isTreasure ? EQUIP_GROWTH_TREASURE : EQUIP_GROWTH_NORMAL
}

/**
 * 인스턴스 1점의 실효 보정치 = def.bonus + growthStat에 (level-1) × 성장량 (무구성장).
 * 미등록 id는 빈 보정치. level은 최대 레벨로 잘라서 계산한다(망가진 세이브 내성).
 */
export function equipInstanceBonus(instance: EquipInstance): EquipmentDef['bonus'] {
  const def = EQUIPMENT[instance.itemId]
  if (!def) return {}
  const bonus: EquipmentDef['bonus'] = { ...def.bonus }
  if (def.growthStat) {
    const level = Math.min(Math.max(1, instance.level), equipMaxLevel(def))
    const grown = (level - 1) * equipGrowthPerLevel(def)
    if (grown > 0) bonus[def.growthStat] = (bonus[def.growthStat] ?? 0) + grown
  }
  return bonus
}

/** 열매 보정을 얹은 장수 능력치 */
function boostedStats(unit: UnitState): OfficerStats {
  const base = officerOf(unit).stats
  const bonus = unit.statBonus
  if (!bonus) return base
  return {
    str: base.str + (bonus.str ?? 0),
    ldr: base.ldr + (bonus.ldr ?? 0),
    int: base.int + (bonus.int ?? 0),
    agi: base.agi + (bonus.agi ?? 0),
    luck: base.luck + (bonus.luck ?? 0),
  }
}

/** 장비(무구성장 포함) + 열매 + 버프 반영된 실효 전투 능력치 (열매 → 장비 가산 → 버프 순서) */
export function effectiveStats(unit: UnitState): CombatStats {
  const base = combatStats(boostedStats(unit), classOf(unit).growth, unit.level)
  for (const instance of equippedInstances(unit)) {
    for (const [stat, amount] of Object.entries(equipInstanceBonus(instance))) {
      base[stat as keyof CombatStats] += amount
    }
  }
  for (const buff of unit.buffs) {
    base[buff.stat] = Math.max(1, base[buff.stat] + buff.amount)
  }
  return base
}

/** 실효 이동력 = 병과 이동력 + 장비 moveBonus (준마/적로). 최소 1 */
export function moveOf(unit: UnitState): number {
  const bonus = equippedItems(unit).reduce((sum, item) => sum + (item.moveBonus ?? 0), 0)
  return Math.max(1, classOf(unit).move + bonus)
}

/** 획득 경험치 배율 (맹덕신서 1.5) — 여러 개면 곱연산 */
export function expMultiplierOf(unit: UnitState): number {
  return equippedItems(unit).reduce((mult, item) => mult * (item.expMultiplier ?? 1), 1)
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
  // 적로(원작 확정): 진입 가능한 모든 지형의 소비 이동력을 1로
  const flatCost = equippedItems(unit).some((item) => item.allTerrainCost1)
  return {
    width: state.map.width,
    height: state.map.height,
    costAt: (pos) => {
      const cost = TERRAIN[state.map.tiles[pos.y][pos.x]].cost[profile]
      return flatCost && cost !== null ? 1 : cost
    },
    occupancyAt: (pos): Occupancy => {
      const other = unitAt(state, pos)
      if (!other || other.id === unit.id) return 'free'
      return isHostile(unit, other) ? 'block' : 'pass'
    },
    movePoints: moveOf(unit),
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
          multipliers: [affinityMultiplier(dCls, aCls), COUNTER_DAMAGE_SCALE],
        })
      : 0,
    counterHitRate: willCounter ? hitRate(dStats.agi, aStats.agi) : 0,
  }
}

// ---------- 전투 생성 ----------

/**
 * 출진 명단 → 아군 유닛 정의. 원작은 "선택 순서 = 맵 배치 위치"라서
 * deployment[i]가 stage.playerSlots[i]에 서고, 슬롯보다 많이 고른 초과분은 버린다
 * (docs/research/campaign-ux.md 1부 §2). 슬롯 테이블이 없는 스테이지는 이 경로를 쓰지 않는다.
 */
function deployedPlayerUnits(stage: StageDef, deployment: string[]): StageUnitDef[] {
  const slots = stage.playerSlots ?? []
  return deployment.slice(0, slots.length).map((officerId, i) => ({
    officerId,
    faction: 'player' as const,
    pos: slots[i],
    isLeader: officerId === 'caocao', // 주인공은 조조 고정 (퇴각 = 게임오버)
  }))
}

export function createBattle(
  stage: StageDef,
  seed: number,
  roster?: RosterEntry[],
  deployment?: string[],
  consumables?: ConsumableStack[],
): BattleState {
  // 출진 명단이 오면 stage.units의 player 정의는 무시하고 슬롯 배치로 대체한다.
  // 적/우군은 언제나 stage.units에서 생성.
  const defs: StageUnitDef[] =
    deployment && stage.playerSlots
      ? [...deployedPlayerUnits(stage, deployment), ...stage.units.filter((u) => u.faction !== 'player')]
      : stage.units

  const units: UnitState[] = defs.map((def, i) => {
    const officer = OFFICERS[def.officerId]
    // 캠페인 로스터가 있으면 스테이지/장수 기본 레벨을 덮어쓴다 (전투 간 성장 이월)
    const entry = def.faction === 'player' ? roster?.find((r) => r.officerId === def.officerId) : undefined
    // 승급한 아군은 로스터의 병과 오버라이드를 쓴다. 적/우군은 언제나 장수 기본 병과.
    const classId = entry ? classIdOf(entry) : officer.classId
    const cls = CLASSES[classId]
    const level = entry?.level ?? def.level ?? officer.level
    return {
      id: `u${i}_${def.officerId}`,
      officerId: def.officerId,
      classId,
      faction: def.faction,
      pos: { ...def.pos },
      level,
      exp: entry?.exp ?? 0,
      hp: maxHp(cls, level),
      maxHp: maxHp(cls, level),
      mp: maxMp(cls, level),
      maxMp: maxMp(cls, level),
      moved: false,
      acted: false,
      statuses: [],
      buffs: [],
      // 아군은 캠페인 로스터 우선, 적/우군·자유 전투는 스테이지 정의(적장 장비 — 원작: 격파 드랍과 연결).
      // 정의 표기(문자열 id)든 인스턴스든 여기서 전부 인스턴스로 정규화된다.
      equipment: toEquipmentMap(entry?.equipment ?? def.equipment ?? officer.initialEquipment),
      statBonus: { ...(entry?.statBonus ?? {}) },
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
    // 캠페인 스톡의 전투 로컬 사본 — 자유 전투처럼 스톡이 없으면 빈 목록 (도구 메뉴 숨김)
    consumables: consumables?.map((s) => ({ ...s })) ?? [],
  }
}

// ---------- 내부 유틸 ----------

function log(
  state: BattleState,
  type: string,
  message: string,
  detail?: { targetId?: string; amount?: number },
): void {
  state.log.push({ type, message, ...detail })
}

const nameOf = (unit: UnitState): string => officerOf(unit).name

/** 경험치 부여 + 레벨업 처리 (state를 직접 수정) */
function grantExp(state: BattleState, unit: UnitState, targetLevel: number, defeated: boolean): void {
  if (unit.faction !== 'player') return // 적/우군은 성장하지 않음
  // 맹덕신서류 경험치 증폭은 획득 시점에 곱한다 (레벨업 판정 전, 최소 1)
  const gained = Math.max(1, Math.trunc(expGain(unit.level, targetLevel, defeated) * expMultiplierOf(unit)))
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

/** 한글 주격 조사 — 받침 있으면 '이', 없으면 '가' (로그 문장용) */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '이(가)'
  return (code - 0xac00) % 28 === 0 ? '가' : '이'
}

/**
 * 무구성장 — 타격 1회당 장비 경험치를 얹고 레벨업을 처리한다 (state 직접 수정).
 * 무기는 공격이 명중했을 때, 방어구는 피격당했을 때 성장한다(원작: 빗나가면 거의 못 얻는다).
 * 최대 레벨(일반 3/보물 9)에 닿으면 경험치는 더 쌓이지 않는다.
 */
function growEquipment(state: BattleState, unit: UnitState, slot: EquipSlot, amount: number): void {
  if (amount <= 0) return
  const instance = unit.equipment?.[slot]
  if (!instance) return
  const def = EQUIPMENT[instance.itemId]
  if (!def?.growthStat) return // 성장하지 않는 장비(보조구)와 미등록 id는 대상 아님
  const max = equipMaxLevel(def)
  if (instance.level >= max) return

  instance.exp += amount
  while (instance.exp >= EQUIP_EXP_PER_LEVEL && instance.level < max) {
    instance.exp -= EQUIP_EXP_PER_LEVEL
    instance.level += 1
    log(
      state,
      'equipLevelUp',
      `${nameOf(unit)}의 ${def.name}${subjectParticle(def.name)} Lv${instance.level}가 되었다!`,
    )
  }
  if (instance.level >= max) instance.exp = 0 // 만렙 도달 시 경험치 고정 (applyExp와 같은 처리)
}

function dealDamage(state: BattleState, target: UnitState, amount: number): void {
  target.hp = Math.max(0, target.hp - amount)
  if (target.hp === 0) {
    log(state, 'defeat', `${nameOf(target)} 부대 괴멸!`)
    triggerReinforcements(state, { type: 'unitDefeated', unitId: target.id })
  }
}

/** 한 번의 타격 해소 (명중 → 회심 → 데미지). 명중 여부 반환. damageScale: 반격 시 0.8 */
function resolveStrike(
  state: BattleState,
  attacker: UnitState,
  defender: UnitState,
  damageScale = 1,
): boolean {
  const aStats = effectiveStats(attacker)
  const dStats = effectiveStats(defender)

  const hitRoll = roll(state.rngState, hitRate(aStats.agi, dStats.agi))
  state.rngState = hitRoll.nextState
  if (!hitRoll.value) {
    log(state, 'miss', `${nameOf(attacker)}의 공격이 빗나갔다!`, { targetId: defender.id, amount: 0 })
    // 미스: 무기는 소량 획득, 회피한 쪽 방어구는 0 (원작 확정 — equipment.md 증보)
    growEquipment(state, attacker, 'weapon', EQUIP_EXP_WEAPON_MISS)
    return false
  }

  const critRoll = roll(state.rngState, critRate(aStats.morale, dStats.morale))
  state.rngState = critRoll.nextState

  const bonus = nextInt(state.rngState, 0, 7)
  state.rngState = bonus.nextState

  const multipliers = [affinityMultiplier(classOf(attacker), classOf(defender))]
  if (critRoll.value) multipliers.push(CRIT_MULTIPLIER)
  if (damageScale !== 1) multipliers.push(damageScale)

  const dmg = physicalDamage({
    atk: aStats.atk,
    def: dStats.def,
    atkTerrainEffect: terrainEffectOf(state, attacker),
    defTerrainEffect: terrainEffectOf(state, defender),
    attackerLevel: attacker.level,
    multipliers,
    randomBonus: bonus.value,
  })

  const isCounter = damageScale !== 1
  const eventType = isCounter ? (critRoll.value ? 'counterCrit' : 'counterHit') : critRoll.value ? 'crit' : 'hit'
  log(
    state,
    eventType,
    `${nameOf(attacker)} → ${nameOf(defender)}: ${dmg} 데미지${critRoll.value ? ' (회심의 일격!)' : ''}`,
    { targetId: defender.id, amount: -dmg },
  )
  dealDamage(state, defender, dmg)
  grantExp(state, attacker, defender.level, defender.hp === 0)
  // 무구성장은 데미지 확정 후 — 이번 타격의 데미지는 성장 전 보정치로 계산된다.
  // 획득량은 상대 레벨 비교로 등급 (원작 확정 비율, equipment.md 증보)
  growEquipment(
    state,
    attacker,
    'weapon',
    defender.level >= attacker.level ? EQUIP_EXP_WEAPON_HIT.higher : EQUIP_EXP_WEAPON_HIT.lower,
  )
  growEquipment(
    state,
    defender,
    'armor',
    attacker.level >= defender.level ? EQUIP_EXP_ARMOR_HIT.higher : EQUIP_EXP_ARMOR_HIT.lower,
  )
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

  const met = stage.victory.map((cond) => {
    switch (cond.type) {
      case 'annihilation':
        return livingUnits(state, 'enemy').length === 0
      case 'defeatBoss':
        return !state.units.some((u) => u.faction === 'enemy' && u.isBoss && u.hp > 0)
      case 'reachPoint': {
        const unit = cond.unitId
          ? state.units.find((u) => u.id === cond.unitId || u.officerId === cond.unitId)
          : state.units.find((u) => u.faction === 'player' && u.isLeader)
        return !!unit && unit.hp > 0 && unit.pos.x === cond.pos.x && unit.pos.y === cond.pos.y
      }
      case 'surviveTurns':
        return state.turn > cond.turns
    }
  })

  if (met.some(Boolean)) {
    state.result = 'victory'
    log(state, 'victory', '승리!')
    // 2차 승리조건 보너스 — 1차(index 0) 외의 조건을 하나라도 충족했으면 지급.
    // 전멸 승리는 defeatBoss 등 하위 조건을 포함하므로, 순서가 아니라 충족 여부로 판정한다.
    if (stage.bonusExp && met.some((m, i) => m && i > 0)) {
      for (const u of livingUnits(state, 'player')) {
        const progress = applyExp(u.level, u.exp, stage.bonusExp)
        u.level = progress.level
        u.exp = progress.exp
      }
      log(state, 'bonus', `2차 승리조건 달성 — 생존 전원 경험치 +${stage.bonusExp}`)
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
        equipment: toEquipmentMap(def.equipment ?? officer.initialEquipment),
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

export function startBattle(
  stage: StageDef,
  seed: number,
  roster?: RosterEntry[],
  deployment?: string[],
  consumables?: ConsumableStack[],
): BattleState {
  return attachStage(createBattle(stage, seed, roster, deployment, consumables), stage)
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
        resolveStrike(state, defender, attacker, COUNTER_DAMAGE_SCALE)
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
      // 중심 칸은 맵 안이어야 한다 — 빈 칸 조준이 열렸으므로 명시적으로 막는다
      // (범위 칸 자체는 맵 밖으로 삐져나가도 좋다: strategyAreaCells는 클립하지 않는다)
      const { width, height } = state.map
      if (action.target.x < 0 || action.target.y < 0 || action.target.x >= width || action.target.y >= height) {
        return prev
      }

      const targetCells: Vec2[] = strategyAreaCells(strategy.area, action.target)
      // 진영 필터 — per-cell 판정과 같은 규칙 (오사 없음)
      const isValidTarget = (u: UnitState): boolean =>
        strategy.targets === 'enemy' ? isHostile(caster, u) : !isHostile(caster, u)

      if (strategy.area === 'single') {
        // 단일 대상 책략은 원작대로 중심 칸에 유효 대상이 서 있어야 한다
        const primaryTarget = unitAt(state, action.target)
        if (!primaryTarget || !isValidTarget(primaryTarget)) return prev
      } else {
        // 범위 책략은 빈 칸을 중심으로 지정할 수 있다 (조준 완화 — 십자/ㅁ자 걸치기).
        // 다만 범위 안에 유효 대상이 하나도 없으면 MP만 날아가므로 거부한다.
        const anyTarget = targetCells.some((cell) => {
          const u = unitAt(state, cell)
          return u !== undefined && isValidTarget(u)
        })
        if (!anyTarget) return prev
      }

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
            log(state, 'strategy', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${dmg} 데미지`, {
              targetId: target.id,
              amount: -dmg,
            })
            dealDamage(state, target, dmg)
            grantExp(state, caster, target.level, target.hp === 0)
            // 원작 확정: 책략 명중도 무기(부채·보검) exp, 책략 피격도 방어구 exp (equipment.md 증보)
            growEquipment(
              state,
              caster,
              'weapon',
              target.level >= caster.level ? EQUIP_EXP_WEAPON_HIT.higher : EQUIP_EXP_WEAPON_HIT.lower,
            )
            growEquipment(
              state,
              target,
              'armor',
              caster.level >= target.level ? EQUIP_EXP_ARMOR_HIT.higher : EQUIP_EXP_ARMOR_HIT.lower,
            )
          } else {
            target.buffs.push({ ...strategy.buff!, remainingTurns: strategy.buff!.duration })
            log(state, 'debuff', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}`)
            grantExp(state, caster, target.level, false)
          }
        } else if (strategy.kind === 'heal') {
          if (isHostile(caster, target)) continue
          const healed = Math.min(strategy.healAmount!, target.maxHp - target.hp)
          target.hp += healed
          log(state, 'heal', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${healed} 회복`, {
            targetId: target.id,
            amount: healed,
          })
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

    // 도구(소모품) 사용 — 회복/MP/승급(인수). 스톡은 전투 로컬 사본에서 차감되고
    // 승리 시 applyVictory가 잔량을 캠페인으로 회수한다 (docs/research/items.md).
    case 'useItem': {
      const unit = state.units.find((u) => u.id === action.unitId)
      if (!unit || unit.hp <= 0 || unit.faction !== state.phase || unit.acted) return prev

      const def = CONSUMABLES[action.itemId]
      if (!def) return prev
      if (consumableCount(state.consumables, action.itemId) <= 0) return prev
      if (manhattan(unit.pos, action.target) > def.range) return prev

      // range 0 도구는 자기 자신 전용(target = 자기 위치). 사거리가 있으면 대상 칸에
      // 비적대 생존 유닛이 서 있어야 한다 — 도구는 적에게 쓸 수 없다.
      let target: UnitState
      if (def.range === 0) {
        target = unit
      } else {
        const at = unitAt(state, action.target)
        if (!at || isHostile(unit, at)) return prev
        target = at
      }

      switch (def.effect.kind) {
        case 'heal': {
          const healed = Math.min(def.effect.amount, target.maxHp - target.hp)
          target.hp += healed
          log(state, 'item', `${nameOf(unit)}의 ${def.name} → ${nameOf(target)}: ${healed} 회복`, {
            targetId: target.id,
            amount: healed,
          })
          break
        }
        case 'mpRestore': {
          const regained = Math.min(def.effect.amount, target.maxMp - target.mp)
          target.mp += regained
          log(state, 'item', `${nameOf(unit)}의 ${def.name} → ${nameOf(target)}: 책략치 ${regained} 회복`, {
            targetId: target.id,
            amount: regained,
          })
          break
        }
        case 'promotion': {
          // 승급 판정은 캠프 UI와 같은 함수를 쓴다 (Lv15↑ + 상위 병과 존재)
          if (!canPromoteUnit(target)) return prev
          const newCls = CLASSES[CLASSES[target.classId].promotesTo!]
          const healed = target.maxHp - target.hp
          target.classId = newCls.id
          target.maxHp = maxHp(newCls, target.level)
          target.maxMp = maxMp(newCls, target.level)
          // 원작: 인수 사용 = 클래스업 + HP/MP 최대치 회복 (docs/research/promotion.md §4)
          target.hp = target.maxHp
          target.mp = target.maxMp
          // 승급으로 늘어난 책략(참모 화룡/방술사 대치료)은 knownStrategies가 병과에서 파생하므로 자동 반영
          log(
            state,
            'promote',
            `${nameOf(target)}${subjectParticle(nameOf(target))} ${newCls.name}으로 승급! HP·책략치 완전회복`,
            { targetId: target.id, amount: healed },
          )
          break
        }
      }

      // 스톡 차감 — 0이 된 스택은 목록에서 사라진다 (removeConsumable 관례)
      state.consumables = removeConsumable(state.consumables, action.itemId, 1) ?? state.consumables
      unit.acted = true
      unit.moved = true
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

        // 장비 MP 회복 (태평요술서 — 원작 확정: 매턴 MP 10)
        const mpRegen = equippedItems(unit).reduce((sum, item) => sum + (item.mpRegenPerTurn ?? 0), 0)
        if (mpRegen > 0 && unit.mp < unit.maxMp) {
          const regained = Math.min(mpRegen, unit.maxMp - unit.mp)
          unit.mp += regained
          log(state, 'mpRegen', `${nameOf(unit)} — 책략치 ${regained} 회복`)
        }
      }
      break
    }
  }

  if (stage) checkVictory(state, stage)
  return state
}
