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
import { attackableCells, attackRangeUnion, keyOf, manhattan } from '../core/movement'
import type { BattleState, Faction, StageDef, UnitState, Vec2 } from '../core/types'
import { TERRAIN } from '../data/terrain'
import { Banner, type BannerProps } from './Banner'
import { BattleBoard } from './BattleBoard'
import { BattleLog } from './BattleLog'
import { ForecastPanel } from './ForecastPanel'
import { TerrainInfoPanel } from './TerrainInfoPanel'
import { UnitInfoPanel } from './UnitInfoPanel'
import './battle.css'

type SelMode = 'move' | 'menu' | 'attackTarget' | 'strategyTarget'

interface Selection {
  unitId: string
  mode: SelMode
  strategyId?: string
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
  miss: () => ({ text: 'MISS', kind: 'miss' }),
}

interface Props {
  stage: StageDef
  seed: number
  onExit: () => void
  onRestart: () => void
}

export function BattleScreen({ stage, seed, onExit, onRestart }: Props) {
  const [state, setState] = useState<BattleState>(() => startBattle(stage, seed))
  const [sel, setSel] = useState<Selection | null>(null)
  const [hover, setHover] = useState<Vec2 | null>(null)
  const [speed, setSpeed] = useState<PlaySpeed>(1)
  const [confirmEnd, setConfirmEnd] = useState(false)
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

  const strategyCells = useMemo(() => {
    const set = new Set<string>()
    if (sel?.mode === 'strategyTarget' && selectedUnit && sel.strategyId) {
      const strategy = knownStrategies(selectedUnit).find((s) => s.id === sel.strategyId)
      if (strategy) {
        for (let y = 0; y < state.map.height; y++) {
          for (let x = 0; x < state.map.width; x++) {
            if (manhattan(selectedUnit.pos, { x, y }) <= strategy.range) set.add(keyOf({ x, y }))
          }
        }
      }
    }
    return set
  }, [sel, selectedUnit, state])

  // ---------- 조작 ----------

  const isPlayerTurn = state.phase === 'player' && state.result === 'ongoing'

  function selectUnit(unit: UnitState) {
    setSel({ unitId: unit.id, mode: unit.moved ? 'menu' : 'move', undo: state })
  }

  function cancelSelection() {
    if (sel) setState(sel.undo)
    setSel(null)
  }

  function finishAction(next: BattleState) {
    setState(next)
    setSel(null)
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
    // 페이즈만 넘기면 AI 재생 useEffect가 이어받는다
    setState(applyAction(state, { type: 'endPhase' }))
  }

  /** 우클릭 = 원작 취소 버튼: 단계별 뒤로가기, 선택 없음 상태에서는 턴 종료 확인 */
  function handleRightClick() {
    if (!isPlayerTurn) return
    if (!sel) {
      setConfirmEnd(true)
      return
    }
    switch (sel.mode) {
      case 'attackTarget':
      case 'strategyTarget':
        setSel({ ...sel, mode: 'menu', strategyId: undefined })
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
      if (clicked && clicked.faction === 'player' && !clicked.acted) selectUnit(clicked)
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
        setSel({ ...sel, mode: 'menu' })
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
        selectedUnitId={sel?.unitId ?? null}
        activeUnitId={aiActiveId}
        floaters={floaters}
        onCellClick={handleCellClick}
        onCellHover={setHover}
        onCellRightClick={handleRightClick}
      />

      <aside className="side-panel">
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
              {knownStrategies(selectedUnit).map((s) => {
                const blocked =
                  selectedUnit.mp < s.mpCost || (s.element === 'fire' && state.weather === 'rain')
                return (
                  <button
                    key={s.id}
                    disabled={blocked}
                    onClick={() => setSel({ ...sel, mode: 'strategyTarget', strategyId: s.id })}
                  >
                    책략: {s.name} (MP {s.mpCost})
                  </button>
                )
              })}
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

        {forecastTarget && selectedUnit && (
          <ForecastPanel state={state} attacker={selectedUnit} defender={forecastTarget} />
        )}

        {(hoverUnit ?? selectedUnit ?? aiActiveUnit) && (
          <UnitInfoPanel state={state} unit={(hoverUnit ?? selectedUnit ?? aiActiveUnit)!} />
        )}

        {hover && <TerrainInfoPanel terrain={TERRAIN[state.map.tiles[hover.y][hover.x]]} />}

        <BattleLog log={state.log} />
      </aside>

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
            <button onClick={onRestart}>다시 도전</button>
            <button onClick={onExit}>스테이지 선택</button>
          </div>
        </div>
      )}
    </div>
  )
}
