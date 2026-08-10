// v0.9 도구(소모품) — useItem 리듀서 · 범위 책략 조준 완화 · 지원 AI · 도구 상점.
// 근거: docs/research/items.md(도구), promotion.md §4(인수 = 승급 + HP/MP 완전회복)

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes'
import { CONSUMABLES } from '../data/consumables'
import { decideUnit } from './ai'
import { applyAction, startBattle } from './battle'
import type { RosterEntry } from './campaign'
import {
  applyVictory,
  buyConsumable,
  consumableCount,
  newCampaign,
  sellConsumable,
} from './campaign'
import { maxHp, maxMp } from './formulas'
import { strategyAreaCells } from './movement'
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
    const state = mkBattle([{ itemId: 'hwanyak', count: 2 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 40
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos })

    expect(unit(next, 'caocao').hp).toBe(90) // 40 + 50
    expect(consumableCount(next.consumables, 'hwanyak')).toBe(1)
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(unit(next, 'caocao').moved).toBe(true)
    // 원본 불변
    expect(unit(state, 'caocao').hp).toBe(40)
    expect(consumableCount(state.consumables, 'hwanyak')).toBe(2)
  })

  it('회복량은 maxHp에서 잘리고, 로그 detail은 실제 회복량이다 (UI 플로터 계약)', () => {
    const state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = caocao.maxHp - 10
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos })

    expect(unit(next, 'caocao').hp).toBe(caocao.maxHp)
    const entryLog = next.log.filter((l) => l.type === 'item').at(-1)!
    expect(entryLog.targetId).toBe(caocao.id)
    expect(entryLog.amount).toBe(10)
  })

  it('마지막 1개를 쓰면 스택이 목록에서 사라진다', () => {
    const state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos })
    expect(next.consumables).toEqual([])
  })

  it('보양탕은 MP를 회복한다 (maxMp 캡)', () => {
    const state = mkBattle([{ itemId: 'boyangtang', count: 1 }], {
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
      itemId: 'boyangtang',
      target: guojia.pos,
    })
    expect(unit(next, 'guojia').mp).toBe(31) // 1 + 30

    // 캡: MP가 거의 찬 상태
    const full = mkBattle([{ itemId: 'boyangtang', count: 1 }], {
      units: [{ officerId: 'guojia', faction: 'player', pos: { x: 2, y: 1 }, level: 5 }],
    })
    const g2 = unit(full, 'guojia')
    g2.mp = g2.maxMp - 3
    const capped = applyAction(full, { type: 'useItem', unitId: g2.id, itemId: 'boyangtang', target: g2.pos })
    expect(unit(capped, 'guojia').mp).toBe(g2.maxMp)
    expect(capped.log.filter((l) => l.type === 'item').at(-1)!.amount).toBe(3)
  })
})

// ---------- useItem: 무효 액션 매트릭스 ----------

