// 스테이지 JSON 검증기 — validateCampaign(app/persistence.ts) 패턴을 따른다.
// 외부에서 들어온 JSON(번들 스테이지 / 에디터 저장분 / 사용자가 붙여넣은 텍스트)은 신뢰할 수 없다.
// 구조 검사를 통과한 것만 StageDef로 돌려주고, 하나라도 어긋나면 null이다 (부분 복구 없음 —
// 반쯤 깨진 스테이지를 전투에 넣으면 리듀서가 어디서 터질지 모른다).
//
// 입력 스키마는 StageDef와 1:1이되 맵만 문자 그리드다: `map: { rows: string[] }`.
// (에디터 편의를 위해 이미 파싱된 `{ width, height, tiles }` 형태도 받는다 — 왕복 가능)
//
// 이벤트 전용 규칙 (v1.1):
//  - 이벤트 id는 스테이지 안에서 유일
//  - choice 중첩 금지 (선택지 안의 액션에 또 choice를 둘 수 없다)
//  - duel / unitsMeet / buff(개별 target) / giveExp가 참조하는 officerId는 스테이지 안에서
//    **유일한 유닛**이어야 한다 (westInfantry처럼 여러 번 배치된 몹은 어느 개체인지 정할 수 없다)
//  - setTile / reachArea 좌표는 맵 안
//  - loot의 allySurvived는 officerId 필수 (그 우군의 생존을 보는 조건이므로)

import type {
  BattleEventDef,
  DefeatCondition,
  DialogueLine,
  EventAction,
  EventTrigger,
  Faction,
  MapDef,
  ReinforcementDef,
  StageDef,
  StageUnitDef,
  StatusId,
  TerrainId,
  Vec2,
  VictoryCondition,
  Weather,
} from '../../core/types'
import { CONSUMABLES } from '../consumables'
import { EQUIPMENT } from '../equipment'
import { OFFICERS } from '../officers'
import { STATUSES } from '../statuses'
import { TERRAIN } from '../terrain'
import { mapToRows, parseMap } from './parseMap'

/** 장비 또는 도구로 등록된 아이템인가 — 전리품·드랍·맵 아이템 공용 검사 */
const knownItem = (itemId: string): boolean =>
  EQUIPMENT[itemId] !== undefined || CONSUMABLES[itemId] !== undefined

const FACTIONS = ['player', 'enemy', 'ally'] as const
const WEATHERS = ['clear', 'rain'] as const
const BUFF_STATS = ['atk', 'def', 'mind', 'agi', 'morale'] as const
const BEHAVIORS = ['guard', 'pursue'] as const
const EQUIP_SLOTS = ['weapon', 'armor', 'accessory'] as const
const LOOT_TRIGGERS = ['victory', 'bossKill', 'allySurvived'] as const
const ITEM_KINDS = ['equipment', 'consumable'] as const
/** 상태이상 id는 STATUSES(단일 출처)에서 파생한다 */
const STATUS_IDS = Object.keys(STATUSES)

/** 스테이지 JSON의 맵 표현 — 문자 그리드 (사람이 읽고 손으로 고칠 수 있는 형태) */
export interface StageMapJson {
  rows: string[]
}

/** 검증 결과 — 에디터가 사용자에게 보여줄 오류 목록을 함께 준다 */
export interface StageValidation {
  stage: StageDef | null
  errors: string[]
}

// ---------- 원시 검사 헬퍼 ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/**
 * 데이터를 StageDef로 검증한다. 오류 메시지까지 필요하면 validateStageVerbose를 쓴다.
 * 실패 시 null + (dev 환경) console.error.
 */
export function validateStage(data: unknown): StageDef | null {
  const { stage, errors } = validateStageVerbose(data)
  if (!stage) reportInvalidStage(errors)
  return stage
}

