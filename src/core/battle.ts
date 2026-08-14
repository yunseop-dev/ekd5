// 전투 리듀서: BattleState + BattleAction → BattleState (순수 함수, 원본 불변)
// 공격 해소 순서: 명중 → 회심 → 데미지 → 2회 공격 → 반격 (조조전 사양)

import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STATUSES, statusName } from '../data/statuses'
import { STRATEGIES } from '../data/strategies'
import { TERRAIN } from '../data/terrain'
import type { RosterEntry } from './campaign'
import {
  canPromoteUnit,
  classIdOf,
  consumableCount,
  itemKindOf,
  removeConsumable,
  toEquipmentMap,
} from './campaign'
import type { OccurredEvent } from './events'
import { executeQueue, livingByOfficer, runEvents, spawnStageUnit } from './events'
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
  strategyHealAmount,
  strategyHitRate,
} from './formulas'
import type { MoveContext, MovementRange, Occupancy } from './movement'
import { chebyshev, keyOf, manhattan, movementRange, strategyAreaCells } from './movement'
import { nextInt, roll } from './rng'
import type {
  BattleAction,
  BattleState,
  ConsumableStack,
  DefeatCondition,
  EquipInstance,
  EquipmentDef,
  EquipSlot,
  EventAction,
  Hazard,
  OfficerDef,
  OfficerStats,
  StageDef,
  StageUnitDef,
  StatusEffect,
  StatusId,
  StrategyDef,
  TerrainId,
  UnitClassDef,
  UnitState,
  Vec2,
  VictoryCondition,
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

// ---------- 상태이상 게이트 (v1.0) ----------
// 원작: 혼란 = 행동 불가(각성약 자가사용 불가의 근거), 부동 = 이동만 불가, 금책 = 책략만 불가.
// 리듀서 각 케이스와 AI·UI가 같은 헬퍼를 쓴다 — 혼란 규칙이 바뀌면(오조작 등) canAct만 교체.

export function hasStatus(unit: UnitState, id: StatusId): boolean {
  return unit.statuses.some((s) => s.id === id)
}

/** 이동 가능 여부 — 부동·혼란이면 불가 */
export function canMove(unit: UnitState): boolean {
  return !hasStatus(unit, 'immobile') && !hasStatus(unit, 'confusion')
}

/** 행동(공격/도구/대기) 가능 여부 — 혼란이면 불가 */
export function canAct(unit: UnitState): boolean {
  return !hasStatus(unit, 'confusion')
}

/** 책략 사용 가능 여부 — 행동 가능 + 금책 아님 */
export function canCast(unit: UnitState): boolean {
  return canAct(unit) && !hasStatus(unit, 'seal')
}

/**
 * 물리 명중률 — 혼란 대상은 **확정 피격**(100 강제, statuses.md §1).
 * 부동·금책에는 확정 피격이 없다 (6.5 MOD가 麻痹로 옮긴 것 — 원작 아님).
 */
export function hitRateAgainst(attackerAgi: number, defender: UnitState, defenderAgi: number): number {
  return hasStatus(defender, 'confusion') ? 100 : hitRate(attackerAgi, defenderAgi)
}

/**
 * 책략 명중률 — 혼란 대상은 확정 피격 (statuses.md §2 특례. 즉사기 예외는 우리에게 즉사기가 없어 불요).
 * α 하한 30 재적용은 strategyHitRate 안에 있다.
 */
export function strategyRateAgainst(caster: CombatStats, target: UnitState, capHitRate: number): number {
  if (hasStatus(target, 'confusion')) return 100
  const tStats = effectiveStats(target)
  return strategyHitRate(caster.mind, caster.morale, tStats.mind, tStats.morale, capHitRate)
}

/**
 * 상태이상 자연 해제 확률(%) = **부대 사기** = floor(운÷2) + 레벨 × 사기 성장치 (statuses.md §1).
 * 인물 장기 레코드를 읽는 판정이라 **장비 보정과 전장 버프(고양·환성)는 타지 않고**, 열매(statBonus)는 포함한다.
 * → effectiveStats를 쓰면 안 된다. 4종 모두 같은 확률로 각각 독립 판정된다.
 */
export function statusCureRate(unit: UnitState): number {
  return combatStats(boostedStats(unit), classOf(unit).growth, unit.level).morale
}

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

// ---------- 장비 특수효과 (v1.3 — kr-blog §R5) ----------

/** 장비의 최대 HP 가산 합 (투구 계열: 가죽+15/구리+30, 원작 확정) */
export function equipMaxHpBonus(unit: UnitState): number {
  return equippedItems(unit).reduce((sum, item) => sum + (item.maxHpBonus ?? 0), 0)
}

/** 장비의 최대 MP 가산 합 (복건/관건/칠흑도복: +15/+30/+20, 원작 확정) */
export function equipMaxMpBonus(unit: UnitState): number {
  return equippedItems(unit).reduce((sum, item) => sum + (item.maxMpBonus ?? 0), 0)
}

/** 장비 특수효과를 포함한 실효 최대 HP (호전·레벨업·승급 공용) */
export function effectiveMaxHp(unit: UnitState): number {
  return maxHp(classOf(unit), unit.level) + equipMaxHpBonus(unit)
}

/** 장비 특수효과를 포함한 실효 최대 MP */
export function effectiveMaxMp(unit: UnitState): number {
  return maxMp(classOf(unit), unit.level) + equipMaxMpBonus(unit)
}

/** 백은갑옷 등 — 책략 피해 배율 (1 = 보통, 0.5 = 반감). 곱연산. */
export function strategyDamageScaleOf(unit: UnitState): number {
  return equippedItems(unit).reduce((acc, item) => acc * (item.strategyDamageScale ?? 1), 1)
}

/**
 * 실효 공격 사거리. 몰우전(근접 병과에 원거리 공격 부여, 원작 확정)을 반영한다.
 * 원작 진정치는 "근접 병과가 화살을 쏘는" 것이므로 사거리 2~3을 부여한다 (kr-blog §R5).
 * 원래 원거리 병과는 그대로 둔다.
 */
export function effectiveAttackRanges(unit: UnitState): { minRange: number; maxRange: number } {
  const cls = classOf(unit)
  if (!cls.ranged && equippedItems(unit).some((item) => item.rangedAttack)) {
    return { minRange: 2, maxRange: 3 }
  }
  return { minRange: cls.minRange, maxRange: cls.maxRange }
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

// ---------- 전장 위험 지대 (v1.2) ----------

/** 그 칸의 위험 지대(불길). 없으면 undefined — UI 오버레이·AI·이동 판정 공용 */
export function hazardAt(state: BattleState, pos: Vec2): Hazard | undefined {
  return state.hazards.find((h) => h.pos.x === pos.x && h.pos.y === pos.y)
}

/** 아무 병과도 들어갈 수 없는 지형 (강·성벽·닫힌 성문) — 불도 붙지 않는다 */
export function isImpassableTerrain(id: TerrainId): boolean {
  return Object.values(TERRAIN[id].cost).every((c) => c === null)
}

/**
 * 연소 가능 지형 — 화계가 불길을 남길 수 있는 칸 [설계값].
 * 강·성벽은 애초에 못 들어가고, 산지·황무지·여울·성내·성채는 타지 않는다.
 */
export const BURNABLE_TERRAIN: TerrainId[] = ['plain', 'grass', 'forest', 'village', 'bridge']

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
      // 불길은 진입도 통과도 불가 — 지형 조회보다 먼저 걸러서 적로(flatCost)보다 우선한다 (v1.2).
      // 시작 칸은 movementRange가 costAt에 묻지 않으므로, 불타는 칸에 갇힌 유닛도 탈출할 수 있다.
      if (hazardAt(state, pos)) return null
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

  // 반격: 직접(근접) 공격에만, 반격측 사거리에 거리 1이 포함될 때, 항상 1회.
  // 혼란은 반격도 못 한다 (행동 완전 불가) — 부동·금책은 반격 정상 (statuses.md §1).
  const willCounter = !aCls.ranged && dist === 1 && !dCls.ranged && dCls.minRange <= 1 && canAct(defender)

  return {
    damage,
    hitRate: hitRateAgainst(aStats.agi, defender, dStats.agi),
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
    counterHitRate: willCounter ? hitRateAgainst(dStats.agi, attacker, aStats.agi) : 0,
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
    const level = entry?.level ?? def.level ?? officer.level
    // 아군은 캠페인 로스터 우선, 적/우군·자유 전투는 스테이지 정의(적장 장비 — 원작: 격파 드랍과 연결).
    // 정의 표기(문자열 id)든 인스턴스든 여기서 전부 인스턴스로 정규화된다.
    const equipment = toEquipmentMap(entry?.equipment ?? def.equipment ?? officer.initialEquipment)
    const unit: UnitState = {
      id: `u${i}_${def.officerId}`,
      officerId: def.officerId,
      classId,
      faction: def.faction,
      pos: { ...def.pos },
      level,
      exp: entry?.exp ?? 0,
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      moved: false,
      acted: false,
      statuses: [],
      buffs: [],
      equipment,
      statBonus: { ...(entry?.statBonus ?? {}) },
      isLeader: def.isLeader,
      isBoss: def.isBoss,
      behavior: def.behavior,
    }
    // 장비 특수효과(최대 HP/MP 가산) 포함 실효 최대치 (v1.3 — kr-blog §R5)
    unit.maxHp = effectiveMaxHp(unit)
    unit.maxMp = effectiveMaxMp(unit)
    unit.hp = unit.maxHp
    unit.mp = unit.maxMp
    return unit
  })

  return {
    stageId: stage.id,
    // 딥클론 — setTile 이벤트(성문 개방)가 스테이지 정의(모듈 상수)를 오염시키지 않게 한다 (v1.1)
    map: structuredClone(stage.map),
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
    firedEvents: [],
    pendingEvents: [],
    pendingRewards: [],
    pendingGold: 0,
    hazards: [],
    // 스테이지 정의 비오염 — 픽업으로 배열이 줄어드므로 사본이어야 한다
    groundItems: (stage.groundItems ?? []).map((g) => ({ pos: { ...g.pos }, itemId: g.itemId })),
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

/** 한글 목적격 조사 — 받침 있으면 '을', 없으면 '를' (로그 문장용) */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '을(를)'
  return (code - 0xac00) % 28 === 0 ? '를' : '을'
}

/** 한글 방향 조사 — 받침 없거나 ㄹ이면 '로', 그 외 '으로' (로그 문장용) */
function directionParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '(으)로'
  const jong = (code - 0xac00) % 28
  return jong === 0 || jong === 8 ? '로' : '으로'
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

// ---------- 위험 지대 / 맵 아이템 (v1.2) ----------

/**
 * 화계 발화 — 영향 범위 중 **연소 가능 지형**이고 맵 안인 칸에 불길을 남긴다.
 * 명중 여부와 무관하게 시전이 성립하면 붙는다(원작: 화공 후 화염 타일 잔존).
 * 이미 타고 있는 칸은 남은 턴을 늘리기만 한다(짧은 불이 긴 불을 덮어쓰지 않는다).
 */
function igniteHazards(state: BattleState, cells: Vec2[], duration: number): void {
  const { width, height } = state.map
  let ignited = 0
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue
    if (!BURNABLE_TERRAIN.includes(state.map.tiles[cell.y][cell.x])) continue
    const existing = hazardAt(state, cell)
    if (existing) existing.remainingTurns = Math.max(existing.remainingTurns, duration)
    else state.hazards.push({ pos: { ...cell }, kind: 'fire', remainingTurns: duration })
    ignited += 1
  }
  if (ignited > 0) log(state, 'hazard', `불길이 번졌다 — ${ignited}칸`)
}

