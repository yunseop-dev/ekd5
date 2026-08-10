// 이동범위(지형 코스트 다익스트라) / 경로 / 사거리 계산.
// 데이터와 결합하지 않도록 코스트·점유 판정은 콜백으로 주입받는다.
// 참고: Red Blob Games — Dijkstra movement range (docs/research/tech.md §3)

import type { StrategyArea, Vec2 } from './types'

export const keyOf = (p: Vec2): string => `${p.x},${p.y}`

export const manhattan = (a: Vec2, b: Vec2): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

const DIRS: Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
]

/** 칸 점유 상태: block = 진입/통과 불가(적), pass = 통과만 가능(아군), free = 자유 */
export type Occupancy = 'block' | 'pass' | 'free'

export interface MoveContext {
  width: number
  height: number
  /** 지형 이동 코스트. null = 진입 불가 */
  costAt: (pos: Vec2) => number | null
  occupancyAt: (pos: Vec2) => Occupancy
  movePoints: number
}

export interface ReachableCell {
  pos: Vec2
  cost: number
  /** 아군이 점유 중인 칸은 통과만 가능, 정지 불가 */
  canStop: boolean
  fromKey: string | null
}

export type MovementRange = Map<string, ReachableCell>

/** 시작점에서 이동력 이내의 모든 도달 가능 칸 (다익스트라) */
export function movementRange(start: Vec2, ctx: MoveContext): MovementRange {
  const result: MovementRange = new Map()
  const startKey = keyOf(start)
  result.set(startKey, { pos: start, cost: 0, canStop: true, fromKey: null })

  // 맵이 작으므로(≤30×30) 단순 배열 기반 우선순위 큐로 충분
  const frontier: { key: string; cost: number }[] = [{ key: startKey, cost: 0 }]

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost)
    const current = frontier.shift()!
    const cell = result.get(current.key)!
    if (current.cost > cell.cost) continue // 이미 더 싼 경로로 방문됨

    for (const d of DIRS) {
      const next: Vec2 = { x: cell.pos.x + d.x, y: cell.pos.y + d.y }
      if (next.x < 0 || next.y < 0 || next.x >= ctx.width || next.y >= ctx.height) continue

      const terrainCost = ctx.costAt(next)
      if (terrainCost === null) continue

      const occ = ctx.occupancyAt(next)
      if (occ === 'block') continue

      const newCost = cell.cost + terrainCost
      if (newCost > ctx.movePoints) continue

      const nextKey = keyOf(next)
      const existing = result.get(nextKey)
      if (existing && existing.cost <= newCost) continue

      result.set(nextKey, {
        pos: next,
        cost: newCost,
        canStop: occ === 'free',
        fromKey: current.key,
      })
      frontier.push({ key: nextKey, cost: newCost })
    }
  }

  return result
}

/** 이동범위 결과에서 목적지까지의 경로 복원 (시작점 포함) */
export function pathTo(range: MovementRange, dest: Vec2): Vec2[] | null {
  const destCell = range.get(keyOf(dest))
  if (!destCell || !destCell.canStop) return null
  const path: Vec2[] = []
  let cur: ReachableCell | undefined = destCell
  while (cur) {
    path.unshift(cur.pos)
    cur = cur.fromKey ? range.get(cur.fromKey) : undefined
  }
  return path
}

/** 특정 칸에서 공격 가능한 칸 집합 (맨해튼 거리 min~max) */
export function attackableCells(
  from: Vec2,
  minRange: number,
  maxRange: number,
  width: number,
  height: number,
): Vec2[] {
  const cells: Vec2[] = []
  for (let dy = -maxRange; dy <= maxRange; dy++) {
    for (let dx = -maxRange; dx <= maxRange; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist < minRange || dist > maxRange) continue
      const p = { x: from.x + dx, y: from.y + dy }
      if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) continue
      cells.push(p)
    }
  }
  return cells
}

/**
 * 책략 영향 범위 — 중심 칸 기준의 상대 형태 (코어 리듀서·AI·UI 프리뷰 공용).
 * 맵 경계 클립은 하지 않는다 — 호출부가 걸러 쓴다 (unitAt은 밖 좌표에 undefined를 돌려줘 안전).
 */
export function strategyAreaCells(area: StrategyArea, center: Vec2): Vec2[] {
  switch (area) {
    case 'single':
      return [center]
    case 'cross':
      return [
        center,
        { x: center.x, y: center.y - 1 },
        { x: center.x, y: center.y + 1 },
        { x: center.x - 1, y: center.y },
        { x: center.x + 1, y: center.y },
      ]
    case 'square': {
      const cells: Vec2[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) cells.push({ x: center.x + dx, y: center.y + dy })
      }
      return cells
    }
  }
}

/** 이동 가능 전체 칸에서 공격 가능한 칸의 합집합 (UI 빨간 오버레이용) */
export function attackRangeUnion(
  range: MovementRange,
  minRange: number,
  maxRange: number,
  width: number,
  height: number,
): Set<string> {
  const union = new Set<string>()
  for (const cell of range.values()) {
    if (!cell.canStop) continue
    for (const p of attackableCells(cell.pos, minRange, maxRange, width, height)) {
      union.add(keyOf(p))
    }
  }
  return union
}
