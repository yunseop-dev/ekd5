import { useMemo } from 'react'
import { classOf, unitAt } from '../core/battle'
import { keyOf } from '../core/movement'
import type { BattleState, Hazard, StatusId, UnitState, Vec2 } from '../core/types'
import { STATUSES } from '../data/statuses'
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

/** 상태이상 1글자 배지 — 44px 타일에 얹히므로 한 글자로 고정한다 (라벨 원문은 STATUSES) */
const STATUS_BADGE: Record<StatusId, string> = {
  poison: '毒',
  confusion: '乱',
  immobile: '縛',
  seal: '封',
}

/** 배지 표시 상한 — 넘치면 잘라서 토큰이 뭉개지지 않게 한다 */
const MAX_BADGES = 3

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
  /**
   * 명시 커서 위치 — 원작처럼 빈 타일에도 흰 사각 커서가 상시 뜬다.
   * 마우스 이동으로도, 화살표 키로도 같은 값이 움직인다 (BattleScreen이 소유).
   */
  cursorPos?: Vec2 | null
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
  const has = (id: StatusId) => unit.statuses.some((s) => s.id === id)
  const classes = [
    'unit-token',
    `f-${unit.faction}`,
    unit.acted && unit.faction === 'player' ? 'acted' : '',
    unit.isLeader ? 'leader' : '',
    unit.isBoss ? 'boss' : '',
    active ? 'ai-active' : '',
    unit.statuses.length > 0 ? 'afflicted' : '',
    // 원작은 상태이상을 아이콘 + 스프라이트 색 변조로 이중 표시한다 — 색 변조는 CSS가 담당
    has('poison') ? 'st-poison' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      {CLASS_ICON[unit.classId] ?? '?'}
      {/* 혼란 — 머리 위 물음표. 배지(乱)와 함께 떠서 원거리에서도 읽힌다 */}
      {has('confusion') && (
        <span className="confusion-mark" aria-hidden="true">
          ?
        </span>
      )}
      {unit.statuses.length > 0 && (
        <div className="status-badges">
          {unit.statuses.slice(0, MAX_BADGES).map((s, i) => (
            <span
              key={`${s.id}-${i}`}
              className={`status-badge sb-${s.id}`}
              title={STATUSES[s.id] ? `${STATUSES[s.id].name} — ${STATUSES[s.id].desc}` : s.id}
            >
              {STATUS_BADGE[s.id] ?? '?'}
            </span>
          ))}
        </div>
      )}
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
  cursorPos,
  activeUnitId,
  floaters,
  onCellClick,
  onCellHover,
  onCellRightClick,
}: Props) {
  const { width, height, tiles } = state.map

  /**
   * 화염 위험 지대 조회표. hazards는 W-core가 채우는 값이라 아직 비어 있을 수 있다 —
   * 없으면 아무것도 그리지 않는다(빈 배열/미정의 모두 안전).
   */
  const hazardByCell = useMemo(() => {
    const map = new Map<string, Hazard>()
    for (const h of state.hazards ?? []) map.set(keyOf(h.pos), h)
    return map
  }, [state.hazards])

  // 커서는 마우스를 보드 밖으로 빼도 지우지 않는다 — 키보드 조작과 위치를 공유하기 때문이다
  return (
    <div className="board-wrap">
      <div className="board" style={{ gridTemplateColumns: `repeat(${width}, 44px)` }}>
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const pos = { x, y }
            const key = keyOf(pos)
            const terrain = TERRAIN[tiles[y][x]]
            const unit = unitAt(state, pos)
            const isSelected = unit && unit.id === selectedUnitId
            const isInspected = unit && unit.id === inspectUnitId
            const isCursor = cursorPos?.x === x && cursorPos?.y === y
            const hazard = hazardByCell.get(key)
            const hazardText = hazard ? `불길 (${hazard.remainingTurns}턴)` : null
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
                title={`${terrain.name} (${x},${y})${hazardText ? `\n${hazardText}` : ''}`}
              >
                <span className="terrain-mark">{terrain.name[0]}</span>
                {moveCells.has(key) && <div className="overlay move" />}
                {attackCells.has(key) && <div className="overlay attack" />}
                {strategyCells.has(key) && <div className="overlay strategy" />}
                {aoeCells?.has(key) && <div className="overlay aoe" />}
                {inspectThreatCells?.has(key) && <div className="overlay inspect-threat" />}
                {inspectMoveCells?.has(key) && <div className="overlay inspect-move" />}
                {/* 선택 유닛의 체커 타일 — 원작처럼 토큰 아래 층에 깔린다 */}
                {isSelected && <div className="overlay selected-checker" />}
                {hazard && <div className="overlay hazard-fire" />}
                {unit && <UnitToken unit={unit} active={unit.id === activeUnitId} />}
                {isInspected && <div className="overlay inspect-mark" />}
                {isCursor && <div className="overlay tile-cursor" />}
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
