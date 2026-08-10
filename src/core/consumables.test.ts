// v0.9 도구(소모품) — useItem 리듀서 · 범위 책략 조준 완화 · 지원 AI · 도구 상점.
// 근거: docs/research/items.md(도구), promotion.md §4(인수 = 승급 + HP/MP 완전회복)

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes'
import { CONSUMABLE_STOCK_MAX, CONSUMABLES, shopConsumables } from '../data/consumables'
import { STRATEGIES } from '../data/strategies'
import { decideUnit } from './ai'
import { applyAction, effectiveStats, startBattle } from './battle'
import type { RosterEntry } from './campaign'
import {
  applyVictory,
  buyConsumable,
  consumableCount,
  newCampaign,
  sellConsumable,
} from './campaign'
import { maxHp, maxMp, strategyHealAmount } from './formulas'
import { chebyshev, manhattan, strategyAreaCells } from './movement'
import type { BattleState, ConsumableStack, StageDef, TerrainId, UnitState } from './types'

// ---------- 헬퍼 ----------

/** 10×10 평지 맵 + 넘긴 유닛만 배치한 테스트 스테이지 */
function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'consumable-test',
    name: '도구 테스트',
    map: { width: 10, height: 10, tiles },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
    ],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const unit = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

/** 도구 스톡을 반입한 전투 (아군 로스터 오버라이드 가능) */
function mkBattle(
  stock: ConsumableStack[],
  over: Partial<StageDef> = {},
  roster?: RosterEntry[],
): BattleState {
  return startBattle(mkStage(over), 1, roster, undefined, stock)
}

const entry = (officerId: string, patch: Partial<RosterEntry> = {}): RosterEntry => ({
  officerId,
  level: 15,
  exp: 0,
  equipment: {},
  statBonus: {},
  ...patch,
})

// ---------- useItem: 회복 계열 ----------

describe('useItem — 회복 도구', () => {
  it('HP를 회복하고 스톡을 1 차감하며 행동을 소진한다', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 2 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 40
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos })

    expect(unit(next, 'caocao').hp).toBe(120) // 40 + 80 (회복의 쌀)
    expect(consumableCount(next.consumables, 'hoebokSsal')).toBe(1)
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(unit(next, 'caocao').moved).toBe(true)
    // 원본 불변
    expect(unit(state, 'caocao').hp).toBe(40)
    expect(consumableCount(state.consumables, 'hoebokSsal')).toBe(2)
  })

  it('회복량은 maxHp에서 잘리고, 로그 detail은 실제 회복량이다 (UI 플로터 계약)', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = caocao.maxHp - 10
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos })

    expect(unit(next, 'caocao').hp).toBe(caocao.maxHp)
    const entryLog = next.log.filter((l) => l.type === 'item').at(-1)!
    expect(entryLog.targetId).toBe(caocao.id)
    expect(entryLog.amount).toBe(10)
  })

  it('마지막 1개를 쓰면 스택이 목록에서 사라진다', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos })
    expect(next.consumables).toEqual([])
  })

  it('신비로운 물은 MP를 회복한다 (maxMp 캡)', () => {
    const state = mkBattle([{ itemId: 'sinbiMul', count: 1 }], {
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'guojia', faction: 'player', pos: { x: 2, y: 1 }, level: 5 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    const guojia = unit(state, 'guojia')
    guojia.mp = 1
    const next = applyAction(state, {
      type: 'useItem',
      unitId: guojia.id,
      itemId: 'sinbiMul',
      target: guojia.pos,
    })
    expect(unit(next, 'guojia').mp).toBe(31) // 1 + 30

    // 캡: MP가 거의 찬 상태
    const full = mkBattle([{ itemId: 'sinbiMul', count: 1 }], {
      units: [{ officerId: 'guojia', faction: 'player', pos: { x: 2, y: 1 }, level: 5 }],
    })
    const g2 = unit(full, 'guojia')
    g2.mp = g2.maxMp - 3
    const capped = applyAction(full, { type: 'useItem', unitId: g2.id, itemId: 'sinbiMul', target: g2.pos })
    expect(unit(capped, 'guojia').mp).toBe(g2.maxMp)
    expect(capped.log.filter((l) => l.type === 'item').at(-1)!.amount).toBe(3)
  })
})

// ---------- useItem: 상태이상 해제 (원작 해제약 4종 + 만능약) ----------