describe('useItem — 무효 액션은 원본 참조를 그대로 돌려준다', () => {
  it('스톡이 0이면 거부', () => {
    const state = mkBattle([])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos }),
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
    const state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    expect(applyAction(state, { type: 'useItem', unitId: 'nobody', itemId: 'hwanyak', target: { x: 1, y: 1 } })).toBe(
      state,
    )
    const dead = unit(state, 'caocao')
    dead.hp = 0
    expect(applyAction(state, { type: 'useItem', unitId: dead.id, itemId: 'hwanyak', target: dead.pos })).toBe(state)
  })

  it('타 진영 페이즈에는 거부', () => {
    let state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    state = applyAction(state, { type: 'endPhase' }) // → enemy 페이즈
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(state.phase).toBe('enemy')
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos }),
    ).toBe(state)
  })

  it('이미 행동한 부대는 거부', () => {
    const state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    const after = applyAction(state, { type: 'wait', unitId: caocao.id })
    const acted = unit(after, 'caocao')
    expect(
      applyAction(after, { type: 'useItem', unitId: acted.id, itemId: 'hwanyak', target: acted.pos }),
    ).toBe(after)
  })

  it('사거리 밖 대상은 거부 (range 0 도구는 자기 위치만)', () => {
    const state = mkBattle([{ itemId: 'hwanyak', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    expect(
      applyAction(state, {
        type: 'useItem',
        unitId: caocao.id,
        itemId: 'hwanyak',
        target: { x: caocao.pos.x + 1, y: caocao.pos.y },
      }),
    ).toBe(state)
  })
})

// ---------- useItem: 사거리 있는 도구 (데이터에 아직 없어 임시 정의로 검증) ----------

describe('useItem — 사거리 있는 도구', () => {
  const RANGED = 'testTonic'

  beforeAll(() => {
    CONSUMABLES[RANGED] = {
      id: RANGED,
      name: '시험용 탕약',
      desc: '테스트 전용 — 사거리 2의 회복 도구',
      price: 100,
      range: 2,
      effect: { kind: 'heal', amount: 40 },
    }
  })
  afterAll(() => {
    delete CONSUMABLES[RANGED]
  })

  const stageWithAlly = (): Partial<StageDef> => ({
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 2 } },
    ],
  })

  it('사거리 안의 아군을 회복한다 (사용자는 행동 소진, 대상은 그대로)', () => {
    const state = mkBattle([{ itemId: RANGED, count: 1 }], stageWithAlly())
    const caocao = unit(state, 'caocao')
    const dianwei = unit(state, 'dianwei')
    dianwei.hp = 20
    const next = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: RANGED, target: dianwei.pos })

    expect(unit(next, 'dianwei').hp).toBe(60)
    expect(unit(next, 'caocao').acted).toBe(true)
    expect(unit(next, 'dianwei').acted).toBe(false)
    expect(next.consumables).toEqual([])
  })

  it('적에게는 쓸 수 없고, 빈 칸도 대상이 되지 않는다', () => {
    const state = mkBattle([{ itemId: RANGED, count: 1 }], stageWithAlly())
    const caocao = unit(state, 'caocao')
    const foe = unit(state, 'yellowInfantry')
    expect(applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: RANGED, target: foe.pos })).toBe(state)
    expect(
      applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: RANGED, target: { x: 1, y: 2 } }),
    ).toBe(state)
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

