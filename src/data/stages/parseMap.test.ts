// 문자 그리드 ↔ MapDef 왕복 검증 — 스테이지 JSON 이관(v1.1)의 무손실성을 지키는 테스트

import { describe, expect, it } from 'vitest'
import type { MapDef, TerrainId } from '../../core/types'
import { TERRAIN } from '../terrain'
import { STAGES } from './index'
import { CHAR_TO_TERRAIN, TERRAIN_TO_CHAR, mapToRows, parseMap } from './parseMap'

describe('parseMap ↔ mapToRows', () => {
  it('역맵은 CHAR_TO_TERRAIN에서 파생되며 모든 지형을 덮는다 (단일 출처)', () => {
    // 정의된 지형 전부에 문자가 있어야 한다 — 새 지형을 넣고 문자를 잊으면 여기서 걸린다
    for (const id of Object.keys(TERRAIN) as TerrainId[]) {
      expect(TERRAIN_TO_CHAR[id], `지형 ${id}의 문자`).toBeDefined()
    }
    // 왕복 일치: 문자 → 지형 → 문자
    for (const [ch, terrain] of Object.entries(CHAR_TO_TERRAIN)) {
      expect(TERRAIN_TO_CHAR[terrain], `문자 ${ch}`).toBe(ch)
    }
    expect(Object.keys(TERRAIN_TO_CHAR)).toHaveLength(Object.keys(CHAR_TO_TERRAIN).length)
  })

  it('rows → parseMap → mapToRows 가 원본 문자 그리드와 같다 (전 지형 1회 이상)', () => {
    const rows = ['PGFMWR', 'BTVCXD', 'EPGFMW']
    const map = parseMap(rows)
    expect(map.width).toBe(6)
    expect(map.height).toBe(3)
    expect(mapToRows(map)).toEqual(rows)
  })

  it('번들 스테이지 15개 전부: 맵이 문자 그리드로 무손실 왕복한다', () => {
    expect(STAGES).toHaveLength(15)
    for (const stage of STAGES) {
      const rows = mapToRows(stage.map)
      const reparsed = parseMap(rows)
      expect(reparsed, stage.id).toEqual(stage.map)
      expect(mapToRows(reparsed), stage.id).toEqual(rows)
      // 행 길이 = width, 행 수 = height
      expect(rows).toHaveLength(stage.map.height)
      for (const row of rows) expect(row.length, stage.id).toBe(stage.map.width)
    }
  })

  it('parseMap: 행 길이가 어긋나거나 모르는 문자가 있으면 throw', () => {
    expect(() => parseMap(['PPP', 'PP'])).toThrow(/길이 불일치/)
    expect(() => parseMap(['PZP'])).toThrow(/알 수 없는 지형 문자/)
    expect(() => parseMap([])).toThrow()
    expect(() => parseMap([''])).toThrow()
  })

  it('mapToRows: 문자가 없는 지형이 섞이면 throw (조용히 뭉개지 않는다)', () => {
    const broken: MapDef = { width: 2, height: 1, tiles: [['plain', 'lava' as TerrainId]] }
    expect(() => mapToRows(broken)).toThrow(/문자가 없는 지형/)
  })
})