describe('useItem — 상태이상 해제약', () => {
  /** 조조에게 독+금책을 걸어둔 전투 */
  const afflicted = (stock: ConsumableStack[]): BattleState => {
    const state = mkBattle(stock)
    unit(state, 'caocao').statuses = [{ id: 'poison' }, { id: 'seal' }]
    return state
  }

  it('해독약은 독만 떨어내고 나머지 상태는 남긴다', () => {
    const state = afflicted([{ itemId: 'haedokYak', count: 2 }])
    const caocao = unit(state, 'caocao')
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'haedokYak', target: caocao.pos })

    expect(unit(next, 'caocao').statuses.map((s) => s.id)).toEqual(['seal'])
    expect(consumableCount(next.consumables, 'haedokYak')).toBe(1)
    expect(unit(next, 'caocao').acted).toBe(true)
    // 원본 불변
    expect(unit(state, 'caocao').statuses).toHaveLength(2)
  })

  it('해제약 4종은 각자 자기 상태만 담당한다', () => {
    const matrix: [string, string][] = [
      ['haedokYak', 'poison'],
      ['gakseongYak', 'confusion'],
      ['dopoYak', 'immobile'],
      ['yangchiYak', 'seal'],
    ]
    for (const [itemId, statusId] of matrix) {
      const def = CONSUMABLES[itemId]
      expect(def.effect, itemId).toEqual({ kind: 'cureStatus', statuses: [statusId] })
    }
  })

  it('만능약은 모든 상태이상을 한 번에 해제한다 (혼란 포함 → 인접 아군이 먹여준다)', () => {
    // v1.0: 혼란은 행동 불가라 자기 자신에게는 도구를 쓸 수 없다 → 만능약도 인접 아군 경로로만 닿는다.
    const state = mkBattle([{ itemId: 'mannungYak', count: 1 }], {
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 3 } }, // 대각 인접
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    const caocao = unit(state, 'caocao')
    caocao.statuses = [{ id: 'poison' }, { id: 'seal' }, { id: 'confusion' }, { id: 'immobile' }]
    const next = applyAction(state, {
      type: 'useItem',
      unitId: unit(state, 'dianwei').id,
      itemId: 'mannungYak',
      target: caocao.pos,
    })
    expect(unit(next, 'caocao').statuses).toEqual([])
  })

  it('혼란에 빠진 부대는 스스로 각성약을 쓸 수 없다 (원작 비고의 근거 게이트)', () => {
    const state = mkBattle([{ itemId: 'gakseongYak', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.statuses = [{ id: 'confusion' }]
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'gakseongYak', target: caocao.pos }),
    ).toBe(state)
  })

  it('해제할 것이 없어도 소모되고 행동이 끝난다 (원작: 효과 0 사용 허용 — 낭비 방지는 UI 몫)', () => {
    const state = mkBattle([{ itemId: 'haedokYak', count: 1 }])
    const caocao = unit(state, 'caocao')
    expect(caocao.statuses).toEqual([])
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'haedokYak', target: caocao.pos })

    expect(next).not.toBe(state)
    expect(next.consumables).toEqual([])
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(next.log.filter((l) => l.type === 'item').at(-1)!.message).toContain('0개')
  })

  it('인접 아군의 상태이상도 풀어줄 수 있다 (진영 + 체비쇼프 게이트 공유)', () => {
    const state = mkBattle([{ itemId: 'gakseongYak', count: 1 }], {
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 3 } }, // 대각 인접
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    const dianwei = unit(state, 'dianwei')
    dianwei.statuses = [{ id: 'confusion' }]
    const next = applyAction(state, {
      type: 'useItem',
      unitId: unit(state, 'caocao').id,
      itemId: 'gakseongYak',
      target: dianwei.pos,
    })
    expect(unit(next, 'dianwei').statuses).toEqual([])
    // 원작 비고: 혼란은 행동 불가라 자기 자신에게 각성약을 쓸 수 없다 → 인접 사용이 필수 경로
  })
})

// ---------- useItem: 무효 액션 매트릭스 ----------

describe('useItem — 무효 액션은 원본 참조를 그대로 돌려준다', () => {
  it('스톡이 0이면 거부', () => {
    const state = mkBattle([])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos }),
    ).toBe(state)
  })

  it('미등록 도구 id는 거부', () => {
    const state = mkBattle([{ itemId: 'nonexistent', count: 5 }])
    const caocao = unit(state, 'caocao')
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'nonexistent', target: caocao.pos }),
    ).toBe(state)
  })

  it('없는 유닛 / 격파된 유닛은 거부', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    expect(applyAction(state, { type: 'useItem', unitId: 'nobody', itemId: 'hoebokSsal', target: { x: 1, y: 1 } })).toBe(
      state,
    )
    const dead = unit(state, 'caocao')
    dead.hp = 0
    expect(applyAction(state, { type: 'useItem', unitId: dead.id, itemId: 'hoebokSsal', target: dead.pos })).toBe(state)
  })

  it('타 진영 페이즈에는 거부', () => {
    let state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    state = applyAction(state, { type: 'endPhase' }) // → enemy 페이즈
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(state.phase).toBe('enemy')
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos }),
    ).toBe(state)
  })

  it('이미 행동한 부대는 거부', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    const after = applyAction(state, { type: 'wait', unitId: caocao.id })
    const acted = unit(after, 'caocao')
    expect(
      applyAction(after, { type: 'useItem', unitId: acted.id, itemId: 'hoebokSsal', target: acted.pos }),
    ).toBe(after)
  })

  it('빈 칸은 대상이 되지 않는다 (인접이어도 유닛이 없으면 거부)', () => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(
      applyAction(state, {
        type: 'useItem',
        unitId: caocao.id,
        itemId: 'hoebokSsal',
        target: { x: caocao.pos.x + 1, y: caocao.pos.y },
      }),
    ).toBe(state)
  })
})

