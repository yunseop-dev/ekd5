import { useMemo, useState } from 'react'
import { runAiPhase } from '../core/ai'
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
import type { BattleState, StageDef, UnitState, Vec2 } from '../core/types'
import { BattleBoard } from './BattleBoard'
import { BattleLog } from './BattleLog'
import { ForecastPanel } from './ForecastPanel'
import { UnitInfoPanel } from './UnitInfoPanel'
import './battle.css'

type SelMode = 'move' | 'menu' | 'attackTarget' | 'strategyTarget'

interface Selection {
  unitId: string
  mode: SelMode
  strategyId?: string
  undo: BattleState // 취소 시 복원 지점 (이동 전 상태)
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

  const selectedUnit = sel ? state.units.find((u) => u.id === sel.unitId) : undefined
  const hoverUnit = hover ? unitAt(state, hover) : undefined

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
    setSel(null)
    let next = applyAction(state, { type: 'endPhase' })
    // 우군/적군 페이즈를 AI로 자동 진행
    while (next.result === 'ongoing' && next.phase !== 'player') {
      next = runAiPhase(next, next.phase)
    }
    setState(next)
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
          <span className={`phase-${state.phase}`}>
            {state.phase === 'player' ? '아군 페이즈' : state.phase === 'enemy' ? '적군 페이즈' : '우군 페이즈'}
          </span>
          <span>{state.weather === 'clear' ? '맑음' : '비'}</span>
        </div>
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
        onCellClick={handleCellClick}
        onCellHover={setHover}
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

        {(hoverUnit ?? selectedUnit) && <UnitInfoPanel state={state} unit={(hoverUnit ?? selectedUnit)!} />}

        <BattleLog log={state.log} />
      </aside>

      {state.result !== 'ongoing' && (
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