export function validateStageVerbose(data: unknown): StageValidation {
  const errors: string[] = []
  const fail = (msg: string): null => {
    errors.push(msg)
    return null
  }
  const done = (stage: StageDef | null): StageValidation => ({
    stage: errors.length === 0 ? stage : null,
    errors,
  })

  if (!isObject(data)) return done(fail('스테이지가 객체가 아니다'))
  const raw = data

  if (!isNonEmptyString(raw.id)) fail('id: 비어있지 않은 문자열이어야 한다')
  if (!isNonEmptyString(raw.name)) fail('name: 비어있지 않은 문자열이어야 한다')
  if (!isWeather(raw.weather)) fail(`weather: ${WEATHERS.join('|')} 중 하나여야 한다`)

  const map = parseMapField(raw.map, fail)
  if (!map) return done(null) // 맵이 없으면 좌표 검사를 할 수 없다 — 더 진행하지 않는다

  const inBounds = (pos: Vec2) => pos.x >= 0 && pos.y >= 0 && pos.x < map.width && pos.y < map.height

  const vec2 = (value: unknown, where: string): Vec2 | null => {
    if (!isObject(value)) return fail(`${where}: {x, y} 객체여야 한다`)
    if (!isInt(value.x) || !isInt(value.y)) return fail(`${where}: x/y가 정수여야 한다`)
    const pos = { x: value.x, y: value.y }
    if (!inBounds(pos)) return fail(`${where}: 좌표 (${pos.x},${pos.y})가 맵(${map.width}×${map.height}) 밖이다`)
    return pos
  }

  const vec2List = (value: unknown, where: string): Vec2[] | null => {
    if (!Array.isArray(value) || value.length === 0) return fail(`${where}: 비어있지 않은 좌표 배열이어야 한다`)
    const out: Vec2[] = []
    for (const [i, item] of value.entries()) {
      const pos = vec2(item, `${where}[${i}]`)
      if (pos) out.push(pos)
    }
    return out.length === value.length ? out : null
  }

  const officerIdField = (value: unknown, where: string): string | null => {
    if (!isNonEmptyString(value)) return fail(`${where}: 장수 id 문자열이어야 한다`)
    if (!OFFICERS[value]) return fail(`${where}: 등록되지 않은 장수 '${value}'`)
    return value
  }

  const stageUnit = (value: unknown, where: string): StageUnitDef | null => {
    if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
    const officerId = officerIdField(value.officerId, `${where}.officerId`)
    const faction = isFaction(value.faction) ? value.faction : fail(`${where}.faction: ${FACTIONS.join('|')}`)
    const pos = vec2(value.pos, `${where}.pos`)
    if (!officerId || !faction || !pos) return null

    const unit: StageUnitDef = { officerId, faction, pos }

    if (value.level !== undefined) {
      if (!isInt(value.level) || value.level < 1) return fail(`${where}.level: 1 이상 정수여야 한다`)
      unit.level = value.level
    }
    if (value.equipment !== undefined) {
      const equipment = equipmentInput(value.equipment, `${where}.equipment`)
      if (!equipment) return null
      unit.equipment = equipment
    }
    if (value.isLeader !== undefined) {
      if (typeof value.isLeader !== 'boolean') return fail(`${where}.isLeader: 불리언이어야 한다`)
      unit.isLeader = value.isLeader
    }
    if (value.isBoss !== undefined) {
      if (typeof value.isBoss !== 'boolean') return fail(`${where}.isBoss: 불리언이어야 한다`)
      unit.isBoss = value.isBoss
    }
    if (value.behavior !== undefined) {
      if (!isBehavior(value.behavior)) return fail(`${where}.behavior: ${BEHAVIORS.join('|')}`)
      unit.behavior = value.behavior
    }
    return unit
  }

  const equipmentInput = (value: unknown, where: string): StageUnitDef['equipment'] | null => {
    if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
    const out: Record<string, string | { itemId: string; level: number; exp: number }> = {}
    for (const [slot, item] of Object.entries(value)) {
      if (!(EQUIP_SLOTS as readonly string[]).includes(slot)) return fail(`${where}: 알 수 없는 슬롯 '${slot}'`)
      if (isNonEmptyString(item)) {
        out[slot] = item
        continue
      }
      if (
        isObject(item) &&
        isNonEmptyString(item.itemId) &&
        isInt(item.level) &&
        item.level >= 1 &&
        isInt(item.exp) &&
        item.exp >= 0
      ) {
        out[slot] = { itemId: item.itemId, level: item.level, exp: item.exp }
        continue
      }
      return fail(`${where}.${slot}: 장비 id 문자열이나 {itemId, level, exp} 인스턴스여야 한다`)
    }
    return out as StageUnitDef['equipment']
  }

  const unitList = (value: unknown, where: string, allowEmpty: boolean): StageUnitDef[] | null => {
    if (!Array.isArray(value)) return fail(`${where}: 배열이어야 한다`)
    if (!allowEmpty && value.length === 0) return fail(`${where}: 최소 1기가 필요하다`)
    const out: StageUnitDef[] = []
    for (const [i, item] of value.entries()) {
      const unit = stageUnit(item, `${where}[${i}]`)
      if (unit) out.push(unit)
    }
    return out.length === value.length ? out : null
  }

  // ---- units (초기 배치) ----
  const units = unitList(raw.units, 'units', false)
  if (units) {
    const seen = new Map<string, string>()
    for (const u of units) {
      const key = `${u.pos.x},${u.pos.y}`
      const prev = seen.get(key)
      if (prev) fail(`units: ${prev}와 ${u.officerId}가 같은 칸 (${key})에 겹쳐 있다`)
      else seen.set(key, u.officerId)
    }
  }

  // ---- victory ----
  const victory = victoryList(raw.victory, fail, vec2)

  // ---- reinforcements (StageDef 필수 필드지만, 생략은 빈 배열로 승계한다) ----
  const reinforcements: ReinforcementDef[] = []
  if (raw.reinforcements !== undefined) {
    if (!Array.isArray(raw.reinforcements)) {
      fail('reinforcements: 배열이어야 한다')
    } else {
      for (const [i, item] of raw.reinforcements.entries()) {
        const where = `reinforcements[${i}]`
        if (!isObject(item)) {
          fail(`${where}: 객체여야 한다`)
          continue
        }
        const trigger = reinforcementTrigger(item.trigger, `${where}.trigger`, fail)
        const waveUnits = unitList(item.units, `${where}.units`, false)
        if (trigger && waveUnits) reinforcements.push({ trigger, units: waveUnits })
      }
    }
  }

  // ---- 출진 준비 ----
  let playerSlots: Vec2[] | undefined
  let deployMin: number | undefined
  let deployMax: number | undefined
  let forcedOfficers: string[] | undefined
  if (raw.playerSlots !== undefined) {
    const slots = vec2List(raw.playerSlots, 'playerSlots')
    if (slots) {
      const seen = new Set<string>()
      for (const slot of slots) {
        const key = `${slot.x},${slot.y}`
        if (seen.has(key)) fail(`playerSlots: 좌표 중복 (${key})`)
        seen.add(key)
        if (TERRAIN[map.tiles[slot.y][slot.x]].cost.foot === null) {
          fail(`playerSlots: (${key})는 보행 진입 불가 지형(${map.tiles[slot.y][slot.x]})이다`)
        }
      }
      playerSlots = slots
    }
    if (!isInt(raw.deployMin) || raw.deployMin < 1) fail('deployMin: playerSlots가 있으면 1 이상 정수 필수')
    else deployMin = raw.deployMin
    if (!isInt(raw.deployMax) || raw.deployMax < 1) fail('deployMax: playerSlots가 있으면 1 이상 정수 필수')
    else deployMax = raw.deployMax
    if (deployMin !== undefined && deployMax !== undefined && deployMin > deployMax) {
      fail(`deployMin(${deployMin}) > deployMax(${deployMax})`)
    }
    if (deployMax !== undefined && playerSlots && deployMax > playerSlots.length) {
      fail(`deployMax(${deployMax})가 슬롯 수(${playerSlots.length})보다 많다`)
    }
  } else {
    for (const key of ['deployMin', 'deployMax'] as const) {
      if (raw[key] !== undefined) fail(`${key}: playerSlots 없이는 쓸 수 없다`)
    }
  }
  if (raw.forcedOfficers !== undefined) {
    if (!Array.isArray(raw.forcedOfficers)) fail('forcedOfficers: 배열이어야 한다')
    else {
      const ids: string[] = []
      for (const [i, id] of raw.forcedOfficers.entries()) {
        const officerId = officerIdField(id, `forcedOfficers[${i}]`)
        if (officerId) ids.push(officerId)
      }
      if (ids.length === raw.forcedOfficers.length) forcedOfficers = ids
    }
  }

  // ---- bonusExp ----
  let bonusExp: number | undefined
  if (raw.bonusExp !== undefined) {
    if (!isInt(raw.bonusExp) || raw.bonusExp <= 0) fail('bonusExp: 1 이상 정수여야 한다')
    else bonusExp = raw.bonusExp
  }

  // ---- 이벤트/전리품이 참조하는 유닛의 유일성 검사 (스테이지 전체 유닛 풀 기준) ----
  const unitPool: string[] = [
    ...(units ?? []).map((u) => u.officerId),
    ...reinforcements.flatMap((r) => r.units.map((u) => u.officerId)),
  ]
  const uniqueRefChecks: { officerId: string; where: string }[] = []
  const uniqueRef = (value: unknown, where: string): string | null => {
    const officerId = officerIdField(value, where)
    if (!officerId) return null
    uniqueRefChecks.push({ officerId, where })
    return officerId
  }

  // ---- defeat (v1.2) — 주인공 격파는 엔진 기본이라 명시하지 않는다 ----
  const defeat = raw.defeat === undefined ? undefined : defeatList(raw.defeat, 'defeat', fail, uniqueRef)
  if (defeat && victory) {
    // surviveTurns(N턴 버티면 승리)와 turnLimit(N턴 넘기면 패배)이 함께 있으면 판정이 모호해진다
    const survive = victory.some((v) => v.type === 'surviveTurns')
    const limited = defeat.some((d) => d.type === 'turnLimit')
    if (survive && limited) fail('defeat: victory에 surviveTurns가 있으면 turnLimit을 함께 둘 수 없다')
  }

  // ---- groundItems (v1.2) — 맵에 놓인 아이템. 아군이 그 칸에 서면 회수한다 ----
  let groundItems: StageDef['groundItems']
  if (raw.groundItems !== undefined) {
    if (!Array.isArray(raw.groundItems)) {
      fail('groundItems: 배열이어야 한다')
    } else {
      const entries: NonNullable<StageDef['groundItems']> = []
      for (const [i, item] of raw.groundItems.entries()) {
        const where = `groundItems[${i}]`
        if (!isObject(item)) {
          fail(`${where}: 객체여야 한다`)
          continue
        }
        const pos = vec2(item.pos, `${where}.pos`)
        if (!pos) continue
        if (!isNonEmptyString(item.itemId)) {
          fail(`${where}.itemId: 문자열이어야 한다`)
          continue
        }
        if (!knownItem(item.itemId)) {
          fail(`${where}.itemId: 등록되지 않은 아이템 '${item.itemId}'`)
          continue
        }
        entries.push({ pos, itemId: item.itemId })
      }
      if (entries.length === raw.groundItems.length) groundItems = entries
    }
  }

  // ---- loot ----
  let loot: StageDef['loot']
  if (raw.loot !== undefined) {
    if (!Array.isArray(raw.loot)) {
      fail('loot: 배열이어야 한다')
    } else {
      const entries: NonNullable<StageDef['loot']> = []
      for (const [i, item] of raw.loot.entries()) {
        const where = `loot[${i}]`
        if (!isObject(item)) {
          fail(`${where}: 객체여야 한다`)
          continue
        }
        if (!isLootTrigger(item.trigger)) {
          fail(`${where}.trigger: ${LOOT_TRIGGERS.join('|')}`)
          continue
        }
        if (!isNonEmptyString(item.itemId)) {
          fail(`${where}.itemId: 문자열이어야 한다`)
          continue
        }
        if (item.trigger === 'allySurvived') {
          const officerId = uniqueRef(item.officerId, `${where}.officerId (allySurvived 필수)`)
          if (!officerId) continue
          entries.push({ trigger: item.trigger, itemId: item.itemId, officerId })
          continue
        }
        if (item.officerId !== undefined) fail(`${where}.officerId: allySurvived 전용 필드다`)
        entries.push({ trigger: item.trigger, itemId: item.itemId })
      }
      if (entries.length === raw.loot.length) loot = entries
    }
  }

  // ---- events ----
  let events: BattleEventDef[] | undefined
  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events)) {
      fail('events: 배열이어야 한다')
    } else {
      const seenIds = new Set<string>()
      const parsed: BattleEventDef[] = []
      for (const [i, item] of raw.events.entries()) {
        const where = `events[${i}]`
        if (!isObject(item)) {
          fail(`${where}: 객체여야 한다`)
          continue
        }
        if (!isNonEmptyString(item.id)) {
          fail(`${where}.id: 비어있지 않은 문자열이어야 한다`)
          continue
        }
        if (seenIds.has(item.id)) fail(`${where}.id: 이벤트 id '${item.id}' 중복 (스테이지 안에서 유일해야 한다)`)
        seenIds.add(item.id)
        const trigger = eventTrigger(item.trigger, `${where}(${item.id}).trigger`)
        const actions = eventActions(item.actions, `${where}(${item.id}).actions`, true)
        if (trigger && actions) parsed.push({ id: item.id, trigger, actions })
      }
      if (parsed.length === raw.events.length) events = parsed
    }
  }

  function eventTrigger(value: unknown, where: string): EventTrigger | null {
    if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
    switch (value.type) {
      case 'battleStart':
        return { type: 'battleStart' }
      case 'turnStart':
        if (!isInt(value.turn) || value.turn < 1) return fail(`${where}.turn: 1 이상 정수여야 한다`)
        return { type: 'turnStart', turn: value.turn }
      case 'unitDefeated': {
        const officerId = uniqueRef(value.officerId, `${where}.officerId`)
        return officerId ? { type: 'unitDefeated', officerId } : null
      }
      case 'unitsMeet': {
        const a = uniqueRef(value.a, `${where}.a`)
        const b = uniqueRef(value.b, `${where}.b`)
        if (!a || !b) return null
        if (a === b) return fail(`${where}: a와 b가 같은 장수다`)
        return { type: 'unitsMeet', a, b }
      }
      case 'reachArea': {
        const area = vec2List(value.area, `${where}.area`)
        if (!isFaction(value.faction)) return fail(`${where}.faction: ${FACTIONS.join('|')}`)
        let count: number | undefined
        if (value.count !== undefined) {
          if (!isInt(value.count) || value.count < 1) return fail(`${where}.count: 1 이상 정수여야 한다`)
          count = value.count
        }
        if (!area) return null
        return { type: 'reachArea', area, faction: value.faction, ...(count !== undefined ? { count } : {}) }
      }
      default:
        return fail(`${where}.type: 알 수 없는 트리거 '${String(value.type)}'`)
    }
  }

  function eventActions(value: unknown, where: string, allowChoice: boolean): EventAction[] | null {
    if (!Array.isArray(value) || value.length === 0) return fail(`${where}: 최소 1개의 액션이 필요하다`)
    const out: EventAction[] = []
    for (const [i, item] of value.entries()) {
      const action = eventAction(item, `${where}[${i}]`, allowChoice)
      if (action) out.push(action)
    }
    return out.length === value.length ? out : null
  }

  function eventAction(value: unknown, where: string, allowChoice: boolean): EventAction | null {
    if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
    switch (value.type) {
      case 'dialogue': {
        const lines = dialogueLines(value.lines, `${where}.lines`)
        return lines ? { type: 'dialogue', lines } : null
      }
      case 'choice': {
        if (!allowChoice) return fail(`${where}: choice는 중첩할 수 없다 (선택지 안의 선택지 금지)`)
        if (!isNonEmptyString(value.prompt)) return fail(`${where}.prompt: 문자열이어야 한다`)
        const speaker = speakerField(value.speaker, `${where}.speaker`)
        if (speaker === INVALID) return null
        if (!Array.isArray(value.options) || value.options.length === 0) {
          return fail(`${where}.options: 최소 1개의 선택지가 필요하다`)
        }
        const options: { text: string; actions: EventAction[] }[] = []
        for (const [i, opt] of value.options.entries()) {
          const optWhere = `${where}.options[${i}]`
          if (!isObject(opt)) {
            fail(`${optWhere}: 객체여야 한다`)
            continue
          }
          if (!isNonEmptyString(opt.text)) {
            fail(`${optWhere}.text: 문자열이어야 한다`)
            continue
          }
          const actions = eventActions(opt.actions, `${optWhere}.actions`, false)
          if (actions) options.push({ text: opt.text, actions })
        }
        if (options.length !== value.options.length) return null
        return { type: 'choice', prompt: value.prompt, speaker, options }
      }
      case 'duel': {
        const a = uniqueRef(value.a, `${where}.a`)
        const b = uniqueRef(value.b, `${where}.b`)
        const lines = dialogueLines(value.lines, `${where}.lines`)
        const outcome = duelOutcome(value.outcome, `${where}.outcome`)
        if (!a || !b || !lines || !outcome) return null
        if (a === b) return fail(`${where}: a와 b가 같은 장수다`)
        return { type: 'duel', a, b, lines, outcome }
      }
      case 'buff': {
        if (value.target !== 'playerAll') {
          const target = uniqueRef(value.target, `${where}.target`)
          if (!target) return null
        }
        if (!isBuffStat(value.stat)) return fail(`${where}.stat: ${BUFF_STATS.join('|')}`)
        if (typeof value.amount !== 'number' || !Number.isFinite(value.amount)) {
          return fail(`${where}.amount: 유한한 수여야 한다`)
        }
        if (!isInt(value.duration) || value.duration < 1) return fail(`${where}.duration: 1 이상 정수여야 한다`)
        return {
          type: 'buff',
          target: value.target as string,
          stat: value.stat,
          amount: value.amount,
          duration: value.duration,
        }
      }
      case 'spawnUnits': {
        const spawned = unitList(value.units, `${where}.units`, false)
        if (!spawned) return null
        unitPool.push(...spawned.map((u) => u.officerId))
        return { type: 'spawnUnits', units: spawned }
      }
      case 'removeUnits': {
        // 몹 단위 이탈(청주 권항책 등)이 정상 용례라 유일성은 요구하지 않는다
        const ids = officerIdList(value.officerIds, `${where}.officerIds`)
        return ids ? { type: 'removeUnits', officerIds: ids } : null
      }
      case 'inflictStatus': {
        // 스크립트 부여는 확정(명중 판정 없음)이고 몹 일괄이 정상 용례라 유일성은 요구하지 않는다
        const ids = officerIdList(value.officerIds, `${where}.officerIds`)
        if (!isStatusId(value.status)) return fail(`${where}.status: ${STATUS_IDS.join('|')}`)
        return ids ? { type: 'inflictStatus', officerIds: ids, status: value.status } : null
      }
      case 'setBehavior': {
        // officerIds 생략 = 생존 적 전원 (원작: 퇴각 선택 후 적 전체가 주인공을 추격)
        if (!isBehavior(value.behavior)) return fail(`${where}.behavior: ${BEHAVIORS.join('|')}`)
        if (value.officerIds === undefined) return { type: 'setBehavior', behavior: value.behavior }
        const ids = officerIdList(value.officerIds, `${where}.officerIds`)
        return ids ? { type: 'setBehavior', officerIds: ids, behavior: value.behavior } : null
      }
      case 'setTile': {
        const cells = vec2List(value.cells, `${where}.cells`)
        if (!isTerrainId(value.terrain)) return fail(`${where}.terrain: 알 수 없는 지형 '${String(value.terrain)}'`)
        return cells ? { type: 'setTile', cells, terrain: value.terrain } : null
      }
      case 'levelUpEnemies': {
        if (!isInt(value.amount) || value.amount < 1) return fail(`${where}.amount: 1 이상 정수여야 한다`)
        if (value.officerIds === undefined) return { type: 'levelUpEnemies', amount: value.amount }
        const ids = officerIdList(value.officerIds, `${where}.officerIds`)
        return ids ? { type: 'levelUpEnemies', amount: value.amount, officerIds: ids } : null
      }
      case 'giveItem': {
        if (!isNonEmptyString(value.itemId)) return fail(`${where}.itemId: 문자열이어야 한다`)
        if (!isItemKind(value.kind)) return fail(`${where}.kind: ${ITEM_KINDS.join('|')}`)
        return { type: 'giveItem', itemId: value.itemId, kind: value.kind }
      }
      case 'giveGold': {
        if (!isInt(value.amount) || value.amount < 1) return fail(`${where}.amount: 1 이상 정수여야 한다`)
        return { type: 'giveGold', amount: value.amount }
      }
      case 'setVictory': {
        const next = victoryList(value.victory, fail, vec2, `${where}.victory`)
        return next ? { type: 'setVictory', victory: next } : null
      }
      case 'setDefeat': {
        const next = defeatList(value.defeat, `${where}.defeat`, fail, uniqueRef)
        return next ? { type: 'setDefeat', defeat: next } : null
      }
      case 'setHazard': {
        const cells = vec2List(value.cells, `${where}.cells`)
        if (value.kind !== 'fire') return fail(`${where}.kind: 'fire'만 지원한다`)
        if (!isInt(value.duration) || value.duration < 1) return fail(`${where}.duration: 1 이상 정수여야 한다`)
        return cells ? { type: 'setHazard', cells, kind: 'fire', duration: value.duration } : null
      }
      case 'dropItem': {
        if (!isNonEmptyString(value.itemId)) return fail(`${where}.itemId: 문자열이어야 한다`)
        if (!knownItem(value.itemId)) return fail(`${where}.itemId: 등록되지 않은 아이템 '${value.itemId}'`)
        const hasPos = value.pos !== undefined
        const hasOfficer = value.officerId !== undefined
        if (hasPos === hasOfficer) return fail(`${where}: pos 또는 officerId 중 정확히 하나가 필요하다`)
        if (hasPos) {
          const pos = vec2(value.pos, `${where}.pos`)
          return pos ? { type: 'dropItem', itemId: value.itemId, pos } : null
        }
        const officerId = officerIdField(value.officerId, `${where}.officerId`)
        return officerId ? { type: 'dropItem', itemId: value.itemId, officerId } : null
      }
      case 'giveExp': {
        const target = officerIdField(value.target, `${where}.target`)
        if (!isInt(value.amount) || value.amount < 1) return fail(`${where}.amount: 1 이상 정수여야 한다`)
        return target ? { type: 'giveExp', target, amount: value.amount } : null
      }
      default:
        return fail(`${where}.type: 알 수 없는 액션 '${String(value.type)}'`)
    }
  }

  function officerIdList(value: unknown, where: string): string[] | null {
    if (!Array.isArray(value) || value.length === 0) return fail(`${where}: 최소 1명이 필요하다`)
    const out: string[] = []
    for (const [i, id] of value.entries()) {
      const officerId = officerIdField(id, `${where}[${i}]`)
      if (officerId) out.push(officerId)
    }
    return out.length === value.length ? out : null
  }

  function dialogueLines(value: unknown, where: string): DialogueLine[] | null {
    if (!Array.isArray(value) || value.length === 0) return fail(`${where}: 최소 1줄이 필요하다`)
    const out: DialogueLine[] = []
    for (const [i, item] of value.entries()) {
      const lineWhere = `${where}[${i}]`
      if (!isObject(item)) {
        fail(`${lineWhere}: 객체여야 한다`)
        continue
      }
      const speaker = speakerField(item.speaker, `${lineWhere}.speaker`)
      if (speaker === INVALID) continue
      if (typeof item.text !== 'string' || item.text.length === 0) {
        fail(`${lineWhere}.text: 비어있지 않은 문자열이어야 한다`)
        continue
      }
      out.push({ speaker, text: item.text })
    }
    return out.length === value.length ? out : null
  }

  /** 화자 — null은 내레이션. 문자열이면 등록된 장수여야 한다 */
  function speakerField(value: unknown, where: string): string | null | typeof INVALID {
    if (value === null) return null
    if (!isNonEmptyString(value)) {
      fail(`${where}: 장수 id 또는 null(내레이션)이어야 한다`)
      return INVALID
    }
    if (!OFFICERS[value]) {
      fail(`${where}: 등록되지 않은 장수 '${value}'`)
      return INVALID
    }
    return value
  }

  function duelOutcome(value: unknown, where: string): { winner: 'a' | 'b'; loserFate: 'die' | 'retreat' } | { draw: true } | null {
    if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
    if (value.draw === true) return { draw: true }
    if (value.winner !== 'a' && value.winner !== 'b') return fail(`${where}.winner: 'a' 또는 'b' (또는 draw: true)`)
    if (value.loserFate !== 'die' && value.loserFate !== 'retreat') return fail(`${where}.loserFate: die|retreat`)
    return { winner: value.winner, loserFate: value.loserFate }
  }

  // 유일성 지연 검사 — spawnUnits까지 모두 훑은 뒤에 판정한다
  for (const check of uniqueRefChecks) {
    const count = unitPool.filter((id) => id === check.officerId).length
    if (count === 1) continue
    if (count === 0) fail(`${check.where}: '${check.officerId}'가 이 스테이지에 배치돼 있지 않다`)
    else fail(`${check.where}: '${check.officerId}'가 ${count}기 배치돼 있다 — 참조는 유일 유닛만 가능하다`)
  }

  if (errors.length > 0) return done(null)
  if (!units || !victory) return done(null) // 여기 오면 이미 fail이 있어야 하지만 타입상 방어

  const stage: StageDef = {
    id: raw.id as string,
    name: raw.name as string,
    weather: raw.weather as Weather,
    map,
    units,
    victory,
    reinforcements,
    ...(playerSlots ? { playerSlots } : {}),
    ...(deployMin !== undefined ? { deployMin } : {}),
    ...(deployMax !== undefined ? { deployMax } : {}),
    ...(forcedOfficers ? { forcedOfficers } : {}),
    ...(bonusExp !== undefined ? { bonusExp } : {}),
    ...(defeat ? { defeat } : {}),
    ...(groundItems ? { groundItems } : {}),
    ...(loot ? { loot } : {}),
    ...(events ? { events } : {}),
  }
  return done(stage)
}