/** 불길 감쇠 — 턴이 증가할 때 1턴씩 사그라들고, 다 타면 사라진다 */
function decayHazards(state: BattleState): void {
  if (state.hazards.length === 0) return
  for (const h of state.hazards) h.remainingTurns -= 1
  const before = state.hazards.length
  state.hazards = state.hazards.filter((h) => h.remainingTurns > 0)
  if (state.hazards.length < before) log(state, 'hazard', '불길이 사그라들었다')
}

/**
 * 아이템 1점을 보상 목록에 적재 + 로그 (맵 픽업·이벤트 드랍 공용).
 * 미등록 id는 조용히 무시한다 (기존 보상 경로 관례).
 */
export function grantItem(state: BattleState, itemId: string): void {
  const kind = itemKindOf(itemId)
  if (!kind) return
  const name = (kind === 'equipment' ? EQUIPMENT[itemId].name : CONSUMABLES[itemId].name) ?? itemId
  state.pendingRewards.push({ itemId, kind })
  log(state, 'reward', `${name}${objectParticle(name)} 손에 넣었다!`)
}

/**
 * 이동을 마친 유닛이 밟은 칸의 맵 아이템을 전부 회수한다 (v1.2).
 * **아군(player)만** 줍는다 — 적·우군은 밟아도 그대로 남는다 (원작: 보물은 플레이어 것).
 */
