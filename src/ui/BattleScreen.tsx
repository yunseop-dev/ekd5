import { useEffect, useMemo, useRef, useState } from 'react'
import { runAiPhase, stepAiUnit } from '../core/ai'
import {
  applyAction,
  classOf,
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
import { attackableCells, attackRangeUnion, keyOf, manhattan, strategyAreaCells } from '../core/movement'
import type {
  BattleState,
  ConsumableDef,
  ConsumableStack,
  Faction,
  StageDef,
  StrategyDef,
  UnitClassDef,
  UnitState,
  Vec2,
} from '../core/types'
import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { OFFICERS } from '../data/officers'
import { STRATEGIES } from '../data/strategies'
import { TERRAIN } from '../data/terrain'
import { Banner, type BannerProps } from './Banner'
import { BattleBoard, CLASS_ICON } from './BattleBoard'
import { BattleLog } from './BattleLog'
import { ForecastPanel } from './ForecastPanel'
import { TerrainInfoPanel } from './TerrainInfoPanel'
import { UnitInfoPanel } from './UnitInfoPanel'
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

export interface Floater {
  id: number
  x: number
  y: number
  text: string
  kind: 'damage' | 'crit' | 'counter' | 'heal' | 'miss'
  delay: number // 초 단위 stagger
}

/** 연출 속도: 1=보통, 2=빠름, 0=생략 */
type PlaySpeed = 1 | 2 | 0
const AI_STEP_MS = 700

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

const FLOATER_TEXT: Record<string, (n: number) => { text: string; kind: Floater['kind'] }> = {
  hit: (n) => ({ text: `${n}`, kind: 'damage' }),
  crit: (n) => ({ text: `회심! ${n}`, kind: 'crit' }),
  counterHit: (n) => ({ text: `반격! ${n}`, kind: 'counter' }),
  counterCrit: (n) => ({ text: `반격 회심! ${n}`, kind: 'crit' }),
  strategy: (n) => ({ text: `${n}`, kind: 'damage' }),
  heal: (n) => ({ text: `+${n}`, kind: 'heal' }),
  // 도구 사용(회복류) — 책략 회복과 같은 표기를 쓴다. 승급(인수)은 amount가 없어 플로터가 뜨지 않는다.
  item: (n) => ({ text: `+${n}`, kind: 'heal' }),
  miss: () => ({ text: 'MISS', kind: 'miss' }),
}

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

/** "중기병으로" / "군사로" — 받침(ㄹ 제외) 여부로 조사를 고른다 */
function euroRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`
}

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
  const [hover, setHover] = useState<Vec2 | null>(null)
  const [speed, setSpeed] = useState<PlaySpeed>(1)
  const [confirmEnd, setConfirmEnd] = useState(false)
  /** 인수 승급 확인 오버레이 (도구 메뉴에서 인수 선택 시) */
  const [promoteItemId, setPromoteItemId] = useState<string | null>(null)
  /** 이동/위협 범위를 들여다보는 유닛 — 선택(sel)과 독립. 적·우군·행동 완료 아군에 쓴다 */
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [aiActiveId, setAiActiveId] = useState<string | null>(null)
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [banner, setBanner] = useState<BannerSpec | null>(null)
  const [resultShown, setResultShown] = useState(false)
  const floaterSeq = useRef(0)
  const prevLogLen = useRef(state.log.length)
  const prevPhaseKey = useRef<string | null>(null)

  const selectedUnit = sel ? state.units.find((u) => u.id === sel.unitId) : undefined
  const hoverUnit = hover ? unitAt(state, hover) : undefined
  const aiActiveUnit = aiActiveId ? state.units.find((u) => u.id === aiActiveId) : undefined
  const inspectUnit = inspectId ? state.units.find((u) => u.id === inspectId) : undefined

  // ---------- 페이즈 전환 / 승패 배너 ----------

  // 속도 0(연출 생략)에서는 배너를 아예 띄우지 않는다 (즉시 처리 경로 유지)
  useEffect(() => {
    if (state.result !== 'ongoing') return
    const key = `${state.phase}:${state.turn}`
    if (prevPhaseKey.current === key) return
    prevPhaseKey.current = key
    if (speed === 0) return
    setBanner({
      text: `제 ${state.turn} 턴 · ${PHASE_LABEL[state.phase]}`,
      color: state.phase,
      direction: state.phase === 'enemy' ? 'right' : 'left',
    })
  }, [state.phase, state.turn, state.result, speed])

  // 페이즈가 바뀌면 들여다보기는 해제한다 (지난 페이즈의 사거리는 정보가 아니라 노이즈다)
  useEffect(() => setInspectId(null), [state.phase, state.turn])

  useEffect(() => {
    if (state.result === 'ongoing') return
    if (speed === 0) {
      setResultShown(true)
      return
    }
    setBanner(
      state.result === 'victory'
        ? { text: '승리!', color: 'gold', direction: 'left' }
        : { text: '패배...', color: 'enemy', direction: 'right' },
    )
  }, [state.result, speed])

  // 승급 확인 오버레이 — Escape 로 닫기
  useEffect(() => {
    if (!promoteItemId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPromoteItemId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [promoteItemId])

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
      // 연출 생략: 즉시 전부 처리
      setState((prev) => {
        let cur = prev
        while (cur.result === 'ongoing' && cur.phase !== 'player') cur = runAiPhase(cur, cur.phase)
        return cur
      })
      return
    }
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
      if (!e.targetId || e.amount === undefined) continue
      const target = state.units.find((u) => u.id === e.targetId)
      const mk = FLOATER_TEXT[e.type]
      if (!target || !mk) continue
      created.push({
        id: ++floaterSeq.current,
        x: target.pos.x,
        y: target.pos.y,
        delay: created.length * 0.25,
        ...mk(e.amount),
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

  /** 책략/도구 대상 지정 사거리 (보라 오버레이) — 도구는 range>0 인 것만 대상 지정이 필요하다 */
  const strategyCells = useMemo(() => {
    const set = new Set<string>()
    if (!selectedUnit) return set
    let range: number | null = null
    if (sel?.mode === 'strategyTarget' && sel.strategyId) {
      range = knownStrategies(selectedUnit).find((s) => s.id === sel.strategyId)?.range ?? null
    } else if (sel?.mode === 'itemTarget' && sel.itemId) {
      range = CONSUMABLES[sel.itemId]?.range ?? null
    }
    if (range === null) return set
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (manhattan(selectedUnit.pos, { x, y }) <= range) set.add(keyOf({ x, y }))
      }
    }
    return set
  }, [sel, selectedUnit, state])

  /** 책략 착탄 범위 프리뷰 — 커서가 사거리 안에 있을 때만, 맵 경계로 클립해서 보여준다 */
  const aoeCells = useMemo(() => {
    const set = new Set<string>()
    if (sel?.mode !== 'strategyTarget' || !selectedUnit || !sel.strategyId || !hover) return set
    if (!strategyCells.has(keyOf(hover))) return set
    const strategy = knownStrategies(selectedUnit).find((s) => s.id === sel.strategyId)
    if (!strategy) return set
    for (const p of strategyAreaCells(strategy.area, hover)) {
      if (p.x < 0 || p.y < 0 || p.x >= state.map.width || p.y >= state.map.height) continue
      set.add(keyOf(p))
    }
    return set
  }, [sel, selectedUnit, hover, strategyCells, state.map.width, state.map.height])

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

  const isPlayerTurn = state.phase === 'player' && state.result === 'ongoing'

  function selectUnit(unit: UnitState) {
    setInspectId(null) // 아군을 조작하기 시작하면 들여다보기는 끝난다
    setSel({ unitId: unit.id, mode: unit.moved ? 'menu' : 'move', undo: state })
  }

  function cancelSelection() {
    if (sel) setState(sel.undo)
    setSel(null)
    setPromoteItemId(null)
  }

  function finishAction(next: BattleState) {
    setState(next)
    setSel(null)
    setPromoteItemId(null)
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

  /** 도구 사용 — range 0 은 자기 위치를 대상으로 즉시, range>0 은 대상 지정 모드로 */
  function useItemAt(itemId: string, target: Vec2) {
    if (!selectedUnit) return
    const next = applyAction(state, { type: 'useItem', unitId: selectedUnit.id, itemId, target })
    if (next === state) return // 무효 액션 — 리듀서가 원본을 그대로 돌려준다
    finishAction(next)
  }

  /** 도구 메뉴에서 항목 선택 */
  function chooseItem(def: ConsumableDef) {
    if (!sel || !selectedUnit) return
    if (def.effect.kind === 'promotion') {
      setPromoteItemId(def.id) // 승급은 되돌릴 수 없다 — 확인 오버레이를 거친다
      return
    }
    if (def.range > 0) {
      setSel({ ...sel, mode: 'itemTarget', itemId: def.id })
      return
    }
    useItemAt(def.id, selectedUnit.pos)
  }

  /** 우클릭 = 원작 취소 버튼: 단계별 뒤로가기, 선택 없음 상태에서는 턴 종료 확인 */
  function handleRightClick() {
    if (!isPlayerTurn) return
    if (promoteItemId) {
      setPromoteItemId(null)
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
        if (sel.strategyId && strategyCells.has(keyOf(pos))) {
          const next = applyAction(state, {
            type: 'strategy',
            unitId: unit.id,
            strategyId: sel.strategyId,
            target: pos,
          })
          if (next !== state) {
            finishAction(next)
            return
          }
        }
        setSel({ ...sel, mode: 'strategyMenu', strategyId: undefined })
        return
      }
      case 'itemTarget': {
        if (sel.itemId && strategyCells.has(keyOf(pos))) {
          useItemAt(sel.itemId, pos)
          return
        }
        setSel({ ...sel, mode: 'itemMenu', itemId: undefined })
        return
      }
    }
  }

  function handleEndTurn() {
    if (!isPlayerTurn) return
    setConfirmEnd(true)
  }

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
    sel?.mode === 'attackTarget' && selectedUnit && hoverUnit && isHostile(selectedUnit, hoverUnit)
      ? hoverUnit
      : undefined

  /** 선택 유닛이 쓸 수 있는 책략 목록 + 개별 사용 가능 판정 */
  const strategies = selectedUnit ? knownStrategies(selectedUnit) : []
  const strategyBlockReason = (s: StrategyDef): string | null => {
    if (!selectedUnit) return '선택된 부대가 없다'
    if (s.element === 'fire' && state.weather === 'rain') return '우천 — 화계는 쓸 수 없다'
    if (selectedUnit.mp < s.mpCost) return `MP 부족 (${selectedUnit.mp}/${s.mpCost})`
    return null
  }
  const allStrategiesBlocked = strategies.length > 0 && strategies.every((s) => strategyBlockReason(s) !== null)

  /** 전투 로컬 도구 스톡 (수량 0·미등록 id 제외) */
  const itemStock = useMemo(
    () =>
      state.consumables
        .filter((s) => s.count > 0 && CONSUMABLES[s.itemId])
        .map((s) => ({ def: CONSUMABLES[s.itemId], count: s.count })),
    [state.consumables],
  )
  const itemTotal = itemStock.reduce((n, s) => n + s.count, 0)

  const promo = selectedUnit ? promotionInfoOf(selectedUnit) : null
  const promoteDef = promoteItemId ? CONSUMABLES[promoteItemId] : undefined

  /** 도구 1개의 사용 가능 여부 + 사유 (인수는 승급 조건, 회복류는 낭비 방지 — 코어는 거부하지 않는다) */
  const itemBlockReason = (def: ConsumableDef): string | null => {
    if (!selectedUnit) return '선택된 부대가 없다'
    if (def.effect.kind === 'promotion') return promo?.ok ? null : (promo?.reason ?? '승급할 수 없다')
    if (def.effect.kind === 'heal' && def.range === 0 && selectedUnit.hp >= selectedUnit.maxHp)
      return 'HP가 이미 가득하다'
    if (def.effect.kind === 'mpRestore' && def.range === 0 && selectedUnit.mp >= selectedUnit.maxMp)
      return 'MP가 이미 가득하다'
    return null
  }

  return (
    <div className="battle-screen">
      <header className="battle-header">
        <h2>{stage.name}</h2>
        <div className="turn-banner">
          <span>턴 {state.turn}</span>
          <span className={`phase-${state.phase}`}>{PHASE_LABEL[state.phase]}</span>
          <span>{state.weather === 'clear' ? '맑음' : '비'}</span>
        </div>
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
      </header>

      <BattleBoard
        state={state}
        moveCells={moveCells}
        attackCells={attackCells}
        strategyCells={strategyCells}
        aoeCells={aoeCells}
        inspectMoveCells={inspectMoveCells}
        inspectThreatCells={inspectThreatCells}
        inspectUnitId={inspectId}
        selectedUnitId={sel?.unitId ?? null}
        activeUnitId={aiActiveId}
        floaters={floaters}
        onCellClick={handleCellClick}
        onCellHover={setHover}
        onCellRightClick={handleRightClick}
      />

      <aside className="side-panel">
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
                  title={allStrategiesBlocked ? '쓸 수 있는 책략이 없다' : undefined}
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

        {(hoverUnit ?? selectedUnit ?? inspectUnit ?? aiActiveUnit) && (
          <UnitInfoPanel state={state} unit={(hoverUnit ?? selectedUnit ?? inspectUnit ?? aiActiveUnit)!} />
        )}

        {hover && <TerrainInfoPanel terrain={TERRAIN[state.map.tiles[hover.y][hover.x]]} />}

        <BattleLog log={state.log} />
      </aside>

      {/* 인수 승급 확인 — 되돌릴 수 없는 조작이라 확인 후 확정 */}
      {promoteItemId && promoteDef && selectedUnit && promo?.ok && promo.target && (
        <div
          className="result-overlay"
          onClick={() => setPromoteItemId(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setPromoteItemId(null)
          }}
          role="dialog"
          aria-modal="true"
          aria-label="승급 확인"
        >
          <div className="result-box promote-box" onClick={(e) => e.stopPropagation()}>
            <h2>승급</h2>
            <div className="promote-line">
              <span className="promote-officer">{officerOf(selectedUnit).name}</span>
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
              {promoteDef.name} 1 소모 (보유 {consumableCount(state.consumables, promoteDef.id)} →{' '}
              {consumableCount(state.consumables, promoteDef.id) - 1})
            </p>
            <div className="promote-actions">
              <button
                className="promote-confirm"
                onClick={() => useItemAt(promoteDef.id, selectedUnit.pos)}
                autoFocus
              >
                {euroRo(promo.target.name)} 승급한다
              </button>
              <button onClick={() => setPromoteItemId(null)}>취소</button>
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

      {state.result !== 'ongoing' && resultShown && (
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
