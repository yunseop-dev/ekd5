import { classOf, unitAt } from '../core/battle'
import { keyOf } from '../core/movement'
import type { BattleState, UnitState, Vec2 } from '../core/types'
import { TERRAIN } from '../data/terrain'

const CLASS_ICON: Record<string, string> = {
  lord: '主',
  lightCavalry: '騎',
  heavyInfantry: '步',
  archer: '弓',
  strategist: '策',
  geomancer: '風',
}

interface Props {
  state: BattleState
  moveCells: Set<string>
  attackCells: Set<string>
  strategyCells: Set<string>
  selectedUnitId: string | null
  onCellClick: (pos: Vec2) => void
  onCellHover: (pos: Vec2 | null) => void
}

function UnitToken({ unit }: { unit: UnitState }) {
  const ratio = unit.hp / unit.maxHp
  const hpClass = ratio <= 0.25 ? 'critical' : ratio <= 0.5 ? 'low' : ''
  const classes = [
    'unit-token',
    `f-${unit.faction}`,
    unit.acted && unit.faction === 'player' ? 'acted' : '',
    unit.isLeader ? 'leader' : '',
    unit.isBoss ? 'boss' : '',
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
  selectedUnitId,
  onCellClick,
  onCellHover,
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
            return (
              <div
                key={key}
                className={`tile t-${terrain.id}`}
                onClick={() => onCellClick(pos)}
                onMouseEnter={() => onCellHover(pos)}
                title={`${terrain.name} (${x},${y})`}
              >
                <span className="terrain-mark">{terrain.name[0]}</span>
                {moveCells.has(key) && <div className="overlay move" />}
                {attackCells.has(key) && <div className="overlay attack" />}
                {strategyCells.has(key) && <div className="overlay strategy" />}
                {unit && <UnitToken unit={unit} />}
                {isSelected && <div className="overlay cursor" />}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}

export { CLASS_ICON }
export const classIconOf = (unit: UnitState): string => CLASS_ICON[classOf(unit).id] ?? '?'
