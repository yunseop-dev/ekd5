// 탭1 맵 — 지형 팔레트 + 클릭/드래그 페인팅 + 행·열 추가/삭제

import { useEffect, useRef, useState } from 'react'
import { keyOf } from '../../core/movement'
import type { StageDef, TerrainId, Vec2 } from '../../core/types'
import { OFFICERS } from '../../data/officers'
import { TERRAIN } from '../../data/terrain'
import { paintTile, pruneOutOfBounds, resizeMap } from './draft'
import { EditorGrid, type GridMark } from './EditorGrid'
import { PALETTE_TERRAINS, TERRAIN_TO_CHAR } from './stageJson'

interface Props {
  draft: StageDef
  onChange: (next: StageDef) => void
  notify: (message: string) => void
}

/** 배치된 유닛은 페인팅 중에도 보이게 표식만 얹는다 (편집은 유닛 탭) */
export function unitMarks(draft: StageDef): Map<string, GridMark> {
  const marks = new Map<string, GridMark>()
  for (const unit of draft.units) {
    marks.set(keyOf(unit.pos), {
      label: (OFFICERS[unit.officerId]?.name ?? unit.officerId).slice(0, 1),
      className: `ed-mark-${unit.faction}`,
    })
  }
  return marks
}

export function MapTab({ draft, onChange, notify }: Props) {
  const [brush, setBrush] = useState<TerrainId>('plain')
  const painting = useRef(false)

  useEffect(() => {
    const stop = () => {
      painting.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const paint = (pos: Vec2) => {
    const map = paintTile(draft.map, pos, brush)
    if (map !== draft.map) onChange({ ...draft, map })
  }

  const applySize = (width: number, height: number) => {
    const map = resizeMap(draft.map, width, height)
    if (map.width === draft.map.width && map.height === draft.map.height) return
    const [next, removed] = pruneOutOfBounds({ ...draft, map })
    onChange(next)
    if (removed > 0) notify(`맵 축소로 범위를 벗어난 유닛/출진 슬롯 ${removed}개를 제거했습니다.`)
  }

  return (
    <div className="ed-tab ed-tab-map">
      <div className="panel-box ed-side">
        <h3>지형 팔레트</h3>
        <div className="ed-palette">
          {PALETTE_TERRAINS.map((id) => (
            <button
              key={id}
              type="button"
              className={`ed-swatch tile t-${id}${brush === id ? ' ed-selected' : ''}`}
              title={`${TERRAIN[id].name} (${TERRAIN_TO_CHAR[id]})`}
              onClick={() => setBrush(id)}
            >
              <span className="ed-swatch-label">{TERRAIN_TO_CHAR[id]}</span>
            </button>
          ))}
        </div>
        <p className="ed-hint">
          선택: <strong>{TERRAIN[brush].name}</strong> — 칸을 클릭하거나 끌어서 칠합니다.
        </p>

        <h3>크기</h3>
        <div className="ed-size">
          <div className="ed-row">
            <span>
              가로 {draft.map.width} × 세로 {draft.map.height}
            </span>
          </div>
          <div className="ed-row">
            <button type="button" className="title-btn" onClick={() => applySize(draft.map.width + 1, draft.map.height)}>
              열 +
            </button>
            <button type="button" className="title-btn" onClick={() => applySize(draft.map.width - 1, draft.map.height)}>
              열 −
            </button>
            <button type="button" className="title-btn" onClick={() => applySize(draft.map.width, draft.map.height + 1)}>
              행 +
            </button>
            <button type="button" className="title-btn" onClick={() => applySize(draft.map.width, draft.map.height - 1)}>
              행 −
            </button>
          </div>
          <p className="ed-hint">
            추가·삭제는 항상 오른쪽/아래 끝에서 일어납니다 (기존 타일과 좌표가 밀리지 않음).
          </p>
        </div>
      </div>

      <div className="ed-main">
        <EditorGrid
          map={draft.map}
          marks={unitMarks(draft)}
          onCellDown={(pos) => {
            painting.current = true
            paint(pos)
          }}
          onCellEnter={(pos) => {
            if (painting.current) paint(pos)
          }}
        />
      </div>
    </div>
  )
}