// ---------- useItem: 대상 게이트 (원작 = 진영 일치 + 체비쇼프 ≤ range) ----------

describe('useItem — 대상 게이트는 진영 일치 + 체비쇼프 거리', () => {
  /** 조조(2,2) 주변에 아군을 흩뿌린 배치 — 직선 인접 / 대각 인접 / 거리 2 */
  const neighborStage = (): Partial<StageDef> => ({
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
      { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 2 } }, // 직선 인접
      { officerId: 'xiahoudun', faction: 'player', pos: { x: 3, y: 3 } }, // 대각 인접 (맨해튼 2 / 체비쇼프 1)
      { officerId: 'xiahouyuan', faction: 'player', pos: { x: 4, y: 2 } }, // 거리 2
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 3 } }, // 인접한 적
    ],
  })

  const woundedBattle = (): BattleState => {
    const state = mkBattle([{ itemId: 'hoebokSsal', count: 4 }], neighborStage())
    for (const officerId of ['dianwei', 'xiahoudun', 'xiahouyuan']) unit(state, officerId).hp = 20
    return state
  }

  it('직선으로 인접한 아군에게 쓸 수 있다', () => {
    const state = woundedBattle()
    const target = unit(state, 'dianwei')
    const next = applyAction(state, {
      type: 'useItem',
      unitId: unit(state, 'caocao').id,
      itemId: 'hoebokSsal',
      target: target.pos,
    })
    expect(unit(next, 'dianwei').hp).toBe(100) // 20 + 80
  })

  it('대각선으로 인접한 아군에게도 쓸 수 있다 (체비쇼프 1 — 맨해튼이면 2라 막혔을 자리)', () => {
    const state = woundedBattle()
    const diagonal = unit(state, 'xiahoudun')
    expect(chebyshev(unit(state, 'caocao').pos, diagonal.pos)).toBe(1)
    expect(manhattan(unit(state, 'caocao').pos, diagonal.pos)).toBe(2)
    const next = applyAction(state, {
      type: 'useItem',
      unitId: unit(state, 'caocao').id,
      itemId: 'hoebokSsal',
      target: diagonal.pos,
    })
    expect(unit(next, 'xiahoudun').hp).toBe(100)
  })

  it('거리 2 아군은 거부', () => {
    const state = woundedBattle()
    const far = unit(state, 'xiahouyuan')
    expect(chebyshev(unit(state, 'caocao').pos, far.pos)).toBe(2)
    expect(
      applyAction(state, { type: 'useItem', unitId: unit(state, 'caocao').id, itemId: 'hoebokSsal', target: far.pos }),
    ).toBe(state)
  })

  it('인접한 적에게는 쓸 수 없다', () => {
    const state = woundedBattle()
    const foe = unit(state, 'yellowInfantry')
    foe.hp = 10
    expect(
      applyAction(state, { type: 'useItem', unitId: unit(state, 'caocao').id, itemId: 'hoebokSsal', target: foe.pos }),
    ).toBe(state)
  })

  it('자기 자신은 거리 0으로 자연 통과한다 (자기 전용 특례 없음)', () => {
    const state = woundedBattle()
    const caocao = unit(state, 'caocao')
    caocao.hp = 30
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos })
    expect(unit(next, 'caocao').hp).toBe(110) // 30 + 80
  })

  it('사용자만 행동을 소진하고, 대상은 자기 턴을 잃지 않는다', () => {
    const state = woundedBattle()
    const next = applyAction(state, {
      type: 'useItem',
      unitId: unit(state, 'caocao').id,
      itemId: 'hoebokSsal',
      target: unit(state, 'dianwei').pos,
    })
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(unit(next, 'caocao').moved).toBe(true)
    expect(unit(next, 'dianwei').acted).toBe(false)
    expect(unit(next, 'dianwei').moved).toBe(false)
  })
})

// ---------- useItem: range 값이 그대로 체비쇼프 반경으로 쓰인다 ----------

