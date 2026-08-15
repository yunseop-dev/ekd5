import { describe, expect, it } from 'vitest'
import type { MoveContext, Occupancy } from './movement'
import { attackableCells, attackRangeUnion, keyOf, movementRange, pathTo } from './movement'
import type { Vec2 } from './types'

// 테스트용 5×5 맵. 코스트 그리드와 점유 맵을 직접 주입.
function ctx(over: Partial<MoveContext> = {}): MoveContext {
  return {
    width: 5,
    height: 5,
    costAt: () => 1,
    occupancyAt: () => 'free',
    movePoints: 2,
    ...over,
  }
}

describe('movementRange (다익스트라 이동범위)', () => {
  it('균일 코스트: 이동력 2면 맨해튼 거리 2 이내 전부 도달', () => {
    const range = movementRange({ x: 2, y: 2 }, ctx())
    // 1 + 4 + 8 = 13칸 (거리 0/1/2)
    expect(range.size).toBe(13)
    expect(range.get(keyOf({ x: 2, y: 0 }))?.cost).toBe(2)
    expect(range.has(keyOf({ x: 0, y: 0 }))).toBe(false)
  })

  it('지형 코스트 반영: 숲(2)을 우회하면 더 싼 경로를 찾는다', () => {
    // (1,2)만 코스트 3, 나머지 1. (0,2)까지 직진 3+1=불가? → 우회 1+1+1+1=4 > 이동력
    // 이동력 4로: 직진 (2,2)→(1,2)[3]→(0,2)[+1]=4 vs 우회 (2,1)(1,1)(0,1)(0,2)=4 → 도달 비용 4
    const costAt = (p: Vec2) => (p.x === 1 && p.y === 2 ? 3 : 1)
    const range = movementRange({ x: 2, y: 2 }, ctx({ costAt, movePoints: 4 }))
    expect(range.get(keyOf({ x: 0, y: 2 }))?.cost).toBe(4)
  })

  it('진입 불가 지형(null)은 도달 불가', () => {
    const costAt = (p: Vec2) => (p.y === 1 ? null : 1) // y=1 행 전체가 강
    const range = movementRange({ x: 2, y: 0 }, ctx({ costAt, movePoints: 10 }))
    expect(range.has(keyOf({ x: 2, y: 2 }))).toBe(false) // 강 건너편
    expect(range.has(keyOf({ x: 0, y: 0 }))).toBe(true) // 같은 행은 OK
  })

  it('적 유닛은 통과 불가, 아군은 통과 가능하지만 정지 불가', () => {
    const occupancyAt = (p: Vec2): Occupancy => {
      if (p.x === 2 && p.y === 1) return 'block' // 위쪽은 적이 막음
      if (p.x === 2 && p.y === 3) return 'pass' // 아래쪽은 아군
      return 'free'
    }
    const range = movementRange({ x: 2, y: 2 }, ctx({ occupancyAt }))
    expect(range.has(keyOf({ x: 2, y: 0 }))).toBe(false) // 적 뒤편 차단
    const allyCell = range.get(keyOf({ x: 2, y: 3 }))!
    expect(allyCell.canStop).toBe(false) // 아군 칸: 정지 불가
    expect(range.has(keyOf({ x: 2, y: 4 }))).toBe(true) // 아군 통과해서 도달
  })

  it('시작점은 항상 포함되고 비용 0', () => {
    const range = movementRange({ x: 0, y: 0 }, ctx({ movePoints: 0 }))
    expect(range.size).toBe(1)
    expect(range.get(keyOf({ x: 0, y: 0 }))?.cost).toBe(0)
  })
})

describe('pathTo (경로 복원)', () => {
  it('시작점부터 목적지까지 연속된 경로를 돌려준다', () => {
    const range = movementRange({ x: 0, y: 0 }, ctx({ movePoints: 4 }))
    const path = pathTo(range, { x: 2, y: 1 })!
    expect(path[0]).toEqual({ x: 0, y: 0 })
    expect(path[path.length - 1]).toEqual({ x: 2, y: 1 })
    expect(path.length).toBe(4) // 시작 포함 거리 3
    for (let i = 1; i < path.length; i++) {
      const d = Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)
      expect(d).toBe(1) // 인접 칸으로만 이동
    }
  })

  it('도달 불가/정지 불가 칸은 null', () => {
    const range = movementRange({ x: 0, y: 0 }, ctx({ movePoints: 1 }))
    expect(pathTo(range, { x: 4, y: 4 })).toBeNull()
  })
})

describe('attackableCells (사거리)', () => {
  it('근접(1~1): 상하좌우 4칸', () => {
    const cells = attackableCells({ x: 2, y: 2 }, 1, 1, 5, 5)
    expect(cells.length).toBe(4)
  })

  it('궁병(2~2): 인접 불가, 거리 2만 — 대각 포함 8칸', () => {
    const cells = attackableCells({ x: 2, y: 2 }, 2, 2, 5, 5)
    expect(cells.length).toBe(8)
    expect(cells.some((c) => c.x === 2 && c.y === 1)).toBe(false) // 인접 제외
    expect(cells.some((c) => c.x === 1 && c.y === 1)).toBe(true) // 대각 거리 2
  })

  it('맵 밖은 제외', () => {
    const cells = attackableCells({ x: 0, y: 0 }, 1, 1, 5, 5)
    expect(cells.length).toBe(2)
  })

  it('8방(체비쇼프 1): 상하좌우 + 대각 8칸 (보병/무도가/무희/적병 — classes.md §4.1)', () => {
    const cells = attackableCells({ x: 2, y: 2 }, 1, 1, 5, 5, 'chebyshev')
    expect(cells.length).toBe(8)
    expect(cells.some((c) => c.x === 1 && c.y === 1)).toBe(true) // 대각 포함
  })

  it('기본(맨해튼)과 8방(체비쇼프)은 대각 인접 여부만 다르다', () => {
    const manhattanCells = attackableCells({ x: 2, y: 2 }, 1, 1, 5, 5)
    const chebCells = attackableCells({ x: 2, y: 2 }, 1, 1, 5, 5, 'chebyshev')
    expect(manhattanCells).toHaveLength(4)
    expect(chebCells).toHaveLength(8)
  })
})

describe('attackRangeUnion (공격 범위 오버레이)', () => {
  it('이동 후 공격 가능한 모든 칸의 합집합', () => {
    const range = movementRange({ x: 2, y: 2 }, ctx({ movePoints: 1 }))
    const union = attackRangeUnion(range, 1, 1, 5, 5)
    // 이동 5칸(십자) 각각에서 사거리 1 → 거리 2 이내 십자 다이아몬드 전체
    expect(union.has(keyOf({ x: 2, y: 0 }))).toBe(true)
    expect(union.has(keyOf({ x: 1, y: 1 }))).toBe(true)
    expect(union.has(keyOf({ x: 0, y: 1 }))).toBe(false)
  })
})
