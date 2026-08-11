import { useEffect, useMemo, useRef, useState } from 'react'
import { runAiPhase, stepAiUnit } from '../core/ai'
import {
  applyAction,
  canAct,
  canCast,
  canMove,
  classOf,
  effectiveDefeat,
  effectiveVictory,
  isHostile,
  knownStrategies,
  livingUnits,
  movementRangeOf,
  officerOf,
  startBattle,
  unitAt,
} from '../core/battle'
import type { RosterEntry } from '../core/campaign'
import { PROMOTION_LEVEL, canPromoteUnit, consumableCount, growthSummary } from '../core/campaign'
import { maxHp, maxMp } from '../core/formulas'
import {
  attackableCells,
  attackRangeUnion,
  chebyshev,
  keyOf,
  manhattan,
  strategyAreaCells,
} from '../core/movement'
import type {
  BattleState,
  ConsumableDef,
  ConsumableStack,
  Faction,
  LogEvent,
  StageDef,
  StrategyDef,
  UnitClassDef,
  UnitState,
  Vec2,
} from '../core/types'
import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { OFFICERS } from '../data/officers'
import { STATUSES } from '../data/statuses'
import { STRATEGIES } from '../data/strategies'
import { TERRAIN } from '../data/terrain'
import { Banner, type BannerProps } from './Banner'
import { BattleBoard, CLASS_ICON } from './BattleBoard'
import { BattleLog } from './BattleLog'
import { defeatText, leaderNameOf, turnLimitOf, victoryText } from './conditionText'
import { EventOverlay } from './EventOverlay'
import { ForecastPanel } from './ForecastPanel'
import { euroRo } from './josa'
import { TerrainInfoPanel } from './TerrainInfoPanel'
import { UnitInfoPanel } from './UnitInfoPanel'
import { ZoomMapOverlay } from './ZoomMapOverlay'
import './battle.css'

/**
 * 행동 메뉴 2단 구조 (원작 조조전):
 *   move → menu → (attackTarget | strategyMenu → strategyTarget | itemMenu → itemTarget)
 * 우클릭은 항상 한 단계만 뒤로 간다.
 */
type SelMode =
  | 'move'
  | 'menu'
  | 'strategyMenu'
  | 'itemMenu'
  | 'attackTarget'
  | 'strategyTarget'
  | 'itemTarget'

interface Selection {
  unitId: string
  mode: SelMode
  strategyId?: string
  /** 도구 대상 지정 중인 소모품 id */
  itemId?: string
  undo: BattleState // 취소 시 복원 지점 (이동 전 상태)
}

/** 승급 확인 오버레이 — 도구를 쓰는 유닛과 승급할 대상이 다를 수 있다 (인수는 인접 아군에게도 쓴다) */
interface PromoteConfirm {
  itemId: string
  userId: string
  targetId: string
}

export interface Floater {
  id: number
  x: number
  y: number
  text: string
  kind: 'damage' | 'crit' | 'counter' | 'heal' | 'miss' | 'status'
  delay: number // 초 단위 stagger
}

/** 연출 속도: 1=보통, 2=빠름, 0=생략 */
type PlaySpeed = 1 | 2 | 0
const AI_STEP_MS = 700

/** 화살표 키 → 커서 이동량 (원작 방향키 조작) */
const ARROW_STEP: Record<string, Vec2 | undefined> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
}