describe('useItem — range는 체비쇼프 반경 (1로 하드코딩된 게 아니다)', () => {
  // 현재 데이터의 도구는 전부 range 1이라, 반경이 실제로 def.range에서 온다는 것은 임시 정의로 확인한다.
  const RANGED = 'testTonic'

  beforeAll(() => {
    CONSUMABLES[RANGED] = {
      id: RANGED,
      name: '시험용 탕약',
      desc: '테스트 전용 — 체비쇼프 2의 회복 도구',
      price: 100,
      range: 2,
      effect: { kind: 'heal', amount: 40 },
    }
  })
  afterAll(() => {
    delete CONSUMABLES[RANGED]
  })

  it('range 2 도구는 대각 2칸(체비쇼프 2 = 맨해튼 4)까지 닿는다', () => {
    const state = mkBattle([{ itemId: RANGED, count: 2 }], {
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 4, y: 4 } }, // 체비쇼프 2 / 맨해튼 4
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 5, y: 5 } }, // 체비쇼프 3
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    const caocao = unit(state, 'caocao')
    const reachable = unit(state, 'dianwei')
    const tooFar = unit(state, 'xiahoudun')
    reachable.hp = 20
    tooFar.hp = 20
    expect(manhattan(caocao.pos, reachable.pos)).toBe(4)

    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: RANGED, target: reachable.pos })
    expect(unit(next, 'dianwei').hp).toBe(60)
    // 체비쇼프 3은 여전히 사거리 밖
    expect(applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: RANGED, target: tooFar.pos })).toBe(state)
  })
})

// ---------- useItem: 인수(승급) ----------

describe('useItem — 인수(印綬)', () => {
  const insuBattle = (level: number, classId?: string): BattleState =>
    mkBattle(
      [{ itemId: 'insu', count: 1 }],
      {
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 } },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      },
      [entry('xiahoudun', { level, classId })],
    )

  it('Lv15 + 상위 병과가 있으면 승급 + HP/MP 완전회복 + 스톡 소비', () => {
    const state = insuBattle(15)
    const dun = unit(state, 'xiahoudun')
    dun.hp = 20
    dun.mp = 0
    const next = applyAction(state, { type: 'useItem', unitId: dun.id, itemId: 'insu', target: dun.pos })
    const after = unit(next, 'xiahoudun')

    expect(after.classId).toBe('heavyCavalry')
    expect(after.maxHp).toBe(maxHp(CLASSES.heavyCavalry, 15))
    expect(after.maxMp).toBe(maxMp(CLASSES.heavyCavalry, 15))
    expect(after.hp).toBe(after.maxHp)
    expect(after.mp).toBe(after.maxMp)
    expect(after.level).toBe(15) // 승급은 레벨을 올리지 않는다
    expect(after.acted).toBe(true)
    expect(next.consumables).toEqual([])

    // 로그 계약: type 'promote' + 병과명 (W2 의존)
    const promoteLog = next.log.filter((l) => l.type === 'promote').at(-1)!
    expect(promoteLog.message).toContain(CLASSES.heavyCavalry.name)
    expect(promoteLog.targetId).toBe(after.id)
  })

  it('Lv14는 거부 (경계: Lv14 ✗ / Lv15 ✓)', () => {
    const low = insuBattle(14)
    const dun = unit(low, 'xiahoudun')
    expect(applyAction(low, { type: 'useItem', unitId: dun.id, itemId: 'insu', target: dun.pos })).toBe(low)

    const ok = insuBattle(15)
    const dun2 = unit(ok, 'xiahoudun')
    expect(applyAction(ok, { type: 'useItem', unitId: dun2.id, itemId: 'insu', target: dun2.pos })).not.toBe(ok)
  })

  it('이미 2차 병과면 거부 — 인수를 낭비하지 않는다', () => {
    const state = insuBattle(30, 'heavyCavalry')
    const dun = unit(state, 'xiahoudun')
    expect(applyAction(state, { type: 'useItem', unitId: dun.id, itemId: 'insu', target: dun.pos })).toBe(state)
  })

  it('인접한 아군에게도 쓸 수 있다 — 대상만 승급하고 사용자만 행동을 소진한다 (대각선 포함)', () => {
    const state = mkBattle(
      [{ itemId: 'insu', count: 1 }],
      {
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 3, y: 3 } }, // 대각 인접
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      },
      [entry('xiahoudun', { level: 15 })],
    )
    const caocao = unit(state, 'caocao')
    const dun = unit(state, 'xiahoudun')
    dun.hp = 30
    expect(chebyshev(caocao.pos, dun.pos)).toBe(1)

    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'insu', target: dun.pos })
    const promoted = unit(next, 'xiahoudun')
    expect(promoted.classId).toBe('heavyCavalry')
    expect(promoted.hp).toBe(promoted.maxHp)
    expect(promoted.mp).toBe(promoted.maxMp)
    // 승급한 쪽은 자기 턴을 잃지 않고, 인수를 쓴 조조만 행동을 소진한다
    expect(promoted.acted).toBe(false)
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(unit(next, 'caocao').classId).toBe('lord') // 사용자는 승급하지 않는다
    expect(next.consumables).toEqual([])
  })

  it('거리 2의 아군에게는 인수를 쓸 수 없다', () => {
    const state = mkBattle(
      [{ itemId: 'insu', count: 1 }],
      {
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 4, y: 2 } },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      },
      [entry('xiahoudun', { level: 15 })],
    )
    const caocao = unit(state, 'caocao')
    const dun = unit(state, 'xiahoudun')
    expect(applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'insu', target: dun.pos })).toBe(state)
  })

  it('승급 조건을 못 채운 인접 아군에게 쓰면 거부된다 (인수 낭비 방지)', () => {
    const state = mkBattle(
      [{ itemId: 'insu', count: 1 }],
      {
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 3, y: 2 } },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      },
      [entry('xiahoudun', { level: 14 })],
    )
    const caocao = unit(state, 'caocao')
    const dun = unit(state, 'xiahoudun')
    expect(applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'insu', target: dun.pos })).toBe(state)
  })

  it('승급하면 2차 전용 책략이 그 자리에서 열린다 (knownStrategies는 병과 파생)', () => {
    const state = mkBattle(
      [{ itemId: 'insu', count: 1 }],
      {
        units: [
          { officerId: 'guojia', faction: 'player', pos: { x: 2, y: 1 } },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      },
      [entry('guojia', { level: 15 })],
    )
    const guojia = unit(state, 'guojia')
    const next = applyAction(state, { type: 'useItem', unitId: guojia.id, itemId: 'insu', target: guojia.pos })
    expect(unit(next, 'guojia').classId).toBe('counselor')
    expect(CLASSES.counselor.strategies.some((s) => s.strategyId === 'hwaryong')).toBe(true)
  })
})

