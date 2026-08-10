// 편집 중인 스테이지(draft) 조작 헬퍼 — 전부 순수 함수, 불변 갱신.

import type { MapDef, StageDef, TerrainId, Vec2 } from '../../core/types'

/** 커스텀 스테이지 id 접두 — 번들 스테이지(stageXX)와의 충돌 방지 (설계 §6.1) */
export const CUSTOM_PREFIX = 'custom-'

const DEFAULT_WIDTH = 12
const DEFAULT_HEIGHT = 10

export function blankMap(width: number, height: number, fill: TerrainId = 'plain'): MapDef {
  return {
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => fill)),
  }
}

export function newDraft(): StageDef {
  return {
    id: `${CUSTOM_PREFIX}stage`,
    name: '새 스테이지',
    weather: 'clear',
    map: blankMap(DEFAULT_WIDTH, DEFAULT_HEIGHT),
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 4 }, isLeader: true },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 10, y: 4 } },
    ],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
  }
}

/** 번들/커스텀 스테이지를 편집 시작점으로 복제 — id에 custom- 접두를 강제한다 */
export function forkStage(stage: StageDef): StageDef {
  const copy = structuredClone(stage)
  copy.id = copy.id.startsWith(CUSTOM_PREFIX) ? copy.id : `${CUSTOM_PREFIX}${copy.id}`
  return copy
}

export function paintTile(map: MapDef, pos: Vec2, terrain: TerrainId): MapDef {
  if (pos.y < 0 || pos.y >= map.height || pos.x < 0 || pos.x >= map.width) return map
  if (map.tiles[pos.y][pos.x] === terrain) return map
  const tiles = map.tiles.map((row, y) =>
    y === pos.y ? row.map((t, x) => (x === pos.x ? terrain : t)) : row,
  )
  return { ...map, tiles }
}

/**
 * 맵 크기 변경 — 남는 칸은 평지로 채우고 기존 타일은 좌상단 기준으로 보존한다.
 * (행/열은 항상 끝에서 추가·삭제하므로 좌표가 밀리지 않는다 = 유닛/이벤트 좌표 안전)
 */
export function resizeMap(map: MapDef, width: number, height: number, fill: TerrainId = 'plain'): MapDef {
  const w = Math.max(1, Math.min(40, Math.trunc(width)))
  const h = Math.max(1, Math.min(40, Math.trunc(height)))
  const tiles = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => map.tiles[y]?.[x] ?? fill),
  )
  return { width: w, height: h, tiles }
}

/** 축소로 맵 밖에 남은 유닛/출진 슬롯을 떨어낸다. 반환: [정리된 draft, 제거 수] */
export function pruneOutOfBounds(draft: StageDef): [StageDef, number] {
  const inside = (p: Vec2) => p.x >= 0 && p.y >= 0 && p.x < draft.map.width && p.y < draft.map.height
  const units = draft.units.filter((u) => inside(u.pos))
  const slots = draft.playerSlots?.filter(inside)
  const removed =
    draft.units.length - units.length + (draft.playerSlots ? draft.playerSlots.length - (slots?.length ?? 0) : 0)
  if (removed === 0) return [draft, 0]
  return [{ ...draft, units, ...(draft.playerSlots ? { playerSlots: slots } : {}) }, removed]
}

/** 이벤트 id 자동 생성 — ev1, ev2 … (스테이지 내 유일) */
export function nextEventId(draft: StageDef): string {
  const used = new Set((draft.events ?? []).map((e) => e.id))
  for (let i = 1; ; i += 1) {
    const id = `ev${i}`
    if (!used.has(id)) return id
  }
}

/** 스테이지에 등장하는 officerId → 등장 횟수 (units + 증원) */
export function officerCounts(draft: StageDef): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const u of draft.units) bump(u.officerId)
  for (const r of draft.reinforcements) for (const u of r.units) bump(u.officerId)
  return counts
}

/**
 * 이벤트가 참조할 수 있는 장수 목록 = 스테이지 내 **유일하게** 등장하는 officerId.
 * 몹 장수(westInfantry 등 복수 배치)는 어느 유닛인지 특정할 수 없어 제외한다 (설계 §0 제약).
 */
export function uniqueOfficerIds(draft: StageDef): string[] {
  return [...officerCounts(draft)].filter(([, n]) => n === 1).map(([id]) => id)
}

/** 저장 id 충돌 회피 — custom-stage, custom-stage-2 … */
export function uniqueCustomId(base: string, taken: string[]): string {
  const id = base.startsWith(CUSTOM_PREFIX) ? base : `${CUSTOM_PREFIX}${base}`
  if (!taken.includes(id)) return id
  for (let i = 2; ; i += 1) {
    const candidate = `${id}-${i}`
    if (!taken.includes(candidate)) return candidate
  }
}