function pickupGroundItems(state: BattleState, unit: UnitState): void {
  if (unit.faction !== 'player') return
  const here = state.groundItems.filter((g) => g.pos.x === unit.pos.x && g.pos.y === unit.pos.y)
  if (here.length === 0) return
  state.groundItems = state.groundItems.filter((g) => !here.includes(g))
  for (const g of here) grantItem(state, g.itemId)
}

/**
 * 데미지 적용 + 격파 처리. 격파 시 증원을 즉시 트리거하고, 전투 내 이벤트용 사건은
 * occurred에 적재해 공통 후처리(runEvents)에서 일괄 평가한다 (v1.1 — 액션 도중 이벤트가 끼어들지 않게).
 */
function dealDamage(
  state: BattleState,
  target: UnitState,
  amount: number,
  occurred: OccurredEvent[],
): void {
  target.hp = Math.max(0, target.hp - amount)
  if (target.hp === 0) {
    log(state, 'defeat', `${nameOf(target)} 부대 괴멸!`)
    triggerReinforcements(state, { type: 'unitDefeated', unitId: target.id })
    occurred.push({ type: 'unitDefeated', officerId: target.officerId })
  }
}

/**
 * 명중 확정 후의 데미지 해소 (회심 → 랜덤 가산 → 데미지 → 격파 → 경험치 → 무구성장).
 * 본타·반격·관통타(사모)가 같은 계산을 쓴다 — pierce는 로그 종류만 다르다 (v1.2).
 */
function applyHitDamage(
  state: BattleState,
  attacker: UnitState,
  defender: UnitState,
  occurred: OccurredEvent[],
  damageScale: number,
  pierce: boolean,
): void {
  const aStats = effectiveStats(attacker)
  const dStats = effectiveStats(defender)

  // 황금갑옷 — 회심의 일격 무조건 회피 (원작 확정, kr-blog §R5). 이미 낸 난수는 소모하지 않는다.
  const critImmune = equippedItems(defender).some((item) => item.critImmune)
  const critRoll = roll(state.rngState, critImmune ? 0 : critRate(aStats.morale, dStats.morale))
  state.rngState = critRoll.nextState

  const bonus = nextInt(state.rngState, 0, 7)
  state.rngState = bonus.nextState

  const multipliers = [affinityMultiplier(classOf(attacker), classOf(defender))]
  if (critRoll.value) multipliers.push(CRIT_MULTIPLIER)
  if (damageScale !== 1) multipliers.push(damageScale)
  // 기마갑옷/가죽·구리 — 원거리(간접) 공격 피해 감소 (원작 확정, kr-blog §R5).
  // affinity에서 원거리→기병 1.5배가 이미 곱해졌다면 그 위에 곱연산으로 줄어든다.
  if (classOf(attacker).ranged) {
    const rangedScale = equippedItems(defender).reduce(
      (acc, item) => acc * (item.rangedDamageScale ?? 1),
      1,
    )
    if (rangedScale !== 1) multipliers.push(rangedScale)
  }

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
  const eventType = pierce
    ? critRoll.value
      ? 'pierceCrit'
      : 'pierce'
    : isCounter
      ? critRoll.value
        ? 'counterCrit'
        : 'counterHit'
      : critRoll.value
        ? 'crit'
        : 'hit'
  const suffix = pierce ? ' (관통!)' : critRoll.value ? ' (회심의 일격!)' : ''
  log(state, eventType, `${nameOf(attacker)} → ${nameOf(defender)}: ${dmg} 데미지${suffix}`, {
    targetId: defender.id,
    amount: -dmg,
  })
  dealDamage(state, defender, dmg, occurred)
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
}