// ---------- 범위 책략 조준 완화 ----------

describe('strategyAreaCells', () => {
  it('single 1칸 / cross 십자 5칸 / square 3×3 9칸', () => {
    const center = { x: 4, y: 4 }
    expect(strategyAreaCells('single', center)).toEqual([center])
    expect(strategyAreaCells('cross', center)).toHaveLength(5)
    expect(strategyAreaCells('square', center)).toHaveLength(9)
    expect(strategyAreaCells('cross', center)).toEqual([
      { x: 4, y: 4 },
      { x: 4, y: 3 },
      { x: 4, y: 5 },
      { x: 3, y: 4 },
      { x: 5, y: 4 },
    ])
    // square는 중심을 포함한 3×3 전부
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        expect(strategyAreaCells('square', center)).toContainEqual({ x: 4 + dx, y: 4 + dy })
      }
    }
  })

  it('맵 경계 클립은 하지 않는다 — 음수 좌표도 그대로 돌려준다 (호출부가 걸러 쓴다)', () => {
    expect(strategyAreaCells('cross', { x: 0, y: 0 })).toContainEqual({ x: -1, y: 0 })
    expect(strategyAreaCells('square', { x: 0, y: 0 })).toContainEqual({ x: -1, y: -1 })
    // 리듀서는 unitAt이 맵 밖 좌표에 undefined를 돌려주는 것으로 안전을 확보한다
  })
})