/** 입력 필드에 포커스가 있으면 게임 조작으로 삼지 않는다 (에디터 플레이테스트 등) */
function typingInField(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

const PHASE_LABEL: Record<Faction, string> = {
  player: '아군 페이즈',
  enemy: '적군 페이즈',
  ally: '우군 페이즈',
}

interface BannerSpec {
  text: string
  color: BannerProps['color']
  direction: 'left' | 'right'
}

/**
 * 로그 문장에서 상태이상 이름을 뽑는다 — 상태 로그 계약({targetId})은 상태 id를 따로 싣지 않으므로
 * 라벨 단일 출처(STATUSES)로 역매칭한다. 못 찾으면 일반 문구로 폴백한다.
 */
function statusNameInMessage(message: string): string | null {
  for (const def of Object.values(STATUSES)) if (message.includes(def.name)) return def.name
  return null
}

const FLOATER_TEXT: Record<
  string,
  (n: number, e: LogEvent) => { text: string; kind: Floater['kind'] }
> = {
  hit: (n) => ({ text: `${n}`, kind: 'damage' }),
  crit: (n) => ({ text: `회심! ${n}`, kind: 'crit' }),
  counterHit: (n) => ({ text: `반격! ${n}`, kind: 'counter' }),
  counterCrit: (n) => ({ text: `반격 회심! ${n}`, kind: 'crit' }),
  strategy: (n) => ({ text: `${n}`, kind: 'damage' }),
  heal: (n) => ({ text: `+${n}`, kind: 'heal' }),
  // 도구 사용(회복류) — 책략 회복과 같은 표기를 쓴다. 승급(인수)은 amount가 없어 플로터가 뜨지 않는다.
  item: (n) => ({ text: `+${n}`, kind: 'heal' }),
  miss: () => ({ text: 'MISS', kind: 'miss' }),
  // 상태이상 — 독 데미지만 수치(음수)가 있고, 나머지는 텍스트 플로터다.
  poison: (n) => ({ text: `${n}`, kind: 'damage' }),
  status: (_n, e) => ({ text: `${statusNameInMessage(e.message) ?? '상태이상'}!`, kind: 'status' }),
  statusCured: (_n, e) => ({
    text: `${statusNameInMessage(e.message) ?? '상태이상'} 해제`,
    kind: 'status',
  }),
  statusHold: () => ({ text: '행동 불능', kind: 'status' }),
}

/** amount 없이도 플로터를 띄우는 로그 타입 (상태 부여/해제/스킵은 수치가 없다) */
const AMOUNTLESS_FLOATERS = new Set(['status', 'statusCured', 'statusHold'])

// ---------- 승급(인수) 변화 요약 — v0.8 캠프 UI에서 전투로 이식 ----------

/** 2차 병과는 CLASS_ICON(1차 6종)에 없다 — 같은 계열(category) 아이콘으로 폴백 */
const CATEGORY_ICON: Record<string, string> = {
  lord: '主',
  cavalry: '騎',
  infantry: '步',
  archer: '弓',
  strategist: '策',
  support: '風',
}
const classIcon = (cls: UnitClassDef): string =>
  CLASS_ICON[cls.id] ?? CATEGORY_ICON[cls.category] ?? '?'

const GROWTH_KEYS = ['atk', 'def', 'mind', 'agi', 'morale'] as const
const GROWTH_LABEL: Record<(typeof GROWTH_KEYS)[number], string> = {
  atk: '공격',
  def: '방어',
  mind: '정신',
  agi: '순발',
  morale: '사기',
}
const GRADE_RANK: Record<string, number> = { C: 0, B: 1, A: 2, S: 3 }

const rangeText = (cls: UnitClassDef): string =>
  cls.minRange === cls.maxRange ? `${cls.minRange}` : `${cls.minRange}~${cls.maxRange}`

interface PromotionChange {
  text: string
  /** true=상승, false=하락, null=중립(신규 책략 등) */
  up: boolean | null
}

/** 현재 병과 → 상위 병과 변화 요약. 값은 전부 CLASSES 비교로 뽑는다(하드코딩 금지) */
function promotionChanges(from: UnitClassDef, to: UnitClassDef, level: number): PromotionChange[] {
  const out: PromotionChange[] = []
  const num = (label: string, a: number, b: number) => {
    if (a !== b) out.push({ text: `${label} ${a} → ${b}`, up: b > a })
  }
  num('HP 최대치', maxHp(from, level), maxHp(to, level))
  num('MP 최대치', maxMp(from, level), maxMp(to, level))
  num('이동', from.move, to.move)
  if (rangeText(from) !== rangeText(to)) {
    out.push({ text: `사거리 ${rangeText(from)} → ${rangeText(to)}`, up: to.maxRange > from.maxRange })
  }
  for (const k of GROWTH_KEYS) {
    const a = from.growth[k]
    const b = to.growth[k]
    if (a !== b) {
      out.push({
        text: `${GROWTH_LABEL[k]} 성장 ${a} → ${b}`,
        up: (GRADE_RANK[b] ?? 0) > (GRADE_RANK[a] ?? 0),
      })
    }
  }
  const learned = to.strategies.filter((s) => !from.strategies.some((f) => f.strategyId === s.strategyId))
  for (const s of learned) {
    const name = STRATEGIES[s.strategyId]?.name ?? s.strategyId
    out.push({
      text: `신규 책략 ${name} (Lv${s.learnLevel}${s.learnLevel <= level ? ' — 즉시 습득' : ''})`,
      up: null,
    })
  }
  return out
}

/** 도구가 이 대상에게 실제 효과가 있는가 — 효과 0이면 도구만 사라지므로 UI가 먼저 막는다 */
function itemEffective(def: ConsumableDef, target: UnitState): boolean {
  switch (def.effect.kind) {
    case 'heal':
      return target.hp < target.maxHp
    case 'mpRestore':
      return target.mp < target.maxMp
    case 'cureStatus': {
      const cure = def.effect.statuses
      return cure === 'all'
        ? target.statuses.length > 0
        : target.statuses.some((s) => cure.includes(s.id))
    }
    case 'promotion':
      return canPromoteUnit(target)
  }
}

interface PromotionInfo {
  from: UnitClassDef
  target: UnitClassDef | null
  ok: boolean
  /** 불가 사유 — 버튼 툴팁 */
  reason: string | null
  changes: PromotionChange[]
}

/** 전투 유닛의 승급 가능 여부 + 변화 요약. 가능 판정은 코어(canPromoteUnit) 단일 출처 */
function promotionInfoOf(unit: UnitState): PromotionInfo {
  const from = classOf(unit)
  const target = from.promotesTo ? (CLASSES[from.promotesTo] ?? null) : null
  const ok = canPromoteUnit(unit)
  let reason: string | null = null
  if (!ok) {
    if (!target) reason = '최종 병과 — 더 오를 곳이 없다'
    else if (unit.level < PROMOTION_LEVEL) reason = `Lv${PROMOTION_LEVEL} 필요 (현재 Lv${unit.level})`
    else reason = '지금은 승급할 수 없다'
  }
  return { from, target, ok, reason, changes: target ? promotionChanges(from, target, unit.level) : [] }
}

interface Props {
  stage: StageDef
  seed: number
  onExit: () => void
  onRestart: () => void
  /** 캠페인 모드: 로스터 이월 + 출진 명단 + 도구 스톡 반입 + 종료 시 결과 회수 */
  roster?: RosterEntry[]
  deployment?: string[]
  consumables?: ConsumableStack[]
  onFinish?: (result: 'victory' | 'defeat', state: BattleState) => void
}

export function BattleScreen({ stage, seed, onExit, onRestart, roster, deployment, consumables, onFinish }: Props) {
  const [state, setState] = useState<BattleState>(() => startBattle(stage, seed, roster, deployment, consumables))
  const [sel, setSel] = useState<Selection | null>(null)
  /**
   * 명시 커서 — 원작처럼 빈 타일에도 상시 떠 있다. 마우스 진입이 갱신하지만
   * **보드를 벗어나도 지우지 않는다**: 화살표 키 조작이 같은 위치를 이어받기 때문이다.
   */
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const [speed, setSpeed] = useState<PlaySpeed>(1)
  const [confirmEnd, setConfirmEnd] = useState(false)
  /** 인수 승급 확인 오버레이 (도구 대상 지정에서 승급 가능한 유닛을 찍었을 때) */
  const [promoteConfirm, setPromoteConfirm] = useState<PromoteConfirm | null>(null)
  /** 이동/위협 범위를 들여다보는 유닛 — 선택(sel)과 독립. 적·우군·행동 완료 아군에 쓴다 */
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [aiActiveId, setAiActiveId] = useState<string | null>(null)
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [banner, setBanner] = useState<BannerSpec | null>(null)
  const [resultShown, setResultShown] = useState(false)
  /** 줌아웃 전체 지도 (원작 「지도」) — 헤더 버튼으로만 열고 닫는다 */
  const [zoomMap, setZoomMap] = useState(false)
  const floaterSeq = useRef(0)
  const prevLogLen = useRef(state.log.length)
  const prevPhaseKey = useRef<string | null>(null)

  const selectedUnit = sel ? state.units.find((u) => u.id === sel.unitId) : undefined
  const cursorUnit = cursor ? unitAt(state, cursor) : undefined
  /** 커서 밑 지형 — 커서가 맵 밖일 수는 없지만(clamp) 맵 교체 대비로 범위를 확인한다 */
  const cursorTerrain =
    cursor && cursor.y >= 0 && cursor.y < state.map.height && cursor.x >= 0 && cursor.x < state.map.width
      ? TERRAIN[state.map.tiles[cursor.y][cursor.x]]
      : undefined
  const aiActiveUnit = aiActiveId ? state.units.find((u) => u.id === aiActiveId) : undefined
  const inspectUnit = inspectId ? state.units.find((u) => u.id === inspectId) : undefined

  // ---------- 페이즈 전환 / 승패 배너 ----------

  // 속도 0(연출 생략)에서는 배너를 아예 띄우지 않는다 (즉시 처리 경로 유지)
  useEffect(() => {
    if (state.result !== 'ongoing') return
    // 이벤트 오버레이 중에는 배너를 미룬다 — key를 소비하지 않으므로 큐가 비는 순간 이 effect가
    // 다시 돌아 배너가 뜬다 (battleStart 이벤트 + 턴1 배너가 겹치는 경우가 이 경로다)
    if (state.pendingEvents.length > 0) return
    const key = `${state.phase}:${state.turn}`
    if (prevPhaseKey.current === key) return
    prevPhaseKey.current = key
    if (speed === 0) return
    setBanner({
      text: `제 ${state.turn} 턴 · ${PHASE_LABEL[state.phase]}`,
      color: state.phase,
      direction: state.phase === 'enemy' ? 'right' : 'left',
    })
  }, [state.phase, state.turn, state.result, state.pendingEvents.length, speed])

  // 페이즈가 바뀌면 들여다보기는 해제한다 (지난 페이즈의 사거리는 정보가 아니라 노이즈다)
  useEffect(() => setInspectId(null), [state.phase, state.turn])

  useEffect(() => {
    if (state.result === 'ongoing') return
    // 코어는 pendingEvents가 빈 순간에만 checkVictory를 돌리므로 보통 여기 걸리지 않지만,
    // 승패 배너/결과창이 이벤트 오버레이와 겹치는 일은 계약상 금지다 (방어적 이중 가드)
    if (state.pendingEvents.length > 0) return
    if (speed === 0) {
      setResultShown(true)
      return
    }
    setBanner(
      state.result === 'victory'
        ? { text: '승리!', color: 'gold', direction: 'left' }
        : { text: '패배...', color: 'enemy', direction: 'right' },
    )
  }, [state.result, state.pendingEvents.length, speed])

  // ---------- 이벤트 오버레이 ----------

  /** 큐 헤드 소비 — 대사 재생 완료 / 선택 확정 시 호출 */
  function continueEvent(choice?: number) {
    setState((prev) =>
      applyAction(prev, choice === undefined ? { type: 'eventContinue' } : { type: 'eventContinue', choice }),
    )
  }

  // 이벤트가 발동하면 진행 중이던 선택·확인창을 걷어낸다 (대상 지정 중 발동 시 잔상 방지).
  // sel.undo로 되돌리지 않는다 — 이벤트를 일으킨 행동은 이미 확정된 것이다.
  useEffect(() => {
    if (state.pendingEvents.length === 0) return
    setSel(null)
    setPromoteConfirm(null)
    setConfirmEnd(false)
    setInspectId(null)
  }, [state.pendingEvents.length])

  // 이벤트가 발동하면 전체 지도는 접는다 — 이벤트 오버레이(z 12·13)가 지도(11)를 덮어
  // "닫을 수 없는 창"처럼 보이는 상태를 만들지 않는다
  useEffect(() => {
    if (state.pendingEvents.length > 0) setZoomMap(false)
  }, [state.pendingEvents.length])

  // 승급 확인 오버레이 — Escape 로 닫기
  useEffect(() => {
    if (!promoteConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPromoteConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [promoteConfirm])

  function handleBannerDone() {
    setBanner(null)
    if (state.result !== 'ongoing') setResultShown(true)
  }

  // ---------- AI 페이즈 순차 재생 ----------

  useEffect(() => {
    if (state.result !== 'ongoing' || state.phase === 'player') {
      if (aiActiveId !== null) setAiActiveId(null)
      return
    }
    if (banner) return // 배너 연출 중에는 적 유닛을 움직이지 않는다
    if (speed === 0) {
      // 연출 생략: 적/우군 페이즈를 즉시 전부 처리한다.
      // 이벤트 정책 — 대사/일기토는 자동 소화(내용은 로그에 남는다), 선택지는 생략 불가라
      // 루프를 탈출해 오버레이를 띄운다. 아군 페이즈 이벤트는 이 effect가 아예 돌지 않으므로
      // (위 early return) speed와 무관하게 항상 오버레이로 표시된다.
      setState((prev) => {
        let cur = prev
        while (cur.result === 'ongoing' && cur.phase !== 'player') {
          if (cur.pendingEvents.length > 0) {
            if (cur.pendingEvents[0].queue[0]?.type === 'choice') break
            const consumed = applyAction(cur, { type: 'eventContinue' })
            if (consumed === cur) break // 소비 불가(데이터 오류) — 무한루프 금지
            cur = consumed
            continue
          }
          const advanced = runAiPhase(cur, cur.phase)
          if (advanced === cur) break // 진행 없음 — 방어
          cur = advanced
        }
        return cur
      })
      return
    }
    // 표시 대기 이벤트가 있으면 AI 타이머를 세운다 — 코어가 전 액션을 봉쇄하므로 진행이 불가능하고,
    // 오버레이 소비(eventContinue)로 state가 바뀌면 이 effect가 다시 돌아 이어받는다
    if (state.pendingEvents.length > 0) return
    const timer = setTimeout(() => {
      setState((prev) => {
        if (prev.result !== 'ongoing' || prev.phase === 'player') return prev
        const step = stepAiUnit(prev, prev.phase)
        setAiActiveId(step.actedUnitId)
        return step.state
      })
    }, AI_STEP_MS / speed)
    return () => clearTimeout(timer)
  }, [state, speed, aiActiveId, banner])

  // ---------- 데미지/회복 플로팅 텍스트 (로그 diff 기반) ----------

  useEffect(() => {
    if (state.log.length <= prevLogLen.current) {
      prevLogLen.current = state.log.length
      return
    }
    const events = state.log.slice(prevLogLen.current)
    prevLogLen.current = state.log.length

    const created: Floater[] = []
    for (const e of events) {
      if (!e.targetId) continue
      if (e.amount === undefined && !AMOUNTLESS_FLOATERS.has(e.type)) continue
      const target = state.units.find((u) => u.id === e.targetId)
      const mk = FLOATER_TEXT[e.type]
      if (!target || !mk) continue
      created.push({
        id: ++floaterSeq.current,
        x: target.pos.x,
        y: target.pos.y,
        delay: created.length * 0.25,
        ...mk(e.amount ?? 0, e),
      })
    }
    if (created.length === 0) return
    setFloaters((prev) => [...prev, ...created])
    const ids = new Set(created.map((f) => f.id))
    setTimeout(
      () => setFloaters((prev) => prev.filter((f) => !ids.has(f.id))),
      1300 + created.length * 250,
    )
  }, [state])

  // ---------- 오버레이 계산 ----------

  const moveRange = useMemo(
    () => (sel?.mode === 'move' && selectedUnit ? movementRangeOf(state, selectedUnit) : null),
    [state, sel?.mode, selectedUnit],
  )

  const moveCells = useMemo(() => {
    const set = new Set<string>()
    if (moveRange && selectedUnit) {
      for (const cell of moveRange.values()) {
        if (cell.canStop && !unitAt(state, cell.pos)) set.add(keyOf(cell.pos))
      }
      set.add(keyOf(selectedUnit.pos)) // 제자리 선택 허용
    }
    return set
  }, [moveRange, selectedUnit, state])

  const attackCells = useMemo(() => {
    const set = new Set<string>()
    if (!selectedUnit) return set
    const cls = classOf(selectedUnit)
    if (sel?.mode === 'attackTarget') {
      for (const p of attackableCells(selectedUnit.pos, cls.minRange, cls.maxRange, state.map.width, state.map.height)) {
        set.add(keyOf(p))
      }
    } else if (sel?.mode === 'move' && moveRange) {
      // 이동 범위 밖 공격 가능 영역 표시 (정보용)
      const union = attackRangeUnion(moveRange, cls.minRange, cls.maxRange, state.map.width, state.map.height)
      for (const k of union) if (!moveCells.has(k)) set.add(k)
    }
    return set
  }, [sel?.mode, selectedUnit, moveRange, moveCells, state])

  const selStrategy =
    sel?.mode === 'strategyTarget' && selectedUnit && sel.strategyId
      ? knownStrategies(selectedUnit).find((s) => s.id === sel.strategyId)
      : undefined
  const selItem = sel?.mode === 'itemTarget' && sel.itemId ? CONSUMABLES[sel.itemId] : undefined

  /**
   * 도구 유효 대상 — 원작 확정: **체비쇼프 거리 ≤ range** (range 1 = 자기 자신 + 인접 8방, 대각 포함)
   * 이면서 살아 있는 비적대 유닛. 효과가 0인 대상(만피에 환약 등)은 도구만 날리므로 제외한다.
   */
  const itemTargetsOf = (user: UnitState, def: ConsumableDef): UnitState[] =>
    livingUnits(state).filter(
      (u) => !isHostile(user, u) && chebyshev(user.pos, u.pos) <= def.range && itemEffective(def, u),
    )

  /** 책략 대상 판정 — 원작 확정: AoE도 **유닛이 서 있는 칸**만 지정 가능(빈 칸 거부) */
  const strategyTargetOk = (s: StrategyDef, user: UnitState, at: UnitState | undefined): boolean => {
    if (!at || at.hp <= 0) return false
    if (manhattan(user.pos, at.pos) > s.range) return false
    // 진영 판정은 코어 리듀서와 같은 기준(enemy = 적대 / 그 외 = 비적대)을 쓴다 —
    // UI가 더 좁게 막아 합법 수를 못 두게 되는 일을 피한다. ('self' 책략은 현재 데이터에 없다)
    return s.targets === 'enemy' ? isHostile(user, at) : !isHostile(user, at)
  }

  /** 대상 지정 하이라이트 — 책략은 사거리 전체(보라), 도구는 실제로 쓸 수 있는 대상 칸만 */
  const targetCells = useMemo(() => {
    const set = new Set<string>()
    if (!selectedUnit) return set
    if (selStrategy) {
      for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
          if (manhattan(selectedUnit.pos, { x, y }) <= selStrategy.range) set.add(keyOf({ x, y }))
        }
      }
    } else if (selItem) {
      for (const u of itemTargetsOf(selectedUnit, selItem)) set.add(keyOf(u.pos))
    }
    return set
  }, [selStrategy, selItem, selectedUnit, state])

  /**
   * 착탄 범위 프리뷰 (원작에 없는 우리 개선 기능) — 커서가 **지정 가능한 대상 칸**일 때만 보여준다.
   * 빈 칸은 코어가 거부하므로 프리뷰도 뜨지 않아 클릭 규칙이 그대로 드러난다.
   */
  const aoeCells = useMemo(() => {
    const set = new Set<string>()
    if (!selStrategy || !selectedUnit || !cursor) return set
    if (!strategyTargetOk(selStrategy, selectedUnit, unitAt(state, cursor))) return set
    for (const p of strategyAreaCells(selStrategy.area, cursor)) {
      if (p.x < 0 || p.y < 0 || p.x >= state.map.width || p.y >= state.map.height) continue
      set.add(keyOf(p))
    }
    return set
  }, [selStrategy, selectedUnit, cursor, state])

  /** 들여다보는 유닛의 이동 가능 칸 (자기 위치 포함) */
  const inspectMoveCells = useMemo(() => {
    const set = new Set<string>()
    if (!inspectUnit) return set
    for (const cell of movementRangeOf(state, inspectUnit).values()) {
      if (cell.canStop) set.add(keyOf(cell.pos))
    }
    set.add(keyOf(inspectUnit.pos))
    return set
  }, [state, inspectUnit])

  /** 이동 후 공격이 닿는 칸 — 이동 칸은 빼서 "어디까지 맞을 수 있는가"만 남긴다 */
  const inspectThreatCells = useMemo(() => {
    const set = new Set<string>()
    if (!inspectUnit) return set
    const cls = classOf(inspectUnit)
    const union = attackRangeUnion(
      movementRangeOf(state, inspectUnit),
      cls.minRange,
      cls.maxRange,
      state.map.width,
      state.map.height,
    )
    for (const k of union) if (!inspectMoveCells.has(k)) set.add(k)
    return set
  }, [state, inspectUnit, inspectMoveCells])

  // ---------- 조작 ----------

  // 이벤트 오버레이 중에는 조작을 막는다 (코어도 전 액션을 거부하지만 UI가 먼저 잠근다)
  const isPlayerTurn =
    state.phase === 'player' && state.result === 'ongoing' && state.pendingEvents.length === 0

  function selectUnit(unit: UnitState) {
    setInspectId(null) // 아군을 조작하기 시작하면 들여다보기는 끝난다
    // 부동(immobile)은 이동 범위가 없다 — 이동 모드를 건너뛰고 바로 행동 메뉴로 간다.
    // (혼란은 코어가 acted를 선세팅하므로 애초에 선택되지 않는다)
    const skipMove = unit.moved || !canMove(unit)
    setSel({ unitId: unit.id, mode: skipMove ? 'menu' : 'move', undo: state })
  }

  function cancelSelection() {
    if (sel) setState(sel.undo)
    setSel(null)
    setPromoteConfirm(null)
  }

  function finishAction(next: BattleState) {
    setState(next)
    setSel(null)
    setPromoteConfirm(null)
    // 원작(GBA 영걸전) 동작: 전원 행동 완료 시 턴 종료 확인창 자동 표시
    if (
      next.result === 'ongoing' &&
      next.phase === 'player' &&
      livingUnits(next, 'player').every((u) => u.acted)
    ) {
      setConfirmEnd(true)
    }
  }

  function doEndTurn() {
    setConfirmEnd(false)
    if (!isPlayerTurn) return
    setSel(null)
    setInspectId(null)
    // 페이즈만 넘기면 AI 재생 useEffect가 이어받는다
    setState(applyAction(state, { type: 'endPhase' }))
  }

  /** 도구 사용 — 대상 칸(자기 자신 포함)을 찍어서 쓴다 */
  function useItemAt(itemId: string, target: Vec2) {
    if (!selectedUnit) return
    const next = applyAction(state, { type: 'useItem', unitId: selectedUnit.id, itemId, target })
    if (next === state) return // 무효 액션 — 리듀서가 원본을 그대로 돌려준다
    finishAction(next)
  }

  /** 도구 메뉴에서 항목 선택 — 도구는 전부 대상 지정형이다 (인수 포함) */
  function chooseItem(def: ConsumableDef) {
    if (!sel || !selectedUnit) return
    setSel({ ...sel, mode: 'itemTarget', itemId: def.id })
  }

  /** 우클릭 = 원작 취소 버튼: 단계별 뒤로가기, 선택 없음 상태에서는 턴 종료 확인 */
  function handleRightClick() {
    if (!isPlayerTurn) return
    if (promoteConfirm) {
      setPromoteConfirm(null)
      return
    }
    if (!sel) {
      // 들여다보기가 켜져 있으면 먼저 그것을 끈다
      if (inspectId) {
        setInspectId(null)
        return
      }
      setConfirmEnd(true)
      return
    }
    switch (sel.mode) {
      case 'itemTarget':
        setSel({ ...sel, mode: 'itemMenu', itemId: undefined })
        return
      case 'strategyTarget':
        setSel({ ...sel, mode: 'strategyMenu', strategyId: undefined })
        return
      case 'strategyMenu':
      case 'itemMenu':
      case 'attackTarget':
        setSel({ ...sel, mode: 'menu', strategyId: undefined, itemId: undefined })
        return
      case 'menu':
        // 이동 취소: 이동 전 상태로 복원하고 이동 모드 유지
        setState(sel.undo)
        // 부동(immobile)은 되돌릴 이동 단계가 없다 — 선택 자체를 해제한다
        if (selectedUnit && !canMove(selectedUnit)) {
          setSel(null)
          return
        }
        setSel({ unitId: sel.unitId, mode: 'move', undo: sel.undo })
        return
      case 'move':
        setSel(null)
        return
    }
  }

  function handleCellClick(pos: Vec2) {
    if (!isPlayerTurn) return
    const clicked = unitAt(state, pos)

    if (!sel) {
      if (clicked && clicked.faction === 'player' && !clicked.acted) {
        selectUnit(clicked)
        return
      }
      // 적/우군/행동 완료 아군 — 이동·위협 범위 들여다보기 토글
      setInspectId((prev) => (clicked && prev !== clicked.id ? clicked.id : null))
      return
    }

    const unit = selectedUnit
    if (!unit) {
      setSel(null)
      return
    }

    switch (sel.mode) {
      case 'move': {
        if (clicked && clicked.id === unit.id) {
          setSel({ ...sel, mode: 'menu' }) // 제자리에서 행동
          return
        }
        if (clicked && clicked.faction === 'player' && !clicked.acted) {
          selectUnit(clicked) // 다른 유닛로 선택 전환
          return
        }
        if (moveCells.has(keyOf(pos))) {
          const next = applyAction(state, { type: 'move', unitId: unit.id, to: pos })
          if (next !== state) {
            setState(next)
            setSel({ ...sel, mode: 'menu' })
          }
          return
        }
        cancelSelection()
        return
      }
      case 'menu':
      case 'strategyMenu':
      case 'itemMenu':
        return // 메뉴 버튼으로만 진행
      case 'attackTarget': {
        if (clicked && isHostile(unit, clicked) && attackCells.has(keyOf(pos))) {
          const next = applyAction(state, { type: 'attack', unitId: unit.id, targetId: clicked.id })
          if (next !== state) finishAction(next)
          return
        }
        setSel({ ...sel, mode: 'menu' })
        return
      }
      case 'strategyTarget': {
        // 유닛이 서 있고 진영이 맞는 칸만 통과 — 빈 칸을 찍어도 조용히 실패하지 않는다(우클릭으로 취소)
        if (!selStrategy || !strategyTargetOk(selStrategy, unit, clicked)) return
        const next = applyAction(state, {
          type: 'strategy',
          unitId: unit.id,
          strategyId: selStrategy.id,
          target: pos,
        })
        if (next !== state) finishAction(next)
        return
      }
      case 'itemTarget': {
        // 유효 대상 칸(체비쇼프 사거리 + 비적대 + 효과 있음)만 통과
        if (!selItem || !clicked || !targetCells.has(keyOf(pos))) return
        if (selItem.effect.kind === 'promotion') {
          // 승급은 되돌릴 수 없다 — 대상을 확정한 뒤 확인 오버레이를 거친다
          setPromoteConfirm({ itemId: selItem.id, userId: unit.id, targetId: clicked.id })
          return
        }
        useItemAt(selItem.id, pos)
        return
      }
    }
  }

  function handleEndTurn() {
    if (!isPlayerTurn) return
    setConfirmEnd(true)
  }

  // ---------- 키보드 조작 (원작 방향키 + 결정/취소) ----------

  /**
   * 확인창·배너·결과창·전체 지도가 떠 있는가. 이벤트 오버레이는 isPlayerTurn이 이미 걸러낸다.
   * 전체 지도가 여기 포함되어야 Escape가 지도만 닫고 턴 종료 확인창을 열지 않는다.
   */
  const overlayOpen =
    promoteConfirm !== null || confirmEnd || banner !== null || resultShown || zoomMap

  /**
   * 화살표 = 커서 이동, Enter/Space = 클릭, Escape = 우클릭(취소).
   * 클릭/우클릭 경로를 그대로 재사용하므로 조작 FSM에 새 분기가 생기지 않는다.
   */
  useEffect(() => {
    if (!isPlayerTurn || overlayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (typingInField()) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const step = ARROW_STEP[e.key]
      if (step) {
        e.preventDefault()
        setCursor((prev) => {
          // 커서가 없던 상태의 첫 입력은 기준점을 띄우기만 한다 (원작도 커서가 먼저 나타난다)
          const base = prev ?? selectedUnit?.pos ?? livingUnits(state, 'player')[0]?.pos ?? { x: 0, y: 0 }
          if (!prev) return base
          return {
            x: Math.min(state.map.width - 1, Math.max(0, base.x + step.x)),
            y: Math.min(state.map.height - 1, Math.max(0, base.y + step.y)),
          }
        })
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        // 버튼에 포커스가 있으면 브라우저가 그 버튼을 누른다 — 셀 클릭까지 겹쳐 실행하지 않는다
        if (document.activeElement instanceof HTMLButtonElement) return
        e.preventDefault()
        if (cursor) handleCellClick(cursor)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleRightClick()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // handleCellClick/handleRightClick은 state·sel·inspectId에서 파생된다 —
    // 그 값이 바뀌면 리스너를 새 클로저로 다시 걸어야 한다
  }, [isPlayerTurn, overlayOpen, cursor, state, sel, selectedUnit, inspectId])

  // ---------- 렌더 ----------

  const enemiesInRange =
    selectedUnit &&
    livingUnits(state).filter(
      (u) =>
        isHostile(selectedUnit, u) &&
        manhattan(selectedUnit.pos, u.pos) >= classOf(selectedUnit).minRange &&
        manhattan(selectedUnit.pos, u.pos) <= classOf(selectedUnit).maxRange,
    )

  const forecastTarget =
    sel?.mode === 'attackTarget' && selectedUnit && cursorUnit && isHostile(selectedUnit, cursorUnit)
      ? cursorUnit
      : undefined

  /** 선택 유닛이 쓸 수 있는 책략 목록 + 개별 사용 가능 판정 */
  const strategies = selectedUnit ? knownStrategies(selectedUnit) : []
  const strategyBlockReason = (s: StrategyDef): string | null => {
    if (!selectedUnit) return '선택된 부대가 없다'
    // 혼란 먼저 — canCast는 혼란·금책 둘 다 막으므로 사유가 뒤섞이지 않게 순서를 고정한다
    if (!canAct(selectedUnit)) return '혼란 — 스스로 행동할 수 없다'
    if (!canCast(selectedUnit)) return '금책 — 책략이 봉인됐다'
    if (s.element === 'fire' && state.weather === 'rain') return '우천 — 화계는 쓸 수 없다'
    if (selectedUnit.mp < s.mpCost) return `MP 부족 (${selectedUnit.mp}/${s.mpCost})`
    return null
  }
  const allStrategiesBlocked = strategies.length > 0 && strategies.every((s) => strategyBlockReason(s) !== null)
  /** 책략 버튼 툴팁 — 상태이상으로 전부 막힌 경우엔 그 사유를 그대로 보여준다 */
  const strategyMenuBlockReason: string | null = !selectedUnit
    ? null
    : !canAct(selectedUnit)
      ? '혼란 — 스스로 행동할 수 없다'
      : !canCast(selectedUnit)
        ? '금책 — 책략이 봉인됐다'
        : allStrategiesBlocked
          ? '쓸 수 있는 책략이 없다'
          : null

  /** 전투 로컬 도구 스톡 (수량 0·미등록 id 제외) */
  const itemStock = useMemo(
    () =>
      state.consumables
        .filter((s) => s.count > 0 && CONSUMABLES[s.itemId])
        .map((s) => ({ def: CONSUMABLES[s.itemId], count: s.count })),
    [state.consumables],
  )
  const itemTotal = itemStock.reduce((n, s) => n + s.count, 0)

  const promoteDef = promoteConfirm ? CONSUMABLES[promoteConfirm.itemId] : undefined
  const promoteUser = promoteConfirm ? state.units.find((u) => u.id === promoteConfirm.userId) : undefined
  const promoteTargetUnit = promoteConfirm
    ? state.units.find((u) => u.id === promoteConfirm.targetId)
    : undefined
  const promo = promoteTargetUnit ? promotionInfoOf(promoteTargetUnit) : null

  /**
   * 도구 1개의 사용 가능 여부 + 사유 — 사거리(자기 + 인접 8방) 안에 **효과가 있는 대상**이
   * 1명이라도 있으면 활성. 자기가 만피여도 옆의 아군이 다쳤으면 환약을 쓸 수 있다.
   */
  const itemBlockReason = (def: ConsumableDef): string | null => {
    if (!selectedUnit) return '선택된 부대가 없다'
    if (itemTargetsOf(selectedUnit, def).length > 0) return null
    switch (def.effect.kind) {
      case 'heal':
        return 'HP가 줄어든 부대가 사거리 안에 없다'
      case 'mpRestore':
        return 'MP가 줄어든 부대가 사거리 안에 없다'
      case 'cureStatus':
        return '해당 상태이상인 부대가 사거리 안에 없다'
      case 'promotion': {
        // 사거리 안에 자기 혼자면 자기 사유를 그대로 보여준다 (Lv15 필요 / 최종 병과)
        const near = livingUnits(state).filter(
          (u) => !isHostile(selectedUnit, u) && chebyshev(selectedUnit.pos, u.pos) <= def.range,
        )
        if (near.length === 1 && near[0].id === selectedUnit.id) return promotionInfoOf(selectedUnit).reason
        return `승급할 수 있는 부대가 사거리 안에 없다 (Lv${PROMOTION_LEVEL} 이상 · 상위 병과 필요)`
      }
    }
  }

  /**
   * 상단 정보 스트립 (원작 확정) — 승리/패배 조건을 전투 내내 상시 노출한다.
   * effectiveVictory/effectiveDefeat를 매 렌더 읽으므로 setVictory/setDefeat 런타임 교체가
   * 즉시 반영된다 (원작: 퇴각 선택 → 승리조건 변경, 원술전 → 12턴 상한).
   */
  const victory = effectiveVictory(state, stage)
  const defeat = effectiveDefeat(state, stage)
  const turnLimit = turnLimitOf(defeat)
  const conditionVictory = victoryText(victory, state)
  const conditionDefeat = defeatText(defeat, state, leaderNameOf(state))
  /** 상한까지 3턴 이하 — 붉게 강조해서 "시간이 없다"를 시각으로 알린다 */
  const turnUrgent = turnLimit !== null && turnLimit - state.turn <= 2

  /** 이벤트 오버레이가 떠 있으면 지도를 열 수 없다 (오버레이가 12·13을 쓰고 조작을 잠근다) */
  const mapBlocked = state.pendingEvents.length > 0

  /** 대상 지정 중 안내 — 무엇의 대상을 고르는 중인지 + 취소 방법 (빈 칸 클릭은 무반응이다) */
  const targetHint =
    sel?.mode === 'attackTarget'
      ? { title: '공격 대상', body: '적 부대를 클릭하세요.' }
      : selStrategy
        ? {
            title: `책략 · ${selStrategy.name}`,
            body: `${selStrategy.targets === 'enemy' ? '적' : selStrategy.targets === 'self' ? '자신' : '아군'} 부대를 클릭하세요${selStrategy.area === 'single' ? '' : ' (그 부대가 범위의 중심)'}.`,
          }
        : selItem
          ? { title: `도구 · ${selItem.name}`, body: '자신 또는 인접한 아군을 클릭하세요.' }
          : null

  return (
    <div className="battle-screen">
      {/*
        상단 정보 스트립 (원작 확정 2단):
          1행 — 남색 전투명 바 / 「턴 수 n/최대」 / 페이즈 / 날씨 / 지도·연출·턴 종료
          2행 — 승리조건·패배조건 상시 노출 (최대 턴이 패배 조건이므로 1행 턴 표시와 짝을 이룬다)
      */}
      <header className="battle-header">
        <div className="battle-header-top">
          <h2 className="stage-name-bar">{stage.name}</h2>
          <div className="turn-banner">
            <span className={`turn-count${turnUrgent ? ' urgent' : ''}`}>
              <i className="turn-mark" aria-hidden="true" />
              턴 수 {state.turn}
              {turnLimit !== null && `/${turnLimit}`}
            </span>
            <span className={`phase-${state.phase}`}>{PHASE_LABEL[state.phase]}</span>
            <span>{state.weather === 'clear' ? '맑음' : '비'}</span>
          </div>
          <button
            className="map-btn"
            onClick={() => setZoomMap(true)}
            disabled={mapBlocked}
            title="전체 지도 (줌아웃)"
          >
            지도
          </button>
          <button
            className="speed-btn"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0 : 1))}
            title="적 턴 연출 속도"
          >
            연출: {speed === 1 ? '보통' : speed === 2 ? '빠름' : '생략'}
          </button>
          <button className="end-turn-btn" onClick={handleEndTurn} disabled={!isPlayerTurn}>
            턴 종료
          </button>
        </div>
        <div className="condition-strip">
          <span className="cond-item">
            <em className="cond-label">승리조건</em>
            {conditionVictory}
          </span>
          <span className="cond-item">
            <em className="cond-label defeat">패배조건</em>
            {conditionDefeat}
          </span>
        </div>
      </header>

      <BattleBoard
        state={state}
        moveCells={moveCells}
        attackCells={attackCells}
        strategyCells={targetCells}
        aoeCells={aoeCells}
        inspectMoveCells={inspectMoveCells}
        inspectThreatCells={inspectThreatCells}
        inspectUnitId={inspectId}
        selectedUnitId={sel?.unitId ?? null}
        cursorPos={cursor}
        activeUnitId={aiActiveId}
        floaters={floaters}
        onCellClick={handleCellClick}
        onCellHover={setCursor}
        onCellRightClick={handleRightClick}
      >
        {/*
          전투 내 이벤트 — 대사 말풍선/선택지/일기토/아이템 획득.
          보드 안에 두어야 말풍선이 타일 좌표를 그대로 쓰고 보드 스크롤을 따라간다.
          입력 차단막은 position:fixed 라 여전히 뷰포트 전체를 덮는다 (결과창·배너보다 위).
        */}
        <EventOverlay state={state} title={stage.name} onContinue={continueEvent} />
      </BattleBoard>

      <aside className="side-panel">
        {/* ⓞ 대상 지정 안내 — 유효한 칸만 반응하므로 무엇을 찍어야 하는지 알려준다 */}
        {targetHint && selectedUnit && (
          <div className="panel-box target-hint">
            <h3>{targetHint.title}</h3>
            <p>{targetHint.body}</p>
            <p className="target-hint-cancel">우클릭으로 취소</p>
          </div>
        )}

        {/* ① 행동 메뉴 (1단) */}
        {sel?.mode === 'menu' && selectedUnit && (
          <div className="panel-box">
            <h3>{officerOf(selectedUnit).name}의 행동</h3>
            <div className="action-menu">
              <button
                disabled={!enemiesInRange || enemiesInRange.length === 0}
                onClick={() => setSel({ ...sel, mode: 'attackTarget' })}
              >
                공격
              </button>
              {strategies.length > 0 && (
                <button
                  disabled={allStrategiesBlocked}
                  title={strategyMenuBlockReason ?? undefined}
                  onClick={() => setSel({ ...sel, mode: 'strategyMenu' })}
                >
                  책략
                </button>
              )}
              {itemTotal > 0 && <button onClick={() => setSel({ ...sel, mode: 'itemMenu' })}>도구</button>}
              <button
                onClick={() => {
                  const next = applyAction(state, { type: 'wait', unitId: selectedUnit.id })
                  finishAction(next)
                }}
              >
                대기
              </button>
              <button onClick={cancelSelection}>취소</button>
            </div>
          </div>
        )}

        {/* ② 책략 목록 (2단) */}
        {sel?.mode === 'strategyMenu' && selectedUnit && (
          <div className="panel-box">
            <h3>{officerOf(selectedUnit).name}의 책략</h3>
            <div className="action-menu">
              {strategies.map((s) => {
                const blocked = strategyBlockReason(s)
                return (
                  <button
                    key={s.id}
                    disabled={blocked !== null}
                    title={blocked ?? `사거리 ${s.range} · ${s.area === 'single' ? '단일' : s.area === 'cross' ? '십자 5칸' : '3×3'}`}
                    onClick={() => setSel({ ...sel, mode: 'strategyTarget', strategyId: s.id })}
                  >
                    {s.name} <span className="menu-cost">MP {s.mpCost}</span>
                  </button>
                )
              })}
              {strategies.length === 0 && <p className="dim">쓸 수 있는 책략이 없다.</p>}
              <button
                className="menu-back"
                onClick={() => setSel({ ...sel, mode: 'menu', strategyId: undefined })}
              >
                뒤로
              </button>
            </div>
          </div>
        )}

        {/* ③ 도구 목록 (2단) */}
        {sel?.mode === 'itemMenu' && selectedUnit && (
          <div className="panel-box">
            <h3>{officerOf(selectedUnit).name}의 도구</h3>
            <div className="action-menu">
              {itemStock.map(({ def, count }) => {
                const blocked = itemBlockReason(def)
                return (
                  <button
                    key={def.id}
                    disabled={blocked !== null}
                    title={blocked ? `${def.desc}\n${blocked}` : def.desc}
                    onClick={() => chooseItem(def)}
                  >
                    {def.name} <span className="menu-count">×{count}</span>
                  </button>
                )
              })}
              {itemStock.length === 0 && <p className="dim">가진 도구가 없다.</p>}
              <button
                className="menu-back"
                onClick={() => setSel({ ...sel, mode: 'menu', itemId: undefined })}
              >
                뒤로
              </button>
            </div>
          </div>
        )}

        {forecastTarget && selectedUnit && (
          <ForecastPanel state={state} attacker={selectedUnit} defender={forecastTarget} />
        )}

        {(cursorUnit ?? selectedUnit ?? inspectUnit ?? aiActiveUnit) && (
          <UnitInfoPanel state={state} unit={(cursorUnit ?? selectedUnit ?? inspectUnit ?? aiActiveUnit)!} />
        )}

        {cursorTerrain && <TerrainInfoPanel terrain={cursorTerrain} />}

        <BattleLog log={state.log} />
      </aside>

      {/* 줌아웃 전체 지도 (z-index 11) — 이벤트 오버레이(12·13) 아래, 결과창(10) 위 */}
      {zoomMap && !mapBlocked && <ZoomMapOverlay state={state} onClose={() => setZoomMap(false)} />}

      {/* 인수 승급 확인 — 되돌릴 수 없는 조작이라 확인 후 확정. 대상은 사용자와 다를 수 있다 */}
      {promoteConfirm && promoteDef && promoteUser && promoteTargetUnit && promo?.ok && promo.target && (
        <div
          className="result-overlay"
          onClick={() => setPromoteConfirm(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setPromoteConfirm(null)
          }}
          role="dialog"
          aria-modal="true"
          aria-label="승급 확인"
        >
          <div className="result-box promote-box" onClick={(e) => e.stopPropagation()}>
            <h2>승급</h2>
            <div className="promote-line">
              <span className="promote-officer">{officerOf(promoteTargetUnit).name}</span>
              <span className="promote-from">
                <em className="promote-icon">{classIcon(promo.from)}</em>
                {promo.from.name}
              </span>
              <span className="promote-arrow">→</span>
              <span className="promote-to">
                <em className="promote-icon">{classIcon(promo.target)}</em>
                {promo.target.name}
              </span>
            </div>
            <ul className="promote-changes">
              {promo.changes.map((c) => (
                <li key={c.text} className={c.up === null ? 'flat' : c.up ? 'up' : 'down'}>
                  {c.text}
                </li>
              ))}
              {promo.changes.length === 0 && <li className="flat">수치 변화 없음</li>}
              <li className="flat">사용하면 HP/MP가 모두 회복된다</li>
            </ul>
            <p className="promote-cost">
              {promoteUser.id === promoteTargetUnit.id
                ? `${promoteDef.name} 1 소모`
                : `${officerOf(promoteUser).name}이(가) ${promoteDef.name} 1 소모`}{' '}
              (보유 {consumableCount(state.consumables, promoteDef.id)} →{' '}
              {consumableCount(state.consumables, promoteDef.id) - 1})
            </p>
            <div className="promote-actions">
              <button
                className="promote-confirm"
                onClick={() => useItemAt(promoteDef.id, promoteTargetUnit.pos)}
                autoFocus
              >
                {euroRo(promo.target.name)} 승급한다
              </button>
              <button onClick={() => setPromoteConfirm(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {confirmEnd && isPlayerTurn && (
        <div className="result-overlay" onContextMenu={(e) => { e.preventDefault(); setConfirmEnd(false) }}>
          <div className="result-box">
            <h2>턴을 종료하시겠습니까?</h2>
            <button onClick={doEndTurn}>예</button>
            <button onClick={() => setConfirmEnd(false)}>아니오</button>
          </div>
        </div>
      )}

      {banner && (
        <Banner
          key={`${banner.color}:${banner.text}`}
          text={banner.text}
          color={banner.color}
          direction={banner.direction}
          durationScale={speed === 2 ? 0.25 : 1}
          onDone={handleBannerDone}
        />
      )}

      {state.result !== 'ongoing' && resultShown && state.pendingEvents.length === 0 && (
        <div className="result-overlay">
          <div className="result-box">
            <h2>{state.result === 'victory' ? '승리!' : '패배...'}</h2>
            {roster && state.result === 'victory' && <GrowthRecap roster={roster} state={state} />}
            {onFinish ? (
              state.result === 'victory' ? (
                <button onClick={() => onFinish('victory', state)}>진영으로</button>
              ) : (
                <>
                  <button onClick={onRestart}>다시 도전</button>
                  <button onClick={() => onFinish('defeat', state)}>진영으로</button>
                </>
              )
            ) : (
              <>
                <button onClick={onRestart}>다시 도전</button>
                <button onClick={onExit}>스테이지 선택</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 승리 시 부대별 성장 요약 (레벨업 유닛 상단 정렬) */
function GrowthRecap({ roster, state }: { roster: RosterEntry[]; state: BattleState }) {
  const after = state.units
    .filter((u) => u.faction === 'player')
    .map((u) => ({ officerId: u.officerId, level: u.level, exp: u.exp }))
  const rows = growthSummary(roster, after)
  return (
    <div className="growth-recap">
      {rows.map((r) => (
        <div key={r.officerId} className={`growth-row${r.levelAfter > r.levelBefore ? ' leveled' : ''}`}>
          <span className="growth-name">{OFFICERS[r.officerId]?.name ?? r.officerId}</span>
          <span>
            Lv {r.levelBefore}
            {r.levelAfter > r.levelBefore && <strong> → {r.levelAfter}</strong>}
          </span>
          <span className="growth-exp">
            EXP {r.expBefore} → {r.expAfter}
          </span>
        </div>
      ))}
    </div>
  )
}
