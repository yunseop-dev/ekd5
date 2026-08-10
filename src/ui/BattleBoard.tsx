import { classOf, unitAt } from '../core/battle'
import { keyOf } from '../core/movement'
import type { BattleState, UnitState, Vec2 } from '../core/types'
import { TERRAIN } from '../data/terrain'
import type { Floater } from './BattleScreen'

const TILE = 45 // 44px 타일 + 1px gap

const CLASS_ICON: Record<string, string> = {
  lord: '主',
  lightCavalry: '騎',
  heavyInfantry: '步',
  archer: '弓',
  strategist: '策',
  geomancer: '風',
  // 2차 병과 — 계열 아이콘 유지
  chancellor: '主',
  heavyCavalry: '騎',
  guardInfantry: '步',
  crossbowman: '弓',
  counselor: '策',
  seniorGeomancer: '風',
}

interface Props {
  state: BattleState
  moveCells: Set<string>
  attackCells: Set<string>
  strategyCells: Set<string>
  /** 책략 착탄 범위 프리뷰 (커서 기준) — 사거리(strategyCells)보다 위에 강조해서 얹는다 */
  aoeCells?: Set<string>
  /** 들여다보기: 적/우군의 이동 가능 칸 (주황) */
  inspectMoveCells?: Set<string>
  /** 들여다보기: 이동 후 공격이 닿는 칸 (연빨강) */
  inspectThreatCells?: Set<string>
  /** 들여다보는 유닛 — 타일에 점선 표시 */
  inspectUnitId?: string | null
  selectedUnitId: string | null
  /** AI 페이즈에서 현재 행동 중인 유닛 (하이라이트) */
  activeUnitId: string | null
  floaters: Floater[]
  onCellClick: (pos: Vec2) => void
  onCellHover: (pos: Vec2 | null) => void
  onCellRightClick?: (pos: Vec2) => void
}

function UnitToken({ unit, active }: { unit: UnitState; active: boolean }) {
  const ratio = unit.hp / unit.maxHp
  const hpClass = ratio <= 0.25 ? 'critical' : ratio <= 0.5 ? 'low' : ''
  const classes = [
    'unit-token',
    `f-${unit.faction}`,
    unit.acted && unit.faction === 'player' ? 'acted' : '',
    unit.isLeader ? 'leader' : '',
    unit.isBoss ? 'boss' : '',
    active ? 'ai-active' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      {CLASS_ICON[unit.classId] ?? '?'}
      <div className="hp-bar">
        <div className={hpClass} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

export function BattleBoard({
  state,
  moveCells,
  attackCells,
  strategyCells,
  aoeCells,
  inspectMoveCells,
  inspectThreatCells,
  inspectUnitId,
  selectedUnitId,
  activeUnitId,
  floaters,
  onCellClick,
  onCellHover,
  onCellRightClick,
}: Props) {
  const { width, height, tiles } = state.map

  return (
    <div className="board-wrap" onMouseLeave={() => onCellHover(null)}>
      <div className="board" style={{ gridTemplateColumns: `repeat(${width}, 44px)` }}>
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const pos = { x, y }
            const key = keyOf(pos)
            const terrain = TERRAIN[tiles[y][x]]
            const unit = unitAt(state, pos)
            const isSelected = unit && unit.id === selectedUnitId
            const isInspected = unit && unit.id === inspectUnitId
            return (
              <div
                key={key}
                className={`tile t-${terrain.id}`}
                onClick={() => onCellClick(pos)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onCellRightClick?.(pos)
                }}
                onMouseEnter={() => onCellHover(pos)}
                title={`${terrain.name} (${x},${y})`}
              >
                <span className="terrain-mark">{terrain.name[0]}</span>
                {moveCells.has(key) && <div className="overlay move" />}
                {attackCells.has(key) && <div className="overlay attack" />}
                {strategyCells.has(key) && <div className="overlay strategy" />}
                {aoeCells?.has(key) && <div className="overlay aoe" />}
                {inspectThreatCells?.has(key) && <div className="overlay inspect-threat" />}
                {inspectMoveCells?.has(key) && <div className="overlay inspect-move" />}
                {unit && <UnitToken unit={unit} active={unit.id === activeUnitId} />}
                {isSelected && <div className="overlay cursor" />}
                {isInspected && <div className="overlay inspect-mark" />}
              </div>
            )
          }),
        )}
        {floaters.map((f) => (
          <div
            key={f.id}
            className={`floater fl-${f.kind}`}
            style={{
              left: f.x * TILE + TILE / 2,
              top: f.y * TILE,
              animationDelay: `${f.delay}s`,
            }}
          >
            {f.text}
          </div>
        ))}
      </div>
    </div>
  )
}

export { CLASS_ICON }
export const classIconOf = (unit: UnitState): string => CLASS_ICON[classOf(unit).id] ?? '?'