describe('범위 책략 — 중심 칸은 유닛이 있어야 한다 (원작 조준 규칙)', () => {
  /** 곽가(책사) Lv8 = 화진(십자, MP12, 사거리4) 보유 */
  const aoeStage = (): Partial<StageDef> => ({
    units: [
      { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
    ],
  })

  it('cross도 빈 칸 중심은 거부한다 — MP 불변 (원작: 커서 후보는 유닛 레코드뿐)', () => {
    const state = mkBattle([], aoeStage())
    const guojia = unit(state, 'guojia')
    const emptyCenter = { x: 3, y: 1 } // 적의 바로 위 — 빈 칸 (여기가 중심이면 적이 십자에 들어오지만 거부)
    expect(state.units.some((u) => u.pos.x === 3 && u.pos.y === 1)).toBe(false)

    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: emptyCenter,
    })
    expect(next).toBe(state)
    expect(unit(state, 'guojia').mp).toBe(guojia.mp)
  })

  it('single도 빈 칸을 거부한다 (single/범위 규칙이 같다)', () => {
    const state = mkBattle([], aoeStage())
    const guojia = unit(state, 'guojia')
    expect(
      applyAction(state, { type: 'strategy', unitId: guojia.id, strategyId: 'choyeol', target: { x: 3, y: 1 } }),
    ).toBe(state)
  })

  it('맵 밖은 중심이 될 수 없다 (범위 칸이 맵 밖으로 삐져나가는 것은 무해)', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 0, y: 1 } },
      ],
    })
    const guojia = unit(state, 'guojia')
    expect(
      applyAction(state, { type: 'strategy', unitId: guojia.id, strategyId: 'hwajin', target: { x: -1, y: 1 } }),
    ).toBe(state)
    // 맵 가장자리의 적을 중심으로 삼는 것은 정상 (십자의 일부가 맵 밖으로 나가도 무해)
    const edge = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: { x: 0, y: 1 },
    })
    expect(edge).not.toBe(state)
    expect(unit(edge, 'yellowInfantry').hp).toBeLessThan(unit(state, 'yellowInfantry').hp)
  })

  it('진영이 맞지 않는 중심은 거부된다 (아군 중심 공격 책략 / 적 중심 회복 책략)', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
        { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    const guojia = unit(state, 'guojia')
    // 아군을 중심으로 한 공격 책략 (오사 없음)
    expect(
      applyAction(state, { type: 'strategy', unitId: guojia.id, strategyId: 'hwajin', target: { x: 2, y: 1 } }),
    ).toBe(state)

    // 적을 중심으로 한 회복 책략도 같은 게이트에서 걸린다
    const healer = mkBattle([], {
      units: [
        { officerId: 'xunyu', faction: 'player', pos: { x: 1, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 1 } },
      ],
    })
    const xunyu = unit(healer, 'xunyu')
    expect(
      applyAction(healer, { type: 'strategy', unitId: xunyu.id, strategyId: 'sobogeup', target: { x: 2, y: 1 } }),
    ).toBe(healer)
  })

  it('풍진(square)은 대각선까지 3×3 9칸을 판정한다 — 십자로는 닿지 않는 자리', () => {
    // 곽가 Lv10 = 풍진(ㅁ자, MP12, 사거리4) 보유. 원작에서 ㅁ자는 바람 계열 전용.
    const state = mkBattle([], {
      units: [
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 10 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 3 } }, // 중심
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 4, y: 4 } }, // 대각 — 십자에는 없는 칸
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 3, y: 4 } }, // 직선 인접
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 5, y: 5 } }, // 범위 밖
      ],
    })
    const guojia = unit(state, 'guojia')
    expect(strategyAreaCells('square', { x: 3, y: 3 })).toContainEqual({ x: 4, y: 4 })

    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'pungjin',
      target: { x: 3, y: 3 },
    })
    expect(unit(next, 'yellowInfantry').hp).toBeLessThan(unit(state, 'yellowInfantry').hp)
    expect(unit(next, 'yellowArcher').hp).toBeLessThan(unit(state, 'yellowArcher').hp) // 대각선 적중
    expect(unit(next, 'yellowCavalry').hp).toBeLessThan(unit(state, 'yellowCavalry').hp)
    expect(unit(next, 'yellowShaman').hp).toBe(unit(state, 'yellowShaman').hp) // 범위 밖은 무사
    expect(unit(next, 'guojia').mp).toBe(guojia.mp - 12)
  })

  it('구원대(cross heal)는 범위 내 아군 전원을 원작 공식으로 회복한다', () => {
    const state = mkBattle(
      [],
      {
        units: [
          { officerId: 'xunyu', faction: 'player', pos: { x: 1, y: 1 } },
          { officerId: 'caocao', faction: 'player', pos: { x: 3, y: 3 }, isLeader: true }, // 중심
          { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 4 } }, // 십자 안
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 4, y: 4 } }, // 십자 밖(대각)
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 } },
        ],
      },
      [entry('xunyu', { level: 15, classId: 'seniorGeomancer' })],
    )
    for (const id of ['caocao', 'dianwei', 'xiahoudun']) unit(state, id).hp = 20
    const xunyu = unit(state, 'xunyu')
    const expected = strategyHealAmount(STRATEGIES.guwondae.heal!, effectiveStats(xunyu).mind)
    expect(expected).toBeGreaterThan(40) // 정신력이 반영된다

    const next = applyAction(state, {
      type: 'strategy',
      unitId: xunyu.id,
      strategyId: 'guwondae',
      target: { x: 3, y: 3 },
    })
    expect(unit(next, 'caocao').hp).toBe(20 + expected)
    expect(unit(next, 'dianwei').hp).toBe(20 + expected)
    expect(unit(next, 'xiahoudun').hp).toBe(20) // 십자 밖 대각은 회복 없음
    expect(unit(next, 'xunyu').mp).toBe(xunyu.mp - 12)
  })

  it('cross 중심의 적 2명을 한 번에 때린다 (범위 합산 확인)', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 2 } },
      ],
    })
    const guojia = unit(state, 'guojia')
    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: { x: 3, y: 1 },
    })
    expect(unit(next, 'yellowInfantry').hp).toBeLessThan(unit(state, 'yellowInfantry').hp)
    expect(unit(next, 'yellowArcher').hp).toBeLessThan(unit(state, 'yellowArcher').hp)
    expect(unit(next, 'guojia').mp).toBe(guojia.mp - 12) // MP는 1회분만
  })
})