describe('범위 책략 — 빈 칸 중심 조준 (AoE 완화)', () => {
  /** 곽가(책사) Lv8 = 화진(십자, MP12, 사거리4) 보유 */
  const aoeStage = (): Partial<StageDef> => ({
    units: [
      { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
    ],
  })

  it('cross는 빈 칸을 중심으로 지정할 수 있다 (인접 적 1명에게 적중)', () => {
    const state = mkBattle([], aoeStage())
    const guojia = unit(state, 'guojia')
    const foe = unit(state, 'yellowInfantry')
    const emptyCenter = { x: 3, y: 1 } // 적의 바로 위 — 빈 칸
    expect(state.units.some((u) => u.pos.x === 3 && u.pos.y === 1)).toBe(false)

    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: emptyCenter,
    })
    expect(next).not.toBe(state)
    expect(unit(next, 'yellowInfantry').hp).toBeLessThan(foe.hp)
    expect(unit(next, 'guojia').mp).toBe(guojia.mp - 12)
  })

  it('범위 안에 유효 대상이 0명이면 거부 — MP를 낭비하지 않는다', () => {
    const state = mkBattle([], aoeStage())
    const guojia = unit(state, 'guojia')
    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: { x: 1, y: 4 }, // 사거리 안이지만 십자 5칸 어디에도 적이 없다
    })
    expect(next).toBe(state)
    expect(unit(state, 'guojia').mp).toBe(guojia.mp)
  })

  it('single은 여전히 빈 칸을 거부한다 (원작 조준)', () => {
    const state = mkBattle([], aoeStage())
    const guojia = unit(state, 'guojia')
    expect(
      applyAction(state, { type: 'strategy', unitId: guojia.id, strategyId: 'choyeol', target: { x: 3, y: 1 } }),
    ).toBe(state)
  })

  it('맵 밖을 중심으로 지정할 수는 없다 (범위 칸이 삐져나가는 것은 무해)', () => {
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
    // 맵 가장자리 칸을 중심으로 삼는 것은 정상 (십자의 일부가 맵 밖으로 나가도 무해)
    const edge = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: { x: 0, y: 1 },
    })
    expect(edge).not.toBe(state)
    expect(unit(edge, 'yellowInfantry').hp).toBeLessThan(unit(state, 'yellowInfantry').hp)
  })

  it('아군만 있는 칸을 중심으로 한 공격 책략은 거부된다 (오사 없음)', () => {
    const state = mkBattle([], {
      units: [
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 8 },
        { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    const guojia = unit(state, 'guojia')
    expect(
      applyAction(state, { type: 'strategy', unitId: guojia.id, strategyId: 'hwajin', target: { x: 2, y: 1 } }),
    ).toBe(state)
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
      expect(plan.act.strategyId).toBe('chiryo')
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
    if (plan.act.type === 'strategy') expect(plan.act.strategyId).not.toBe('chiryo')
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
    const campaign = { ...base, nodeId: 'n01', consumables: [{ itemId: 'hwanyak', count: 3 }] }
    let state = startBattle(mkStage(), 1, campaign.roster, undefined, campaign.consumables)
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    state = applyAction(state, { type: 'useItem', unitId: caocao.id, itemId: 'hwanyak', target: caocao.pos })

    const after = applyVictory(campaign, state)
    expect(consumableCount(after.consumables, 'hwanyak')).toBe(2)
    // 캠페인 원본은 불변
    expect(consumableCount(campaign.consumables, 'hwanyak')).toBe(3)
  })
})

// ---------- 도구 상점 ----------

describe('buyConsumable / sellConsumable', () => {
  it('구매는 골드를 차감하고 스톡을 1 늘린다', () => {
    const campaign = { ...newCampaign(), gold: 1000 }
    const after = buyConsumable(campaign, 'hwanyak')
    expect(after.gold).toBe(1000 - CONSUMABLES.hwanyak.price!)
    expect(consumableCount(after.consumables, 'hwanyak')).toBe(1)
    // 같은 도구를 또 사면 스택이 쌓인다
    expect(consumableCount(buyConsumable(after, 'hwanyak').consumables, 'hwanyak')).toBe(2)
  })

  it('골드 경계 — 정확히 가격만큼이면 구매 성공, 1 부족하면 원본 반환', () => {
    const price = CONSUMABLES.hwanyak.price!
    const exact = { ...newCampaign(), gold: price }
    expect(buyConsumable(exact, 'hwanyak').gold).toBe(0)
    const short = { ...newCampaign(), gold: price - 1 }
    expect(buyConsumable(short, 'hwanyak')).toBe(short)
  })

  it('비매품(인수)과 미등록 id는 구매 불가', () => {
    const rich = { ...newCampaign(), gold: 99999 }
    expect(buyConsumable(rich, 'insu')).toBe(rich)
    expect(buyConsumable(rich, 'nonexistent')).toBe(rich)
  })

  it('판매는 스톡을 1 줄이고 반값 골드를 준다 (0이 된 스택은 사라진다)', () => {
    const campaign = { ...newCampaign(), gold: 100, consumables: [{ itemId: 'boyangtang', count: 1 }] }
    const after = sellConsumable(campaign, 'boyangtang')
    expect(after.gold).toBe(100 + Math.floor(CONSUMABLES.boyangtang.price! / 2))
    expect(after.consumables).toEqual([])
  })

  it('비매품은 판매 불가 · 스톡이 없으면 원본 반환', () => {
    const sealed = { ...newCampaign(), consumables: [{ itemId: 'insu', count: 2 }] }
    expect(sellConsumable(sealed, 'insu')).toBe(sealed)
    const empty = newCampaign()
    expect(sellConsumable(empty, 'hwanyak')).toBe(empty)
    expect(sellConsumable(empty, 'nonexistent')).toBe(empty)
  })

  it('구매·판매는 원본을 건드리지 않는다 (불변)', () => {
    const campaign = { ...newCampaign(), gold: 2000, consumables: [{ itemId: 'hwanyak', count: 1 }] }
    const snapshot = JSON.parse(JSON.stringify(campaign))
    buyConsumable(campaign, 'hwanyak')
    sellConsumable(campaign, 'hwanyak')
    expect(campaign).toEqual(snapshot)
  })
})
