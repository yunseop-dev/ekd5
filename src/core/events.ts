// 전투 내 이벤트 엔진 (v1.1).
// 설계: 액션 처리 중 이산 사건(occurred)을 수집해 applyAction 공통 후처리에서 일괄 평가한다.
// 즉시형 액션(buff/spawn/remove/setBehavior/setTile/levelUpEnemies/giveItem/giveExp)은 그 자리에서
// 실행하고, 표시형(dialogue/choice/duel)을 만나면 잔여 큐를 state.pendingEvents에 쌓고 정지한다.
// UI/시뮬은 eventContinue 액션으로 큐를 소비한다 (표시형 소비는 battle.ts의 eventContinue case).
//
// 이 모듈은 battle.ts와 순환 import 관계다 (battle → events: runEvents/executeQueue,
// events → battle: applyAction). 양쪽 모두 **함수 선언**만 참조하고 모듈 초기화 시점에
// 호출하지 않으므로 ESM 호이스팅으로 안전하다.

import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { statusName } from '../data/statuses'
import { TERRAIN } from '../data/terrain'
import { applyAction, hazardAt, isImpassableTerrain } from './battle'
import { itemKindOf, toEquipmentMap } from './campaign'
import { applyExp, maxHp, maxMp } from './formulas'
import { chebyshev } from './movement'
import type {
  BattleState,
  BuffStat,
  EventAction,
  EventTrigger,
  PendingEvent,
  StageDef,
  StageUnitDef,
  UnitState,
  Vec2,
} from './types'
import { MAX_LEVEL } from './types'

/** 액션 처리 중 발생한 이산 사건 — 위치 트리거(unitsMeet/reachArea)는 매번 전수 평가라 수집 불필요 */
export type OccurredEvent =
  | { type: 'battleStart' }
  | { type: 'turnStart'; turn: number }
  | { type: 'unitDefeated'; officerId: string }

// ---------- 내부 유틸 ----------

/** 이벤트 로그 — 즉시형 액션이 남기는 흔적. UI 로그 diff 파이프라인이 자동 표시한다 */
function log(state: BattleState, message: string, detail?: { targetId?: string; amount?: number }): void {
  state.log.push({ type: 'event', message, ...detail })
}

const nameOfOfficer = (officerId: string): string => OFFICERS[officerId]?.name ?? officerId

const nameOf = (unit: UnitState): string => nameOfOfficer(unit.officerId)

/** officerId로 생존 유닛 1기 조회 — 이벤트의 유닛 참조는 전부 officerId다 (스테이지 내 유일 전제) */
export function livingByOfficer(state: BattleState, officerId: string): UnitState | undefined {
  return state.units.find((u) => u.hp > 0 && u.officerId === officerId)
}

/** 한글 주격 조사 — 받침 있으면 '이', 없으면 '가' (battle.ts와 같은 규칙) */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '이(가)'
  return (code - 0xac00) % 28 === 0 ? '가' : '이'
}

/** 한글 목적격 조사 — 받침 있으면 '을', 없으면 '를' (battle.ts와 같은 규칙) */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '을(를)'
  return (code - 0xac00) % 28 === 0 ? '를' : '을'
}

/** 아이템 표시명 — 장비/도구 어느 레지스트리에 있든 이름을 찾는다 (없으면 id) */
const itemName = (itemId: string): string =>
  EQUIPMENT[itemId]?.name ?? CONSUMABLES[itemId]?.name ?? itemId

const sameCell = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y

const occupied = (state: BattleState, pos: Vec2): boolean =>
  state.units.some((u) => u.hp > 0 && sameCell(u.pos, pos))

const BUFF_STAT_LABEL: Record<BuffStat, string> = {
  atk: '공격력',
  def: '방어력',
  mind: '정신력',
  agi: '순발력',
  morale: '사기',
}

/**
 * 표시형 액션 = UI가 재생하고 eventContinue로 소비하는 액션.
 * v1.2에서 giveItem이 승격됐다 — 「{아이템}을(를) 손에 넣었습니다!」 모달이 원작 연출이라
 * 큐 헤드로 남겨두고 정지하며, 실제 적재는 battle.ts의 eventContinue가 한다.
 */