/** speakerField의 "검증 실패" 표식 — null(내레이션)과 구분해야 한다 */
const INVALID = Symbol('invalid')

// ---------- 유니온 판별 ----------

const isFaction = (v: unknown): v is Faction => (FACTIONS as readonly unknown[]).includes(v)
const isWeather = (v: unknown): v is Weather => (WEATHERS as readonly unknown[]).includes(v)
const isBehavior = (v: unknown): v is 'guard' | 'pursue' => (BEHAVIORS as readonly unknown[]).includes(v)
const isBuffStat = (v: unknown): v is (typeof BUFF_STATS)[number] => (BUFF_STATS as readonly unknown[]).includes(v)
const isLootTrigger = (v: unknown): v is (typeof LOOT_TRIGGERS)[number] =>
  (LOOT_TRIGGERS as readonly unknown[]).includes(v)
const isItemKind = (v: unknown): v is (typeof ITEM_KINDS)[number] => (ITEM_KINDS as readonly unknown[]).includes(v)
const isTerrainId = (v: unknown): v is TerrainId => typeof v === 'string' && v in TERRAIN
const isStatusId = (v: unknown): v is StatusId => typeof v === 'string' && v in STATUSES

// ---------- 맵 / 승리조건 / 증원 트리거 ----------

function parseMapField(value: unknown, fail: (msg: string) => null): MapDef | null {
  if (!isObject(value)) return fail('map: {rows: string[]} 객체여야 한다')
  // JSON 스키마 — 문자 그리드
  if (value.rows !== undefined) {
    if (!Array.isArray(value.rows) || value.rows.length === 0) return fail('map.rows: 비어있지 않은 배열이어야 한다')
    if (!value.rows.every((r) => typeof r === 'string')) return fail('map.rows: 모든 행이 문자열이어야 한다')
    try {
      return parseMap(value.rows as string[])
    } catch (e) {
      return fail(`map.rows: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // 이미 파싱된 MapDef — 에디터 초안이 그대로 들어올 수 있다
  if (Array.isArray(value.tiles)) {
    const height = value.tiles.length
    if (height === 0) return fail('map.tiles: 비어있지 않은 배열이어야 한다')
    if (value.height !== undefined && value.height !== height) return fail('map.height가 tiles 행 수와 다르다')
    for (const row of value.tiles) {
      if (!Array.isArray(row) || !row.every((t) => isTerrainId(t))) {
        return fail('map.tiles: 지형 id 2차원 배열이어야 한다')
      }
    }
    const tiles = value.tiles as TerrainId[][]
    const map = { width: tiles[0].length, height, tiles }
    if (value.width !== undefined && value.width !== map.width) return fail('map.width가 tiles 열 수와 다르다')
    try {
      return parseMap(mapToRows(map)) // 직사각형·문자 유효성 검사를 그대로 재사용
    } catch (e) {
      return fail(`map.tiles: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return fail('map: rows(문자 그리드) 또는 tiles(지형 id 배열)가 필요하다')
}

function victoryList(
  value: unknown,
  fail: (msg: string) => null,
  vec2: (value: unknown, where: string) => Vec2 | null,
  label = 'victory',
): VictoryCondition[] | null {
  if (!Array.isArray(value) || value.length === 0) return fail(`${label}: 최소 1개의 승리조건이 필요하다`)
  const out: VictoryCondition[] = []
  for (const [i, item] of value.entries()) {
    const where = `${label}[${i}]`
    if (!isObject(item)) {
      fail(`${where}: 객체여야 한다`)
      continue
    }
    switch (item.type) {
      case 'annihilation':
        out.push({ type: 'annihilation' })
        break
      case 'defeatBoss':
        out.push({ type: 'defeatBoss' })
        break
      case 'reachPoint': {
        const pos = vec2(item.pos, `${where}.pos`)
        if (!pos) break
        if (item.unitId !== undefined && !isNonEmptyString(item.unitId)) {
          fail(`${where}.unitId: 문자열이어야 한다`)
          break
        }
        out.push({ type: 'reachPoint', pos, ...(item.unitId ? { unitId: item.unitId as string } : {}) })
        break
      }
      case 'surviveTurns': {
        if (!isInt(item.turns) || item.turns < 1) {
          fail(`${where}.turns: 1 이상 정수여야 한다`)
          break
        }
        out.push({ type: 'surviveTurns', turns: item.turns })
        break
      }
      default:
        fail(`${where}.type: 알 수 없는 승리조건 '${String(item.type)}'`)
    }
  }
  return out.length === value.length ? out : null
}

/**
 * 패배 조건 목록 (v1.2). 스테이지 defeat와 setDefeat 액션이 공용한다.
 * turnLimit은 최대 1개 — 두 개면 어느 쪽이 유효한지 모호하다.
 */
function defeatList(
  value: unknown,
  label: string,
  fail: (msg: string) => null,
  uniqueRef: (value: unknown, where: string) => string | null,
): DefeatCondition[] | null {
  if (!Array.isArray(value) || value.length === 0) return fail(`${label}: 최소 1개의 패배조건이 필요하다`)
  const out: DefeatCondition[] = []
  let turnLimits = 0
  for (const [i, item] of value.entries()) {
    const where = `${label}[${i}]`
    if (!isObject(item)) {
      fail(`${where}: 객체여야 한다`)
      continue
    }
    switch (item.type) {
      case 'turnLimit': {
        if (!isInt(item.turns) || item.turns < 1) {
          fail(`${where}.turns: 1 이상 정수여야 한다`)
          break
        }
        turnLimits += 1
        if (turnLimits > 1) {
          fail(`${label}: turnLimit은 하나만 둘 수 있다`)
          break
        }
        out.push({ type: 'turnLimit', turns: item.turns })
        break
      }
      case 'unitDies': {
        // 호위 대상은 유일 유닛이어야 한다 (몹이면 "누가 죽어도 패배"가 되어 모호하다)
        const officerId = uniqueRef(item.officerId, `${where}.officerId`)
        if (!officerId) break
        out.push({ type: 'unitDies', officerId })
        break
      }
      default:
        fail(`${where}.type: 알 수 없는 패배조건 '${String(item.type)}'`)
    }
  }
  return out.length === value.length ? out : null
}

function reinforcementTrigger(
  value: unknown,
  where: string,
  fail: (msg: string) => null,
): ReinforcementDef['trigger'] | null {
  if (!isObject(value)) return fail(`${where}: 객체여야 한다`)
  if (value.type === 'turnStart') {
    if (!isInt(value.turn) || value.turn < 1) return fail(`${where}.turn: 1 이상 정수여야 한다`)
    return { type: 'turnStart', turn: value.turn }
  }
  if (value.type === 'unitDefeated') {
    if (!isNonEmptyString(value.unitId)) return fail(`${where}.unitId: 문자열이어야 한다`)
    return { type: 'unitDefeated', unitId: value.unitId }
  }
  return fail(`${where}.type: turnStart|unitDefeated 중 하나여야 한다`)
}

// ---------- StageDef → JSON (에디터 내보내기 / 이관 스크립트 공용) ----------

/** JSON 필드 순서를 한 곳에서 정한다 — 사람이 읽는 파일이므로 순서가 일정해야 한다 */
export function stageToJson(stage: StageDef, notes?: string): Record<string, unknown> {
  return {
    id: stage.id,
    name: stage.name,
    weather: stage.weather,
    ...(notes ? { notes } : {}),
    map: { rows: mapToRows(stage.map) } satisfies StageMapJson,
    ...(stage.playerSlots ? { playerSlots: stage.playerSlots } : {}),
    ...(stage.deployMin !== undefined ? { deployMin: stage.deployMin } : {}),
    ...(stage.deployMax !== undefined ? { deployMax: stage.deployMax } : {}),
    ...(stage.forcedOfficers ? { forcedOfficers: stage.forcedOfficers } : {}),
    units: stage.units.map(unitToJson),
    victory: stage.victory,
    ...(stage.bonusExp !== undefined ? { bonusExp: stage.bonusExp } : {}),
    ...(stage.defeat ? { defeat: stage.defeat } : {}),
    reinforcements: stage.reinforcements.map((r) => ({ trigger: r.trigger, units: r.units.map(unitToJson) })),
    ...(stage.groundItems ? { groundItems: stage.groundItems } : {}),
    ...(stage.loot ? { loot: stage.loot } : {}),
    ...(stage.events ? { events: stage.events } : {}),
  }
}

function unitToJson(unit: StageUnitDef): Record<string, unknown> {
  return {
    officerId: unit.officerId,
    faction: unit.faction,
    pos: unit.pos,
    ...(unit.level !== undefined ? { level: unit.level } : {}),
    ...(unit.equipment ? { equipment: unit.equipment } : {}),
    ...(unit.isLeader !== undefined ? { isLeader: unit.isLeader } : {}),
    ...(unit.isBoss !== undefined ? { isBoss: unit.isBoss } : {}),
    ...(unit.behavior ? { behavior: unit.behavior } : {}),
  }
}

// ---------- dev 진단 ----------

/**
 * dev 빌드에서만 무엇이 틀렸는지 알린다 (프로덕션은 조용히 드롭 — 사용자에게 스택을 보이지 않는다).
 * 테스트(MODE=test)에서는 침묵한다 — 검증기 자체를 테스트할 때 출력이 도배되는 것을 막는다.
 */
export function reportInvalidStage(errors: string[], context?: string): void {
  const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env
  if (!env?.DEV || env.MODE === 'test') return
  console.error(`[validateStage] 스테이지 거부${context ? ` (${context})` : ''}:\n - ${errors.join('\n - ')}`)
}