// ---------- AI 확장 ----------

describe('AI — 범위 채점과 지원 책략', () => {
  it('AoE는 밀집한 2명 쪽을 중심으로 고른다 (단독 1명보다 합산 기대값이 높다)', () => {
    // 적 요술사(Lv8) = 화진(십자) 보유. 밀집 2명 / 단독 1명 모두 같은 병과·레벨로 두어 조건을 맞춘다.
    let state = mkBattle([], {
      units: [
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 5, y: 5 }, level: 8, behavior: 'guard' },
        { officerId: 'dianwei', faction: 'player', pos: { x: 5, y: 3 } },
        { officerId: 'dianwei', faction: 'player', pos: { x: 5, y: 2 } },
        { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 5 } },
      ],
    })
    state = applyAction(state, { type: 'endPhase' })
    const shaman = unit(state, 'yellowShaman')
    const plan = decideUnit(state, shaman)

    expect(plan.act.type).toBe('strategy')
    if (plan.act.type === 'strategy') {
      expect(plan.act.strategyId).toBe('hwajin')
      // 밀집 구역(5,2)~(5,3)을 덮는 중심이어야 한다
      expect(plan.act.target.x).toBe(5)
      expect(plan.act.target.y).toBeLessThanOrEqual(3)
    }
  })

  it('풍수사는 빈사 아군이 있으면 치료를 고른다', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'xunyu', faction: 'player', pos: { x: 2, y: 2 } },
        { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 2 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    const wounded = unit(state, 'dianwei')
    wounded.hp = 10
    const plan = decideUnit(state, unit(state, 'xunyu'))

    expect(plan.act.type).toBe('strategy')
    if (plan.act.type === 'strategy') {
      expect(plan.act.strategyId).toBe('sobogeup')
      expect(plan.act.target).toEqual(wounded.pos)
    }
    // 실제로 리듀서에 통과하는 계획이어야 한다
    let next = state
    if (plan.moveTo) next = applyAction(next, { type: 'move', unitId: unit(state, 'xunyu').id, to: plan.moveTo })
    next = applyAction(next, plan.act)
    expect(unit(next, 'dianwei').hp).toBeGreaterThan(10)
  })

  it('멀쩡한 아군에게는 치료를 낭비하지 않는다 (손실 25% 미만은 후보 제외)', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'xunyu', faction: 'player', pos: { x: 2, y: 2 } },
        { officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 2 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    const ally = unit(state, 'dianwei')
    ally.hp = ally.maxHp - 1
    const plan = decideUnit(state, unit(state, 'xunyu'))
    if (plan.act.type === 'strategy') expect(plan.act.strategyId).not.toBe('sobogeup')
  })

  it('공격이 더 좋으면 여전히 공격을 고른다 (지원 확장이 공격을 밀어내지 않는다)', () => {
    let state = mkBattle([], {
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
      ],
    })
    state = applyAction(state, { type: 'endPhase' })
    const plan = decideUnit(state, unit(state, 'yellowInfantry'))
    expect(plan.act.type).toBe('attack')
  })
})

// ---------- applyVictory 회수 ----------

describe('applyVictory — 전투 승급과 도구 잔량 회수', () => {
  it('전투 중 승급한 부대의 classId가 로스터로 돌아온다 (미승급 부대는 키 없음)', () => {
    const base = newCampaign()
    const campaign = {
      ...base,
      nodeId: 'n01',
      roster: base.roster.map((r) => (r.officerId === 'xiahoudun' ? { ...r, level: 15 } : r)),
      consumables: [{ itemId: 'insu', count: 1 }],
    }
    let state = startBattle(
      mkStage({
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
          { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 } },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        ],
      }),
      1,
      campaign.roster,
      undefined,
      campaign.consumables,
    )
    const dun = unit(state, 'xiahoudun')
    state = applyAction(state, { type: 'useItem', unitId: dun.id, itemId: 'insu', target: dun.pos })

    const after = applyVictory(campaign, state)
    const promoted = after.roster.find((r) => r.officerId === 'xiahoudun')!
    expect(promoted.classId).toBe('heavyCavalry')
    expect(consumableCount(after.consumables, 'insu')).toBe(0)
    // 출진했지만 승급하지 않은 부대는 classId 키를 갖지 않는다 (세이브 라운드트립 동일성)
    const caocao = after.roster.find((r) => r.officerId === 'caocao')!
    expect(Object.prototype.hasOwnProperty.call(caocao, 'classId')).toBe(false)
    // 출진하지 않은 부대도 그대로
    const bench = after.roster.find((r) => r.officerId === 'xunyu')!
    expect(Object.prototype.hasOwnProperty.call(bench, 'classId')).toBe(false)
  })

  it('전투에서 쓴 도구만큼 줄어든 잔량이 캠페인 스톡이 된다', () => {
    const base = newCampaign()
    const campaign = { ...base, nodeId: 'n01', consumables: [{ itemId: 'hoebokSsal', count: 3 }] }
    let state = startBattle(mkStage(), 1, campaign.roster, undefined, campaign.consumables)
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    state = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hoebokSsal', target: caocao.pos })

    const after = applyVictory(campaign, state)
    expect(consumableCount(after.consumables, 'hoebokSsal')).toBe(2)
    // 캠페인 원본은 불변
    expect(consumableCount(campaign.consumables, 'hoebokSsal')).toBe(3)
  })
})