/** 한 번의 타격 해소 (명중 → 회심 → 데미지 → 장비 특수효과). 명중 여부 반환. damageScale: 반격 시 0.8 */
function resolveStrike(
  state: BattleState,
  attacker: UnitState,
  defender: UnitState,
  occurred: OccurredEvent[],
  damageScale = 1,
): boolean {
  const aStats = effectiveStats(attacker)
  const dStats = effectiveStats(defender)

  // 무명장갑(명중+)·방패(회피+) — 명중률 퍼센트포인트 보정 (원작 확정, kr-blog §R5)
  const hitBonus = equippedItems(attacker).reduce((acc, item) => acc + (item.hitBonus ?? 0), 0)
  const evadeBonus = equippedItems(defender).reduce((acc, item) => acc + (item.evadeBonus ?? 0), 0)

  const hitRoll = roll(
    state.rngState,
    Math.max(30, Math.min(100, hitRateAgainst(aStats.agi, defender, dStats.agi) + hitBonus - evadeBonus)),
  )
  state.rngState = hitRoll.nextState
  if (!hitRoll.value) {
    log(state, 'miss', `${nameOf(attacker)}의 공격이 빗나갔다!`, { targetId: defender.id, amount: 0 })
    // 미스: 무기는 소량 획득, 회피한 쪽 방어구는 0 (원작 확정 — equipment.md 증보)
    growEquipment(state, attacker, 'weapon', EQUIP_EXP_WEAPON_MISS)
    return false
  }

  applyHitDamage(state, attacker, defender, occurred, damageScale, false)

  // ---- 장비 특수효과 (v1.2) — 반격 시에도 그 타격의 공격자(=방어자) 장비 기준으로 적용된다 ----
  const gear = equippedItems(attacker)

  // 여포궁류 — 명중 시 상태이상 확정 부여 (원작: 보물은 100%). 이미 보유·격파된 대상은 no-op
  const onHitStatus = gear.find((item) => item.onHitStatus)?.onHitStatus
  if (onHitStatus && defender.hp > 0 && !hasStatus(defender, onHitStatus)) {
    defender.statuses.push({ id: onHitStatus })
    const name = nameOf(defender)
    log(state, 'status', `${name}${subjectParticle(name)} ${statusName(onHitStatus)}에 빠졌다!`, {
      targetId: defender.id,
    })
  }

  // 사모 — 공격자→대상 방향 연장선의 다음 칸에 있는 적도 함께 관통한다.
  // 반격·2회 공격은 발생하지 않고(관통타는 자기 자신을 다시 관통시키지도 않는다) 경험치는 정상 부여된다.
  // 대각 사거리(궁병류 몰우전 조합)에서는 부호 정규화한 방향을 쓴다.
  if (gear.some((item) => item.pierceBack)) {
    const behind: Vec2 = {
      x: defender.pos.x + Math.sign(defender.pos.x - attacker.pos.x),
      y: defender.pos.y + Math.sign(defender.pos.y - attacker.pos.y),
    }
    const extra = unitAt(state, behind)
    if (extra && extra.id !== attacker.id && isHostile(attacker, extra)) {
      applyHitDamage(state, attacker, extra, occurred, damageScale, true)
    }
  }

  return true
}

// ---------- 승패 판정 ----------

/**
 * 지금 유효한 승리 조건 — setVictory 오버라이드가 있으면 그것, 없으면 스테이지 정의 (v1.2).
 * UI(정보 패널)가 이 함수로 조건 문구를 만든다 — 시그니처 고정.
 */
export function effectiveVictory(state: BattleState, stage: StageDef): VictoryCondition[] {
  return state.victoryOverride ?? stage.victory
}

/**
 * 지금 유효한 패배 조건 — setDefeat 오버라이드 우선, 없으면 스테이지 정의 (없으면 빈 목록).
 * 주인공 격파는 데이터에 없어도 항상 적용되므로 여기에 포함되지 않는다 — 시그니처 고정.
 */
export function effectiveDefeat(state: BattleState, stage: StageDef): DefeatCondition[] {
  return state.defeatOverride ?? stage.defeat ?? []
}

