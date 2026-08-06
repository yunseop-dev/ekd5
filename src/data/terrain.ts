// 지형 정의. 조조전 원칙(docs/research/caocao.md §2.4)을 따르는 설계값:
//  - 지형효과(%)는 물리 공방에만 적용
//  - 기병(horse): 평지 110 / 악지(숲·산·황무지) 80 — 지형만으로 30% 성능 차
//  - 보병(foot): 전 지형 100 이상
//  - 기병도 숲/산 통과 가능하되 이동 코스트가 큼 (조조전에서 도입된 규칙)
// 개별 % 수치는 원작 전체 표가 미확보라 위 원칙에 맞춘 설계값이다.

import type { TerrainDef, TerrainId } from '../core/types'

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
    effect: { foot: 105, horse: 80, wheel: 90, mage: 100 },
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
  fort: {
    id: 'fort',
    name: '성채',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 120, horse: 110, wheel: 110, mage: 115 },
    healPerTurn: 20,
  },
  village: {
    id: 'village',
    name: '마을',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 105, horse: 100, wheel: 100, mage: 105 },
    healPerTurn: 10,
  },
  castle: {
    id: 'castle',
    name: '성내',
    cost: { foot: 1, horse: 1, wheel: 1, mage: 1 },
    effect: { foot: 110, horse: 100, wheel: 100, mage: 105 },
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
    effect: { foot: 120, horse: 110, wheel: 110, mage: 115 },
  },
}