function isDisplayAction(action: EventAction): boolean {
  return (
    action.type === 'dialogue' ||
    action.type === 'choice' ||
    action.type === 'duel' ||
    action.type === 'giveItem'
  )
}

// ---------- 스폰 (증원/spawnUnits 공용) ----------

/**
 * 스테이지 유닛 정의 1기를 전장에 투입한다 (증원·spawnUnits 공용 경로).
 * 자리가 막혀 있으면 등장을 개별 취소하고 false를 반환한다 (기존 증원 시맨틱 유지).
 */
export function spawnStageUnit(state: BattleState, def: StageUnitDef, id: string): boolean {
  if (occupied(state, def.pos)) return false
  const officer = OFFICERS[def.officerId]
  if (!officer) return false
  const cls = CLASSES[officer.classId]
  const level = def.level ?? officer.level
  state.units.push({
    id,
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
  return true
}

// ---------- 트리거 판정 ----------

function triggerMatches(state: BattleState, trigger: EventTrigger, occurred: OccurredEvent[]): boolean {
  switch (trigger.type) {
    case 'battleStart':
      return occurred.some((o) => o.type === 'battleStart')
    case 'turnStart':
      return occurred.some((o) => o.type === 'turnStart' && o.turn === trigger.turn)
    case 'unitDefeated':
      return occurred.some((o) => o.type === 'unitDefeated' && o.officerId === trigger.officerId)
    case 'unitsMeet': {
      // 체비쇼프 거리 1 = 인접 8방(대각 포함). 두 유닛 모두 생존해 있어야 한다.
      const a = livingByOfficer(state, trigger.a)
      const b = livingByOfficer(state, trigger.b)
      if (!a || !b || a.id === b.id) return false
      return chebyshev(a.pos, b.pos) <= 1
    }
    case 'reachArea': {
      const need = trigger.count ?? 1
      const on = state.units.filter(
        (u) => u.hp > 0 && u.faction === trigger.faction && trigger.area.some((c) => sameCell(c, u.pos)),
      ).length
      return on >= need
    }
  }
}

// ---------- 실행 ----------

/**
 * 미발동 이벤트 중 트리거가 맞는 것을 정의 순서대로 발동한다 (firedEvents 갱신 + 즉시형 실행 +
 * 표시형에서 pendingEvents 적재). applyAction 공통 후처리와 startBattle(battleStart)에서 호출.
 * 복수 동시 발동은 pendingEvents에 정의 순서대로 쌓이고 FIFO로 소비된다.
 */
export function runEvents(state: BattleState, stage: StageDef, occurred: OccurredEvent[]): void {
  const events = stage.events
  if (!events || events.length === 0) return
  for (const def of events) {
    if (state.firedEvents.includes(def.id)) continue
    // 위치 트리거는 매번 전수 평가한다 — 직전 이벤트가 만든 상태 변화(스폰/제거/성문)도 즉시 포착된다
    if (!triggerMatches(state, def.trigger, occurred)) continue
    state.firedEvents.push(def.id)
    // 스테이지 정의(모듈 상수) 비오염 — 큐는 언제나 딥클론 사본이다
    executeQueue(state, { eventId: def.id, queue: structuredClone(def.actions) })
  }
}

/**
 * 큐 앞에서부터 즉시형 액션을 실행·소비하고, 표시형을 만나면 잔여 큐를 pendingEvents에 남기고 정지한다.
 * 큐가 소진되면 pendingEvents에서 스스로 빠진다 (참조 동일성 기준 — pending은 state 소유 객체).
 */
export function executeQueue(state: BattleState, pending: PendingEvent): void {
  while (pending.queue.length > 0) {
    const action = pending.queue[0]
    if (isDisplayAction(action)) {
      if (!state.pendingEvents.includes(pending)) state.pendingEvents.push(pending)
      return
    }
    pending.queue.shift()
    runImmediate(state, pending.eventId, action)
  }
  const idx = state.pendingEvents.indexOf(pending)
  if (idx >= 0) state.pendingEvents.splice(idx, 1)
}

/** 즉시형 액션 1개 실행 (state 직접 수정 + 로그) */
function runImmediate(state: BattleState, eventId: string, action: EventAction): void {
  switch (action.type) {
    case 'buff': {
      const targets =
        action.target === 'playerAll'
          ? state.units.filter((u) => u.hp > 0 && u.faction === 'player')
          : [livingByOfficer(state, action.target)].filter((u): u is UnitState => u !== undefined)
      if (targets.length === 0) return
      for (const unit of targets) {
        unit.buffs.push({ stat: action.stat, amount: action.amount, remainingTurns: action.duration })
      }
      const label = BUFF_STAT_LABEL[action.stat]
      const who = action.target === 'playerAll' ? '아군 전체' : nameOf(targets[0])
      const sign = action.amount >= 0 ? '+' : ''
      log(state, `${who} — ${label} ${sign}${action.amount} (${action.duration}턴)`)
      return
    }

    case 'spawnUnits': {
      let spawned = 0
      action.units.forEach((def, j) => {
        if (spawnStageUnit(state, def, `e${eventId}_${j}_${def.officerId}`)) spawned += 1
      })
      if (spawned > 0) log(state, `${spawned}개 부대가 전장에 나타났다!`)
      return
    }

    case 'removeUnits': {
      // 조용한 이탈 — 격파 처리(경험치·증원·승패 트리거)를 타지 않고 전장에서 사라진다
      const leaving = state.units.filter((u) => action.officerIds.includes(u.officerId))
      if (leaving.length === 0) return
      state.units = state.units.filter((u) => !action.officerIds.includes(u.officerId))
      log(state, `${leaving.map(nameOf).join(', ')} 부대가 전장에서 이탈했다`)
      return
    }

    case 'inflictStatus': {
      // 원작의 스크립트 부여는 확정이다 — 책략과 달리 명중 판정을 거치지 않는다.
      // 지속턴은 없고(원작) 자연 해제만 있으므로 이미 보유한 유닛은 건드리지 않는다.
      const targets = state.units.filter(
        (u) => u.hp > 0 && action.officerIds.includes(u.officerId) && !u.statuses.some((s) => s.id === action.status),
      )
      for (const unit of targets) {
        unit.statuses.push({ id: action.status })
        const name = nameOf(unit)
        log(state, `${name}${subjectParticle(name)} ${statusName(action.status)}에 빠졌다!`, { targetId: unit.id })
      }
      return
    }

    case 'setBehavior': {
      // officerIds 생략 = 생존 적 전원 (levelUpEnemies와 동일 시맨틱)
      const ids = action.officerIds
      const targets = state.units.filter(
        (u) => u.hp > 0 && (ids ? ids.includes(u.officerId) : u.faction === 'enemy'),
      )
      if (targets.length === 0) return
      for (const unit of targets) unit.behavior = action.behavior
      log(state, `${targets.map(nameOf).join(', ')} — 움직임이 달라졌다`)
      return
    }

    case 'setTile': {
      const { width, height } = state.map
      let changed = 0
      for (const cell of action.cells) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue
        state.map.tiles[cell.y][cell.x] = action.terrain
        changed += 1
      }
      if (changed > 0) log(state, `지형이 변했다 — ${TERRAIN[action.terrain].name} ${changed}칸`)
      return
    }

    case 'levelUpEnemies': {
      const targets = state.units.filter(
        (u) =>
          u.hp > 0 &&
          u.faction === 'enemy' &&
          (action.officerIds === undefined || action.officerIds.includes(u.officerId)),
      )
      if (targets.length === 0 || action.amount === 0) return
      for (const unit of targets) {
        unit.level = Math.min(MAX_LEVEL, Math.max(1, unit.level + action.amount))
        const cls = CLASSES[unit.classId]
        unit.maxHp = maxHp(cls, unit.level)
        unit.maxMp = maxMp(cls, unit.level)
        // 원작 정예화 연출과 동일하게 완전회복시킨다 (승급/인수와 같은 처리)
        unit.hp = unit.maxHp
        unit.mp = unit.maxMp
      }
      log(state, `적군이 강화되었다 — ${targets.length}부대 레벨 ${action.amount >= 0 ? '+' : ''}${action.amount}`)
      return
    }

    // ---------- v1.2 ----------

    case 'setVictory': {
      // 스테이지 정의(모듈 상수)를 건드리지 않도록 항상 딥클론해서 얹는다
      state.victoryOverride = structuredClone(action.victory)
      log(state, '승리 조건이 변경되었다!')
      return
    }

    case 'setDefeat': {
      state.defeatOverride = structuredClone(action.defeat)
      log(state, '패배 조건이 변경되었다!')
      return
    }

    case 'setHazard': {
      // 스크립트 발화 — 화계와 달리 연소 지형을 가리지 않는다(완성된 화염 방어진 연출).
      // 다만 아무도 못 들어가는 지형(강·성벽·닫힌 성문)과 맵 밖은 개별로 건너뛴다.
      const { width, height } = state.map
      let lit = 0
      for (const cell of action.cells) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue
        if (isImpassableTerrain(state.map.tiles[cell.y][cell.x])) continue
        const existing = hazardAt(state, cell)
        if (existing) existing.remainingTurns = Math.max(existing.remainingTurns, action.duration)
        else state.hazards.push({ pos: { ...cell }, kind: action.kind, remainingTurns: action.duration })
        lit += 1
      }
      if (lit > 0) log(state, `불길이 치솟았다 — ${lit}칸`)
      return
    }

    case 'dropItem': {
      const kind = itemKindOf(action.itemId)
      if (!kind) return // 미등록 id는 조용히 무시 (기존 보상 경로 관례)
      // officerId는 **사체(hp 0)도 포함**해서 찾는다 — 격파 유닛은 배열에 남으므로 쓰러진 자리가 나온다
      const pos = action.pos ?? state.units.find((u) => u.officerId === action.officerId)?.pos
      if (!pos) return
      const { width, height } = state.map
      if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) return
      const name = itemName(action.itemId)
      // 그 칸에 생존 아군이 서 있으면 픽업 판정을 기다리지 않고 즉시 손에 들어온다
      const standing = state.units.find((u) => u.hp > 0 && u.faction === 'player' && sameCell(u.pos, pos))
      if (standing) {
        state.pendingRewards.push({ itemId: action.itemId, kind })
        log(state, `${name}${objectParticle(name)} 손에 넣었다!`)
      } else {
        state.groundItems.push({ pos: { ...pos }, itemId: action.itemId })
        log(state, `${name}${subjectParticle(name)} 땅에 떨어졌다`)
      }
      return
    }

    case 'giveGold': {
      // 즉시형 — 승리 시 applyVictory가 보상금에 합산한다 (패배 시 소멸)
      state.pendingGold += action.amount
      log(state, `군자금 ${action.amount}을 얻었다!`)
      return
    }

    case 'giveExp': {
      const unit = livingByOfficer(state, action.target)
      if (!unit || unit.faction !== 'player' || action.amount <= 0) return // 적/우군은 성장하지 않음
      const progress = applyExp(unit.level, unit.exp, action.amount)
      unit.exp = progress.exp
      log(state, `${nameOf(unit)} — 경험치 +${action.amount}`)
      if (progress.levelsGained > 0) {
        const cls = CLASSES[unit.classId]
        const newMaxHp = maxHp(cls, progress.level)
        const newMaxMp = maxMp(cls, progress.level)
        unit.hp += newMaxHp - unit.maxHp
        unit.mp += newMaxMp - unit.maxMp
        unit.maxHp = newMaxHp
        unit.maxMp = newMaxMp
        unit.level = progress.level
        state.log.push({ type: 'levelUp', message: `${nameOf(unit)} 레벨 ${progress.level} 달성!` })
      }
      return
    }

    // 표시형은 executeQueue가 걸러낸다 (도달 불가) — 방어적으로 무시.
    // giveItem은 v1.2에서 표시형으로 승격됐고 적재는 battle.ts의 eventContinue가 한다.
    case 'dialogue':
    case 'choice':
    case 'duel':
    case 'giveItem':
      return
  }
}

/**
 * 대기 이벤트를 자동 소화한다 — 테스트 시뮬레이션과 연출 생략(speed 0)용.
 * choice는 pick(기본 0 = 밸런스 기준선)을 고른다. 무효 액션(참조 동일)이면 즉시 멈춘다.
 */
export function autoResolveEvents(state: BattleState, pick = 0): BattleState {
  let current = state
  // 안전 상한 — 데이터 오류로 큐가 줄지 않는 경우에도 무한루프에 빠지지 않는다
  for (let i = 0; i < 1000 && current.pendingEvents.length > 0; i += 1) {
    const next = applyAction(current, { type: 'eventContinue', choice: pick })
    if (next === current) break
    current = next
  }
  return current
}
