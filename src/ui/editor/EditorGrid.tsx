// 에디터 전용 맵 그리드 — battle.css의 `.tile.t-*` 지형 색만 재사용한다.
// BattleBoard를 쓰지 않는 이유: BattleBoard는 BattleState(유닛/이동범위/선택)와 결합돼 있어
// StageDef만 있는 편집 화면에 맞지 않는다 (설계 §6.2).

import { keyOf } from '../../core/movement'
import type { MapDef, Vec2 } from '../../core/types'
import { TERRAIN } from '../../data/terrain'

export interface GridMark {
  label: string
  /** 진영 색 등 추가 클래스 (ed-mark-player / ed-mark-enemy / ed-mark-ally / ed-mark-slot) */
  className?: string
}

interface Props {
  map: MapDef
  size?: number
  /** keyOf(pos) → 셀에 얹을 표식 */
  marks?: Map<string, GridMark>
  /** keyOf(pos) 집합 — 좌표 픽커에서 고른 칸 */
  picked?: Set<string>
  /** keyOf(pos) — 선택 강조 1칸 */
  selectedKey?: string | null
  onCellDown?: (pos: Vec2) => void
  onCellEnter?: (pos: Vec2) => void
}

export function EditorGrid({ map, size = 34, marks, picked, selectedKey, onCellDown, onCellEnter }: Props) {
  return (
    <div className="ed-grid-wrap">
      <div className="ed-grid" style={{ gridTemplateColumns: `repeat(${map.width}, ${size}px)` }}>
        {map.tiles.map((row, y) =>
          row.map((terrain, x) => {
            const pos = { x, y }
            const key = keyOf(pos)
            const mark = marks?.get(key)
            return (
              <div
                key={key}
                className={`tile t-${terrain}${selectedKey === key ? ' ed-selected' : ''}`}
                style={{ width: size, height: size }}
                title={`${TERRAIN[terrain].name} (${x},${y})`}
                onMouseDown={(e) => {
                  e.preventDefault() // 드래그 페인팅 중 텍스트 선택 방지
                  onCellDown?.(pos)
                }}
                onMouseEnter={() => onCellEnter?.(pos)}
              >
                {picked?.has(key) && <div className="ed-pick" />}
                {mark && <span className={`ed-mark ${mark.className ?? ''}`}>{mark.label}</span>}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
