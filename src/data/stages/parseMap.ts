// 문자 그리드 ↔ MapDef 변환. 스테이지를 텍스트로 스케치할 수 있게 한다.
// CHAR_TO_TERRAIN이 문자↔지형 대응의 **단일 출처**다 — 역맵(TERRAIN_TO_CHAR)과
// 에디터 지형 팔레트는 모두 이 표에서 파생된다.

import type { MapDef, TerrainId } from '../../core/types'

export const CHAR_TO_TERRAIN: Record<string, TerrainId> = {
  P: 'plain',
  G: 'grass',
  F: 'forest',
  M: 'mountain',
  W: 'wasteland',
  R: 'river',
  B: 'bridge',
  T: 'fort',
  V: 'village',
  C: 'castle',
  X: 'wall',
  D: 'gate',
  E: 'gateClosed',
  S: 'ford',
}

/** 역맵 — CHAR_TO_TERRAIN에서 파생한다 (직접 손으로 쓰지 않는다: 두 표가 갈라지는 사고 방지) */
export const TERRAIN_TO_CHAR = Object.fromEntries(
  Object.entries(CHAR_TO_TERRAIN).map(([ch, terrain]) => [terrain, ch]),
) as Record<TerrainId, string>

export function parseMap(rows: string[]): MapDef {
  if (rows.length === 0) throw new Error('맵 행이 비어 있다')
  const height = rows.length
  const width = rows[0].length
  if (width === 0) throw new Error('맵 폭이 0이다')
  const tiles = rows.map((row, y) => {
    if (row.length !== width) throw new Error(`행 ${y} 길이 불일치: ${row.length} ≠ ${width}`)
    return [...row].map((ch, x) => {
      const t = CHAR_TO_TERRAIN[ch]
      if (!t) throw new Error(`알 수 없는 지형 문자 '${ch}' (${x},${y})`)
      return t
    })
  })
  return { width, height, tiles }
}

/** parseMap의 역함수 — MapDef를 문자 그리드로 되돌린다 (JSON 내보내기/스테이지 이관 공용) */
export function mapToRows(map: MapDef): string[] {
  return map.tiles.map((row, y) => {
    if (row.length !== map.width) throw new Error(`행 ${y} 길이 불일치: ${row.length} ≠ ${map.width}`)
    return row
      .map((terrain, x) => {
        const ch = TERRAIN_TO_CHAR[terrain]
        if (!ch) throw new Error(`문자가 없는 지형 '${terrain}' (${x},${y})`)
        return ch
      })
      .join('')
  })
}
