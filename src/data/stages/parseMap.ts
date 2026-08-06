// 문자 그리드 → MapDef 파서. 스테이지를 텍스트로 스케치할 수 있게 한다.

import type { MapDef, TerrainId } from '../../core/types'

const CHAR_TO_TERRAIN: Record<string, TerrainId> = {
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
}

export function parseMap(rows: string[]): MapDef {
  const height = rows.length
  const width = rows[0].length
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