function checkVictory(state: BattleState, stage: StageDef): void {
  if (state.result !== 'ongoing') return

  // 패배: 주인공 격파
  const leader = state.units.find((u) => u.faction === 'player' && u.isLeader)
  if (leader && leader.hp <= 0) {
    state.result = 'defeat'
    log(state, 'defeat', '주인공 부대 괴멸 — 패배...')
    return
  }

  // 데이터화된 패배 조건 (v1.2) — 주인공 격파 다음, 승리 평가보다 먼저 본다.
  // turnLimit은 endPhase의 턴 증가 직후 이 함수가 불리므로 자연히 "N+1턴 시작 시 패배"가 된다.
  for (const cond of effectiveDefeat(state, stage)) {
    if (cond.type === 'turnLimit') {
      if (state.turn > cond.turns) {
        state.result = 'defeat'
        log(state, 'defeat', `${cond.turns}턴을 넘겼다 — 패배...`)
        return
      }
      continue
    }
    // unitDies는 **사체(hp 0)가 전장에 남아 있을 때만** 발동한다.
    // removeUnits·일기토 퇴각으로 배열에서 빠진 유닛은 발동시키지 않는다
    // (원작 서주 구원전 "미축 배신으로 실제로는 지지 않는" 페이크 재현).
    const corpse = state.units.find((u) => u.officerId === cond.officerId && u.hp <= 0)
    if (corpse) {
      state.result = 'defeat'
      const name = nameOf(corpse)
      log(state, 'defeat', `${name}${subjectParticle(name)} 쓰러졌다 — 패배...`)
      return
    }
  }

  const met = effectiveVictory(state, stage).map((cond) => {
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
    // 스폰 로직은 이벤트 spawnUnits와 공용 (events.spawnStageUnit) — 자리가 막히면 개별 취소
    r.units.forEach((def, j) => {
      spawnStageUnit(state, def, `r${idx}_${j}_${def.officerId}`)
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
  const state = attachStage(createBattle(stage, seed, roster, deployment, consumables), stage)
  // battleStart 이벤트 — 초기 상태가 pendingEvents를 갖고 반환될 수 있다 (전략 선택이 이 경로).
  // 승패 판정은 하지 않는다 (기존 동작 유지 — 첫 액션의 공통 후처리에서 평가된다).
  runEvents(state, stage, [{ type: 'battleStart' }])
  return state
}

/**
 * 일기토/설전 결과 적용 (eventContinue의 duel 소비). 결과는 데이터 고정 — 난수를 쓰지 않는다.
 * 승자가 아군이면 일반 격파와 동일한 경험치(grantExp)를 받고, 패자는 사망(격파 처리) 또는 퇴각(무경험치 제거).
 */
function resolveDuel(
  state: BattleState,
  duel: Extract<EventAction, { type: 'duel' }>,
  occurred: OccurredEvent[],
): void {
  const a = livingByOfficer(state, duel.a)
  const b = livingByOfficer(state, duel.b)
  if ('draw' in duel.outcome) {
    const names = [a, b].filter((u): u is UnitState => u !== undefined).map(nameOf)
    log(state, 'event', `${names.join(' vs ')} — 승부를 가리지 못했다`)
    return
  }
  const winner = duel.outcome.winner === 'a' ? a : b
  const loser = duel.outcome.winner === 'a' ? b : a
  if (!winner || !loser) return // 데이터 불일치(이미 격파/이탈) — 조용히 무시

  log(state, 'event', `${nameOf(winner)}${subjectParticle(nameOf(winner))} ${nameOf(loser)}에게 승리했다!`)
  // 원작 확정: 일기토 승리 경험치는 일반 격파와 동일하다
  if (winner.faction === 'player') grantExp(state, winner, loser.level, true)

  if (duel.outcome.loserFate === 'die') {
    loser.hp = 0
    log(state, 'defeat', `${nameOf(loser)} 부대 괴멸!`)
    triggerReinforcements(state, { type: 'unitDefeated', unitId: loser.id })
    occurred.push({ type: 'unitDefeated', officerId: loser.officerId })
  } else {
    log(state, 'event', `${nameOf(loser)} 부대 퇴각`)
    state.units = state.units.filter((u) => u.id !== loser.id)
  }
}

export function applyAction(prev: BattleState, action: BattleAction): BattleState {
  if (prev.result !== 'ongoing' && !(action.type === 'eventContinue' && prev.pendingEvents.length > 0)) return prev
  // 표시 대기 이벤트가 있으면 eventContinue 외 전 액션을 봉쇄한다 (AI 포함 — v1.1)
  if (prev.pendingEvents.length > 0 && action.type !== 'eventContinue') return prev
  const stage = prev.__stage
  const state: BattleState = structuredClone({ ...prev, __stage: undefined })
  state.__stage = stage
  // 이 액션 처리 중 발생한 이산 사건 — 공통 후처리에서 runEvents가 소화한다 (state 오염 없음)
  const occurred: OccurredEvent[] = []

  switch (action.type) {
    case 'move': {
      const unit = state.units.find((u) => u.id === action.unitId)
      if (!unit || unit.hp <= 0 || unit.faction !== state.phase || unit.moved || unit.acted) return prev
      if (!canMove(unit)) return prev // 부동·혼란
      const range = movementRangeOf(state, unit)
      const cell = range.get(keyOf(action.to))
      if (!cell || !cell.canStop) return prev
      unit.pos = { ...action.to }
      unit.moved = true
      // 도착 칸의 맵 아이템 회수 (v1.2) — 아군만
      pickupGroundItems(state, unit)
      break
    }

    case 'attack': {
      const attacker = state.units.find((u) => u.id === action.unitId)
      const defender = state.units.find((u) => u.id === action.targetId)
      if (!attacker || !defender || attacker.hp <= 0 || defender.hp <= 0) return prev
      if (attacker.faction !== state.phase || attacker.acted) return prev
      if (!canAct(attacker)) return prev // 혼란
      if (!isHostile(attacker, defender)) return prev

      const dist = manhattan(attacker.pos, defender.pos)
      // 몰우전(근접 병과 원거리 부여) 포함 실효 사거리 검증 (v1.3, kr-blog §R5)
      const { minRange, maxRange } = effectiveAttackRanges(attacker)
      if (dist < minRange || dist > maxRange) return prev

      // 1타
      resolveStrike(state, attacker, defender, occurred)

      // 2회 공격 판정
      if (defender.hp > 0) {
        const aStats = effectiveStats(attacker)
        const dStats = effectiveStats(defender)
        const dbl = roll(state.rngState, doubleAttackRate(aStats.agi, dStats.agi))
        state.rngState = dbl.nextState
        if (dbl.value) {
          // 연환갑옷 — 연속공격 2번째 타격만 회피 (원작 확정, kr-blog §R5)
          if (equippedItems(defender).some((item) => item.secondHitEvade)) {
            log(state, 'evade', `${nameOf(defender)}이(가) 연환갑옷으로 두 번째 번쩍임을 비껴냈다!`, {
              targetId: defender.id,
              amount: 0,
            })
          } else {
            log(state, 'double', `${nameOf(attacker)}의 2회 공격!`)
            resolveStrike(state, attacker, defender, occurred)
          }
        }
      }

      // 반격 (직접 공격에만, 항상 1회)
      const forecast = forecastAttack(state, attacker, defender)
      if (defender.hp > 0 && forecast.willCounter) {
        log(state, 'counter', `${nameOf(defender)}의 반격!`)
        resolveStrike(state, defender, attacker, occurred, COUNTER_DAMAGE_SCALE)
      }

      attacker.acted = true
      attacker.moved = true
      break
    }

    case 'strategy': {
      const caster = state.units.find((u) => u.id === action.unitId)
      if (!caster || caster.hp <= 0 || caster.faction !== state.phase || caster.acted) return prev
      if (!canCast(caster)) return prev // 혼란 + 금책

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

      // 원작 확정(ccz-compat-engine 대조): 범위 책략도 **유닛이 서 있는 칸**만 중심으로 지정할 수 있다.
      // 커서 후보 열거·실행 모두 유닛 레코드 기준이라 빈 칸 중심은 존재하지 않는다.
      // 이득 0인 캐스팅으로 MP를 낭비하는 것은 플레이어의 자유이며, 그 방지는 AI 쪽 판단이다.
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

        if (strategy.kind === 'status') {
          if (!isHostile(caster, target)) continue
          const tStats = effectiveStats(target)
          const rate = strategyRateAgainst(cStats, target, strategy.capHitRate)

          // 원작 확정: 데미지와 상태이상은 **각각 독립으로 명중 판정**한다 (statuses.md §3).
          // 독연 α0.9 → 81% 둘 다 / 9% 독만 / 9% 데미지만 / 1% 무효 — "한쪽만 걸릴 때도 있다"의 정체.
          // power가 없는 순수 방해(허보·봉책)는 상태 판정 1회뿐이다.
          let landed = false

          if (strategy.power !== undefined) {
            const dmgHit = roll(state.rngState, rate)
            state.rngState = dmgHit.nextState
            if (dmgHit.value) {
              landed = true
              const bonus = nextInt(state.rngState, 0, 7)
              state.rngState = bonus.nextState
              const dmg = strategyDamage(cStats.mind, tStats.mind, caster.level, strategy.power, bonus.value)
              const scaled = Math.max(1, Math.trunc(dmg * strategyDamageScaleOf(target)))
              log(state, 'strategy', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${scaled} 데미지`, {
                targetId: target.id,
                amount: -scaled,
              })
              dealDamage(state, target, scaled, occurred)
              grantExp(state, caster, target.level, target.hp === 0)
            }
          }

          // 격파된 대상에게는 상태를 얹지 않는다 (판정 자체를 건너뛴다)
          if (target.hp > 0) {
            const statusHit = roll(state.rngState, rate)
            state.rngState = statusHit.nextState
            if (statusHit.value) {
              landed = true
              // 지속턴이 없으므로 중복 부여는 무의미하다 (원작 AI도 "이미 걸린 대상 재사용 금지").
              // 낭비 캐스팅 자체는 막지 않는다(리듀서 관례) — 경험치만 주지 않는다.
              const statusId = strategy.inflicts!
              const name = nameOf(target)
              if (hasStatus(target, statusId)) {
                log(state, 'status', `${name}${subjectParticle(name)} 이미 ${statusName(statusId)} 상태다`, {
                  targetId: target.id,
                })
              } else {
                target.statuses.push({ id: statusId })
                log(state, 'status', `${name}${subjectParticle(name)} ${statusName(statusId)}에 빠졌다!`, {
                  targetId: target.id,
                })
                grantExp(state, caster, target.level, false)
              }
            }
          }

          if (!landed) log(state, 'miss', `${strategy.name}이(가) ${nameOf(target)}에게 통하지 않았다!`)
        } else if (strategy.kind === 'damage' || strategy.kind === 'debuff') {
          if (!isHostile(caster, target)) continue
          const tStats = effectiveStats(target)
          const hit = roll(state.rngState, strategyRateAgainst(cStats, target, strategy.capHitRate))
          state.rngState = hit.nextState
          if (!hit.value) {
            log(state, 'miss', `${strategy.name}이(가) ${nameOf(target)}에게 통하지 않았다!`)
            continue
          }
          if (strategy.kind === 'damage') {
            const bonus = nextInt(state.rngState, 0, 7)
            state.rngState = bonus.nextState
            const dmg = strategyDamage(cStats.mind, tStats.mind, caster.level, strategy.power!, bonus.value)
            const scaled = Math.max(1, Math.trunc(dmg * strategyDamageScaleOf(target)))
            log(state, 'strategy', `${nameOf(caster)}의 ${strategy.name} → ${nameOf(target)}: ${scaled} 데미지`, {
              targetId: target.id,
              amount: -scaled,
            })
            dealDamage(state, target, scaled, occurred)
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
          // 원작: 회복량 = base + floor(시전자 정신력 / mindDiv) — 고정값이 아니다 (items.md §3).
          // 만피 대상에게 걸어 0 회복이 되는 것도 원작이 허용한다 (효과 0 캐스팅 + 경험치 획득).
          const amount = strategyHealAmount(strategy.heal!, cStats.mind)
          const healed = Math.min(amount, target.maxHp - target.hp)
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

      // 화계 잔불 (v1.2) — 명중 여부와 무관하게 시전이 성립하면 영향 범위가 타오른다
      if (strategy.hazard) igniteHazards(state, targetCells, strategy.hazard.duration)

      caster.acted = true
      caster.moved = true
      break
    }

    // 도구(소모품) 사용 — 회복/MP/승급(인수). 스톡은 전투 로컬 사본에서 차감되고
    // 승리 시 applyVictory가 잔량을 캠페인으로 회수한다 (docs/research/items.md).
    case 'useItem': {
      const unit = state.units.find((u) => u.id === action.unitId)
      if (!unit || unit.hp <= 0 || unit.faction !== state.phase || unit.acted) return prev
      // 혼란은 행동 불가 — 혼란에 빠진 부대가 스스로 각성약을 먹을 수 없는 근거가 이 게이트다
      // (해제는 인접 아군이 먹여주는 경로뿐. docs/research/items.md §1 각성약 비고)
      if (!canAct(unit)) return prev

      const def = CONSUMABLES[action.itemId]
      if (!def) return prev
      if (consumableCount(state.consumables, action.itemId) <= 0) return prev
      // 원작 확정: 도구 대상 게이트는 **진영 일치 + 체비쇼프 거리 ≤ range**
      // (range 1 = 자기 자신 + 인접 8방). 인수도 자기 전용 특례가 없다.
      if (chebyshev(unit.pos, action.target) > def.range) return prev

      // 대상 칸에는 살아 있는 비적대 유닛이 서 있어야 한다 — 자기 위치를 찍으면 거리 0으로 자연 통과.
      const target = unitAt(state, action.target)
      if (!target || isHostile(unit, target)) return prev

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
        case 'cureStatus': {
          // 원작 해제약 — 매칭 상태이상만 떨어낸다('all' = 만능약).
          // 해제할 것이 없어도 소모·행동 종료된다 (원작: 효과 0 사용 허용, 낭비 방지는 UI 몫).
          const cure = def.effect.statuses
          const before = target.statuses.length
          target.statuses =
            cure === 'all' ? [] : target.statuses.filter((s) => !cure.includes(s.id))
          const cured = before - target.statuses.length
          log(state, 'item', `${nameOf(unit)}의 ${def.name} → ${nameOf(target)}: 상태이상 ${cured}개 해제`, {
            targetId: target.id,
          })
          break
        }
        case 'promotion': {
          // 승급 판정은 캠프 UI와 같은 함수를 쓴다 (Lv15↑ + 상위 병과 존재)
          if (!canPromoteUnit(target)) return prev
          const newCls = CLASSES[CLASSES[target.classId].promotesTo!]
          const healed = target.maxHp - target.hp
          target.classId = newCls.id
          // 장비 최대 HP/MP 가산 보존 — 병과 성장치는 바뀌어도 장비 보너스는 유지 (v1.3, kr-blog §R5)
          target.maxHp = effectiveMaxHp(target)
          target.maxMp = effectiveMaxMp(target)
          // 원작: 인수 사용 = 클래스업 + HP/MP 최대치 회복 (docs/research/promotion.md §4)
          target.hp = target.maxHp
          target.mp = target.maxMp
          // 승급으로 늘어난 책략(참모 화룡/방술사 대치료)은 knownStrategies가 병과에서 파생하므로 자동 반영
          log(
            state,
            'promote',
            `${nameOf(target)}${subjectParticle(nameOf(target))} ${newCls.name}${directionParticle(newCls.name)} 승급! HP·책략치 완전회복`,
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
      if (!canAct(unit)) return prev // 혼란 (선세팅으로 이미 acted=true지만 이중 방어)
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
        decayHazards(state) // 불길은 턴 단위로 사그라든다 (v1.2)
        triggerReinforcements(state, { type: 'turnStart', turn: state.turn })
        occurred.push({ type: 'turnStart', turn: state.turn })
      }

      // 새 페이즈 진영: 행동 초기화 + 버프 턴 감소 + 상태이상 처리 + 지형 회복
      for (const unit of livingUnits(state, state.phase)) {
        unit.moved = false
        unit.acted = false
        unit.buffs = unit.buffs
          .map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 }))
          .filter((b) => b.remainingTurns > 0)

        // ---- 상태이상 (자기 페이즈 시작 시 처리 — statuses.md §1) ----
        // 1) 자연 해제: 상태마다 **부대 사기 %** (= 운÷2 + 레벨×성장치, 장비·버프 제외). 각각 독립 난수.
        const cureRate = statusCureRate(unit)
        const kept: StatusEffect[] = []
        for (const status of unit.statuses) {
          const cure = roll(state.rngState, cureRate)
          state.rngState = cure.nextState
          if (cure.value) {
            log(state, 'statusCured', `${nameOf(unit)}의 ${statusName(status.id)} 상태가 회복되었다`, {
              targetId: unit.id,
            })
            continue
          }
          kept.push(status)
        }
        unit.statuses = kept

        // 2) 독 데미지 — `HP = max(1, HP − max(1, floor(maxHP/10)))`.
        //    **독으로는 죽지 않는다**: HP 1에서 정지한다 (원작 확정 0x44DFC7 / statuses.md §1).
        //    그래서 dealDamage를 타지 않는다 — 격파 처리 자체가 발생하지 않으므로 승패·증원과 무관하다.
        if (hasStatus(unit, 'poison')) {
          const dmg = Math.max(1, Math.trunc((unit.maxHp * STATUSES.poison.poisonDamagePct!) / 100))
          const applied = unit.hp - Math.max(1, unit.hp - dmg) // HP 1 하한에서 잘린 실제 감소량
          if (applied > 0) {
            unit.hp -= applied
            log(state, 'poison', `${nameOf(unit)} — 독으로 ${applied} 데미지`, {
              targetId: unit.id,
              amount: -applied,
            })
          }
          // 이미 HP 1이면 아무 일도 일어나지 않는다 (amount 0 로그 = 미스 계약이라 아예 남기지 않는다)
        }

        // 3) 행동 불가 선세팅 — 혼란은 이 시점에 행동을 소진시킨다.
        //    AI의 미행동 유닛 탐색(find(u => !u.acted))이 혼란 유닛을 자연히 건너뛰게 만드는 장치다.
        if (hasStatus(unit, 'confusion')) {
          unit.acted = true
          unit.moved = true
          log(state, 'statusHold', `${nameOf(unit)} — 혼란으로 움직일 수 없다`, { targetId: unit.id })
        } else if (hasStatus(unit, 'immobile')) {
          unit.moved = true // 이동만 봉쇄 (제자리 공격·책략은 가능)
        }

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

        // 장비 HP 재생 (봉황깃옷 — 원작 확정: 매턴 최대 HP 20%. 청낭서 비중첩·회복 지형 중첩, kr-blog §R5)
        const hpRegenPct = equippedItems(unit).reduce((acc, item) => acc + (item.hpRegenPercent ?? 0), 0)
        if (hpRegenPct > 0 && unit.hp < unit.maxHp) {
          const regained = Math.min(Math.trunc((unit.maxHp * hpRegenPct) / 100), unit.maxHp - unit.hp)
          unit.hp += regained
          log(state, 'regen', `${nameOf(unit)} — 깃옷의 기운으로 ${regained} 회복`)
        }
      }
      break
    }

    // 이벤트 큐 헤드(표시형) 소비 — UI/시뮬이 대사·선택·일기토를 확인했다는 신호 (v1.1)
    case 'eventContinue': {
      const pending = state.pendingEvents[0]
      if (!pending) return prev
      const head = pending.queue[0]
      if (!head) return prev // 헤드는 항상 표시형이어야 한다 (executeQueue 계약)

      switch (head.type) {
        case 'dialogue':
          pending.queue.shift() // 상태 무변경 — UI가 이미 재생 완료
          break

        case 'choice': {
          // 범위 밖/미지정 선택은 0번(밸런스 기준선)으로 떨어진다
          const raw = action.choice ?? 0
          const idx = Number.isInteger(raw) && raw >= 0 && raw < head.options.length ? raw : 0
          const chosen = head.options[idx]
          pending.queue.shift()
          if (chosen) {
            log(state, 'event', `▶ ${chosen.text}`)
            pending.queue.unshift(...chosen.actions) // 선택한 분기를 잔여 큐 앞에 삽입
          }
          break
        }

        case 'duel':
          resolveDuel(state, head, occurred)
          pending.queue.shift()
          break

        // 표시형 승격 (v1.2) — UI가 「손에 넣었습니다!」 모달을 띄우고 이 소비로 실제 적재된다.
        // 전투 중 획득은 보류 목록에 쌓이고 승리 시 applyVictory가 회수한다 (패배 시 소멸).
        case 'giveItem': {
          const name =
            (head.kind === 'equipment' ? EQUIPMENT[head.itemId]?.name : CONSUMABLES[head.itemId]?.name) ??
            head.itemId
          state.pendingRewards.push({ itemId: head.itemId, kind: head.kind })
          log(state, 'event', `${name}${objectParticle(name)} 손에 넣었다!`)
          pending.queue.shift()
          break
        }

        default:
          return prev // 즉시형이 헤드에 남아 있으면 안 된다 (방어)
      }

      // 잔여 즉시형 소화 → 큐 소진 시 pendingEvents에서 스스로 빠진다
      executeQueue(state, pending)
      break
    }
  }

  // 공통 후처리 — 이벤트 평가가 승패 판정보다 먼저다.
  // 표시 대기 이벤트가 남아 있으면 승패 판정을 보류한다 (오버레이 중 승패 배너 충돌 방지 +
  // 이벤트 액션이 승패 조건을 바꿀 수 있으므로 큐가 비었을 때 한 번에 판정).
  if (stage) {
    runEvents(state, stage, occurred)
    if (state.pendingEvents.length === 0) checkVictory(state, stage)
    // v1.3 — 승리 확정 직후 승리 이벤트(victory 트리거) 발화. 원작 "승리 후 전리품/대사" 표현
    // (kr-blog §R3 — 청주 도복 분기가 여기에 막혀 있었다). 전투당 1회 (firedEvents 가드).
    if (state.result === 'victory') runEvents(state, stage, [{ type: 'victory' }])
  }
  return state
}
