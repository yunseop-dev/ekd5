/**
 * 줌아웃 전체 지도 (v1.2) — 원작 조조전의 「지도」 모드.
 *
 * 44px 타일 보드는 큰 맵에서 전황이 한 화면에 안 들어온다. 원작은 전용 축소 지도를 띄워
 * 유닛을 진영색 사각 블록으로만 보여준다 — 어디에 몇이 뭉쳐 있는지가 한 번에 읽힌다.
 *
 * 지형색은 battle.css :root 의 --t-* 단일 출처(전투 보드·출진 미리보기와 공유)를 그대로 쓴다.
 * z-index 는 11 — 이벤트 오버레이(12·13)보다 아래, 결과 오버레이(10)보다 위.
 */

import { useEffect } from 'react'
import { keyOf } from '../core/movement'
import type { BattleState } from '../core/types'
import { TERRAIN } from '../data/terrain'

/** 축소 타일 크기 — 출진 미리보기(deploy.css PREVIEW_TILE)와 같은 16px */
const ZOOM_TILE = 16

interface Props {
  state: BattleState
  onClose: () => void
}

export function ZoomMapOverlay({ state, onClose }: Props) {
  const { width, height, tiles } = state.map

  // Escape 로 닫기 — 전투 화면의 커서/취소 조작은 오버레이가 열린 동안 멈춰 있다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const unitByCell = new Map<string, BattleState['units'][number]>()
  for (const u of state.units) {
    if (u.hp <= 0) continue
    unitByCell.set(keyOf(u.pos), u)
  }
  const hazardCells = new Set((state.hazards ?? []).map((h) => keyOf(h.pos)))

  const alive = (faction: 'player' | 'enemy' | 'ally') =>
    state.units.filter((u) => u.faction === faction && u.hp > 0).length

  return (
    <div
      className="zoom-map-overlay"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="전체 지도"
    >
      <div className="zoom-map-box" onClick={(e) => e.stopPropagation()}>
        <div className="zoom-map-head">
          <h3>전체 지도</h3>
          <span className="zoom-map-size">
            {width}×{height}
          </span>
          <button className="zoom-map-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="zoom-map-scroll">
          <div
            className="zoom-map-grid"
            style={{ gridTemplateColumns: `repeat(${width}, ${ZOOM_TILE}px)` }}
          >
            {Array.from({ length: height }, (_, y) =>
              Array.from({ length: width }, (_, x) => {
                const key = keyOf({ x, y })
                const terrain = TERRAIN[tiles[y][x]]
                const unit = unitByCell.get(key)
                // 지형색은 전투 보드의 `.tile.t-*` 를 그대로 재사용한다 — 색 값을 세 번째로
                // 적지 않기 위해서다 (크기는 인라인 스타일이 `.tile` 의 44px를 이긴다)
                return (
                  <div
                    key={key}
                    className={`tile zm-tile t-${terrain.id}`}
                    style={{ width: ZOOM_TILE, height: ZOOM_TILE }}
                    title={
                      unit
                        ? `${terrain.name} (${x},${y}) — ${unit.classId}`
                        : `${terrain.name} (${x},${y})`
                    }
                  >
                    {hazardCells.has(key) && <span className="zm-hazard" />}
                    {unit && (
                      <span
                        className={[
                          'zm-unit',
                          `zu-${unit.faction}`,
                          unit.isLeader ? 'leader' : '',
                          unit.isBoss ? 'boss' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      />
                    )}
                  </div>
                )
              }),
            )}
          </div>
        </div>

        <div className="zoom-map-legend">
          <span>
            <i className="zm-lg zu-player" /> 아군 {alive('player')}
          </span>
          <span>
            <i className="zm-lg zu-enemy" /> 적군 {alive('enemy')}
          </span>
          {alive('ally') > 0 && (
            <span>
              <i className="zm-lg zu-ally" /> 우군 {alive('ally')}
            </span>
          )}
          {hazardCells.size > 0 && (
            <span>
              <i className="zm-lg zm-lg-hazard" /> 불길 {hazardCells.size}
            </span>
          )}
          <span className="zoom-map-hint">클릭 또는 Esc로 닫기</span>
        </div>
      </div>
    </div>
  )
}
