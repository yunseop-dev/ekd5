// 지형 정의. 조조전 원칙(docs/research/caocao.md §2.4)을 따르는 설계값:
//  - 지형효과(%)는 물리 공방에만 적용
//  - 기병(horse): 평지 110 / 악지(대하·산지) 80 — 지형만으로 30% 성능 차
//  - 보병(foot): 전 지형 100 이상
//  - 기병도 숲/산 통과 가능하되 이동 코스트가 큼 (조조전에서 도입된 규칙)
// 개별 % 수치는 원작 전체 표가 미확보라 위 원칙에 맞춘 설계값이다.
//
// v1.2 교정 — 한국어판 공략 확정치 반영 (docs/research 지형표 재확인):
//   기병 성능은 **숲 90 / 가옥(마을) 90 / 여울 80**이다. 숲은 "통과 가능하되 불리"(80 → 90)로,
//   마을은 시설 보정(110)이 아니라 가옥 특유의 기병 불리(90)가 적용된다.
//   마을의 매턴 회복(healPerTurn 20)은 그대로 유지한다.

import type { MapObjectDef, MapObjectKind, TerrainDef, TerrainId } from '../core/types'

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  plain: {
    id: 'plain',
    name: '평지',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 100, horse: 110, wheel: 100, mage: 100 },
  },
  grass: {
    id: 'grass',
    name: '초원',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 100, horse: 105, wheel: 100, mage: 100 },
  },
  forest: {
    id: 'forest',
    name: '숲',
    cost: { foot: 2, horse: 3, wheel: 3, mage: 2 },
    // 기병 90 — 원작 확정 (v1.2 교정: 80 → 90)
    effect: { foot: 105, horse: 90, wheel: 90, mage: 100 },
  },
  mountain: {
    id: 'mountain',
    name: '산지',
    cost: { foot: 3, horse: 4, wheel: null, mage: 3 },
    effect: { foot: 110, horse: 80, wheel: 100, mage: 100 },
  },
  wasteland: {
    id: 'wasteland',
    name: '황무지',
    cost: { foot: 1, horse: 2, wheel: 2, mage: 1 },
    effect: { foot: 100, horse: 90, wheel: 90, mage: 100 },
  },
  river: {
    id: 'river',
    name: '강',
    cost: { foot: null, horse: null, wheel: null, mage: null },
    effect: { foot: 100, horse: 100, wheel: 100, mage: 100 },
  },
  bridge: {
    id: 'bridge',
    name: '다리',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 100, horse: 100, wheel: 100, mage: 100 },
  },
  // 원작 확정치: 성·관문·요새 = 120%(★), 마을·병영 = 110%(◎) + 매턴 최대 HP 20% 회복
  // (docs/research/ux.md §4). ※ 마을의 기병만 예외로 90 — 가옥 기병 불리 (v1.2)
  fort: {
    id: 'fort',
    name: '성채',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 120, horse: 120, wheel: 120, mage: 120 },
    healPerTurn: 20,
  },
  village: {
    id: 'village',
    name: '마을',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    // 기병만 90 — 원작 확정: 가옥은 기병에게 불리하다 (v1.2 교정: 110 → 90).
    // 회복(healPerTurn)은 유지 — 시설 점유 보정과 기병 불리는 별개 규칙이다.
    effect: { foot: 110, horse: 90, wheel: 110, mage: 110 },
    healPerTurn: 20,
  },
  castle: {
    id: 'castle',
    name: '성내',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 120, horse: 120, wheel: 120, mage: 120 },
  },
  wall: {
    id: 'wall',
    name: '성벽',
    cost: { foot: null, horse: null, wheel: null, mage: null },
    effect: { foot: 100, horse: 100, wheel: 100, mage: 100 },
  },
  gate: {
    id: 'gate',
    name: '성문',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 120, horse: 120, wheel: 120, mage: 120 },
  },
  // 여울/늪 — 원작 확정: 기병 성능 80%. 차량은 진입 불가, 보행·기마는 소비 2 [설계값] (v1.2)
  ford: {
    id: 'ford',
    name: '여울',
    cost: { foot: 2, horse: 2, wheel: null, mage: 2 },
    effect: { foot: 100, horse: 80, wheel: 100, mage: 100 },
  },
  // 닫힌 성문 — 이벤트(setTile)로 'gate'가 되기 전까지 아무도 지나갈 수 없다 (v1.1)
  gateClosed: {
    id: 'gateClosed',
    name: '성문(닫힘)',
    cost: { foot: null, horse: null, wheel: null, mage: null },
    effect: { foot: 100, horse: 100, wheel: 100, mage: 100 },
  },
}

// ---------- 맵 오브젝트 (v1.3-objects) ----------
// 원작 "스프라이트가 타일 위" (kr-blog §59). 지형 위에 올려지는 오브젝트 메타.
// fence(목책)만 이동 차단(진입 불가), 나머지는 연출용(비차단). UI는 mark를 타일에 얹어 그린다.
export interface MapObjectMeta {
  id: MapObjectKind
  name: string
  /** 이동 차단 여부 — 목책은 진입 불가, 천막·깃발·사당은 지나갈 수 있다. */
  blocks: boolean
  /** UI에 표시할 1자 표식 (지형 이름 표식처럼). */
  mark: string
}
export const MAP_OBJECTS: Record<MapObjectKind, MapObjectMeta> = {
  fence: { id: 'fence', name: '목책', blocks: true, mark: '책' },
  tent: { id: 'tent', name: '천막', blocks: false, mark: '幕' },
  standard: { id: 'standard', name: '깃발', blocks: false, mark: '旗' },
  shrine: { id: 'shrine', name: '사당', blocks: false, mark: '祠' },
}

/** 특정 위치의 오브젝트 — 여러 개면 첫째만 (일반적으로 한 타일에 하나). */
export function objectAt(map: { objects?: MapObjectDef[] }, pos: { x: number; y: number }): MapObjectDef | undefined {
  return map.objects?.find((o) => o.pos.x === pos.x && o.pos.y === pos.y)
}