// ---------- 도구 상점 ----------

describe('buyConsumable / sellConsumable', () => {
  it('구매는 골드를 차감하고 스톡을 1 늘린다', () => {
    const campaign = { ...newCampaign(), gold: 1000 }
    const after = buyConsumable(campaign, 'hoebokSsal')
    expect(after.gold).toBe(1000 - CONSUMABLES.hoebokSsal.price!)
    expect(consumableCount(after.consumables, 'hoebokSsal')).toBe(1)
    // 같은 도구를 또 사면 스택이 쌓인다
    expect(consumableCount(buyConsumable(after, 'hoebokSsal').consumables, 'hoebokSsal')).toBe(2)
  })

  it('골드 경계 — 정확히 가격만큼이면 구매 성공, 1 부족하면 원본 반환', () => {
    const price = CONSUMABLES.hoebokSsal.price!
    const exact = { ...newCampaign(), gold: price }
    expect(buyConsumable(exact, 'hoebokSsal').gold).toBe(0)
    const short = { ...newCampaign(), gold: price - 1 }
    expect(buyConsumable(short, 'hoebokSsal')).toBe(short)
  })

  it('종류별 재고 상한은 255 — 초과 구매는 원본 반환 (원작 1바이트 카운트)', () => {
    const rich = { ...newCampaign(), gold: 99999 }
    const nearMax = { ...rich, consumables: [{ itemId: 'hoebokKong', count: CONSUMABLE_STOCK_MAX - 1 }] }
    const filled = buyConsumable(nearMax, 'hoebokKong')
    expect(consumableCount(filled.consumables, 'hoebokKong')).toBe(CONSUMABLE_STOCK_MAX)
    // 255에서 한 번 더 → 골드가 남아 있어도 거부
    expect(buyConsumable(filled, 'hoebokKong')).toBe(filled)
    // 상한은 종류별이라 다른 도구는 계속 살 수 있다
    expect(consumableCount(buyConsumable(filled, 'hoebokSsal').consumables, 'hoebokSsal')).toBe(1)
  })

  it('인수도 코어에서는 구매 가능(1000) — 1부 미진열은 상점(shopConsumables)이 거른다', () => {
    const rich = { ...newCampaign(), gold: 99999 }
    const bought = buyConsumable(rich, 'insu')
    expect(bought.gold).toBe(99999 - CONSUMABLES.insu.price!)
    expect(consumableCount(bought.consumables, 'insu')).toBe(1)
    expect(buyConsumable(rich, 'nonexistent')).toBe(rich)
  })

  it('상점 진열: 인수는 2부부터 (1부 노드에서는 목록에 없다)', () => {
    // 현재 그래프는 1부뿐 — chapterOf가 항상 1이므로 인수 미진열. 2부(s20) 추가 시 진열 테스트는 W3가 확장한다.
    const listed = shopConsumables(newCampaign()).map((c) => c.id)
    expect(listed).not.toContain('insu')
    expect(listed).toContain('hoebokKong')
  })

  it('판매는 스톡을 1 줄이고 반값 골드를 준다 (0이 된 스택은 사라진다)', () => {
    const campaign = { ...newCampaign(), gold: 100, consumables: [{ itemId: 'sinbiMul', count: 1 }] }
    const after = sellConsumable(campaign, 'sinbiMul')
    expect(after.gold).toBe(100 + Math.floor(CONSUMABLES.sinbiMul.price! / 2))
    expect(after.consumables).toEqual([])
  })

  it('스톡이 없으면 판매는 원본 반환', () => {
    const empty = newCampaign()
    expect(sellConsumable(empty, 'hoebokSsal')).toBe(empty)
    expect(sellConsumable(empty, 'nonexistent')).toBe(empty)
  })

  it('구매·판매는 원본을 건드리지 않는다 (불변)', () => {
    const campaign = { ...newCampaign(), gold: 2000, consumables: [{ itemId: 'hoebokSsal', count: 1 }] }
    const snapshot = JSON.parse(JSON.stringify(campaign))
    buyConsumable(campaign, 'hoebokSsal')
    sellConsumable(campaign, 'hoebokSsal')
    expect(campaign).toEqual(snapshot)
  })
})
