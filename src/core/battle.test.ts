import { describe, expect, it } from 'vitest'
import {
  applyAction,
  effectiveStats,
  forecastAttack,
  knownStrategies,
  livingUnits,
  startBattle,
} from './battle'
import type { BattleState, StageDef, TerrainId, UnitState } from './types'

// 8×8 평지 맵 + 필요 유닛만 배치한 테스트 스테이지
function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'plain' as TerrainId))
  return {
    id: 'test',
    name: '테스트 전투',
    map: { width: 8, height: 8, tiles },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 } },
      { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 2 }, level: 5 },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } },
      { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 6 } },
    ],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const unit = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

describe('startBattle', () => {
  it('유닛이 공식대로 초기화된다 (HP/MP/레벨)', () => {
    const state = startBattle(mkStage(), 1)
    const caocao = unit(state, 'caocao')
    expect(caocao.level).toBe(3) // 장수 기본 레벨
    expect(caocao.maxHp).toBe(120 + 7 * 3) // lord: hpBase 120 + 7/lv
    expect(caocao.hp).toBe(caocao.maxHp)
    expect(state.phase).toBe('player')
    expect(state.turn).toBe(1)
    expect(state.result).toBe('ongoing')
  })

  it('스테이지 유닛 정의의 level 오버라이드가 적용된다', () => {
    const state = startBattle(mkStage(), 1)
    expect(unit(state, 'guojia').level).toBe(5)
  })
})

describe('move 액션', () => {
  it('이동범위 내 이동 성공, moved 마킹, 원본 불변', () => {
    const state = startBattle(mkStage(), 1)
    const dun = unit(state, 'xiahoudun')
    const next = applyAction(state, { type: 'move', unitId: dun.id, to: { x: 2, y: 4 } })
    expect(unit(next, 'xiahoudun').pos).toEqual({ x: 2, y: 4 })
    expect(unit(next, 'xiahoudun').moved).toBe(true)
    expect(unit(state, 'xiahoudun').pos).toEqual({ x: 2, y: 1 }) // 원본 그대로
  })

  it('이동력 밖이면 거부(prev 반환)', () => {
    const state = startBattle(mkStage(), 1)
    const dun = unit(state, 'xiahoudun')
    const next = applyAction(state, { type: 'move', unitId: dun.id, to: { x: 7, y: 7 } })
    expect(next).toBe(state)
  })

  it('적이 점유한 칸으로 이동 불가', () => {
    const state = startBattle(mkStage(), 1)
    const dun = unit(state, 'xiahoudun')
    const next = applyAction(state, { type: 'move', unitId: dun.id, to: { x: 3, y: 1 } })
    expect(next).toBe(state)
  })

  it('적 페이즈에 아군 이동 불가', () => {
    let state = startBattle(mkStage(), 1)
    state = applyAction(state, { type: 'endPhase' }) // → enemy
    const dun = unit(state, 'xiahoudun')
    const next = applyAction(state, { type: 'move', unitId: dun.id, to: { x: 2, y: 2 } })
    expect(next).toBe(state)
  })
})

describe('attack 액션', () => {
  it('인접 공격: 데미지 발생, acted 마킹, 근접끼리는 반격 발생 가능', () => {
    const state = startBattle(mkStage(), 7)
    const dun = unit(state, 'xiahoudun')
    const foe = unit(state, 'yellowInfantry')
    expect(forecastAttack(state, dun, foe).willCounter).toBe(true)
    const next = applyAction(state, { type: 'attack', unitId: dun.id, targetId: foe.id })
    expect(unit(next, 'yellowInfantry').hp).toBeLessThan(foe.hp)
    expect(unit(next, 'xiahoudun').acted).toBe(true)
  })

  it('사거리 밖 공격 거부', () => {
    const state = startBattle(mkStage(), 1)
    const dun = unit(state, 'xiahoudun')
    const far = unit(state, 'yellowArcher')
    const next = applyAction(state, { type: 'attack', unitId: dun.id, targetId: far.id })
    expect(next).toBe(state)
  })

  it('원거리(궁병) 공격에는 반격이 없다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'xiahouyuan', faction: 'player', pos: { x: 1, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 1, y: 3 } },
      ],
    })
    const state = startBattle(stage, 3)
    const yuan = unit(state, 'xiahouyuan')
    const foe = unit(state, 'yellowInfantry')
    const fc = forecastAttack(state, yuan, foe)
    expect(fc.willCounter).toBe(false)
    const next = applyAction(state, { type: 'attack', unitId: yuan.id, targetId: foe.id })
    expect(unit(next, 'xiahouyuan').hp).toBe(yuan.hp) // 반격 안 맞음
  })

  it('궁병은 인접(거리1) 공격 불가 (최소 사거리 2)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'xiahouyuan', faction: 'player', pos: { x: 1, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 1, y: 2 } },
      ],
    })
    const state = startBattle(stage, 1)
    const yuan = unit(state, 'xiahouyuan')
    const foe = unit(state, 'yellowInfantry')
    const next = applyAction(state, { type: 'attack', unitId: yuan.id, targetId: foe.id })
    expect(next).toBe(state)
  })

  it('적을 격파하면 경험치 획득 (레벨업 가능)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 }, level: 10 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 }, level: 1 },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 6 } },
      ],
    })
    let state = startBattle(stage, 7)
    const dun = unit(state, 'xiahoudun')
    const foe = unit(state, 'yellowInfantry')
    // Lv10 vs Lv1: 압도적이라 몇 번 치면 격파
    for (let i = 0; i < 5 && unit(state, 'yellowInfantry').hp > 0; i++) {
      state = applyAction(state, { type: 'attack', unitId: dun.id, targetId: foe.id })
      state = applyAction(state, { type: 'endPhase' })
      state = applyAction(state, { type: 'endPhase' })
    }
    expect(unit(state, 'yellowInfantry').hp).toBe(0)
    expect(unit(state, 'xiahoudun').exp).toBeGreaterThan(0)
  })
})

describe('strategy 액션', () => {
  it('초열: MP 소모 + 데미지', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 5 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } },
      ],
    })
    const state = startBattle(stage, 11)
    const guojia = unit(state, 'guojia')
    expect(knownStrategies(guojia).map((s) => s.id)).toContain('choyeol')
    const before = unit(state, 'yellowInfantry').hp
    const next = applyAction(state, {
      type: 'strategy', unitId: guojia.id, strategyId: 'choyeol', target: { x: 3, y: 1 },
    })
    expect(unit(next, 'guojia').mp).toBe(guojia.mp - 6)
    // 초열 한계명중 100% + 지력 압도 → 명중률 상한이라 데미지 확정
    expect(unit(next, 'yellowInfantry').hp).toBeLessThan(before)
  })

  it('우천 시 화계 사용 불가', () => {
    const stage = mkStage({
      weather: 'rain',
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'guojia', faction: 'player', pos: { x: 1, y: 1 }, level: 5 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } },
      ],
    })
    const state = startBattle(stage, 1)
    const guojia = unit(state, 'guojia')
    const next = applyAction(state, {
      type: 'strategy', unitId: guojia.id, strategyId: 'choyeol', target: { x: 3, y: 1 },
    })
    expect(next).toBe(state)
  })

  it('치료: 아군 HP 회복 (최대치 초과 불가)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'xunyu', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 6 } },
      ],
    })
    let state = startBattle(stage, 1)
    // 조조를 다치게 만든다
    unit(state, 'caocao').hp -= 50
    const xunyu = unit(state, 'xunyu')
    state = applyAction(state, {
      type: 'strategy', unitId: xunyu.id, strategyId: 'chiryo', target: { x: 1, y: 1 },
    })
    const caocao = unit(state, 'caocao')
    expect(caocao.hp).toBe(caocao.maxHp - 50 + 80 > caocao.maxHp ? caocao.maxHp : caocao.maxHp - 50 + 80)
  })

  it('버프(연병)가 실효 능력치에 반영되고 페이즈마다 턴이 줄어든다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'xunyu', faction: 'player', pos: { x: 2, y: 1 }, level: 6 },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 6 } },
      ],
    })
    let state = startBattle(stage, 1)
    const xunyu = unit(state, 'xunyu')
    const agiBefore = effectiveStats(unit(state, 'caocao')).agi
    state = applyAction(state, {
      type: 'strategy', unitId: xunyu.id, strategyId: 'yeonbyeong', target: { x: 1, y: 1 },
    })
    expect(effectiveStats(unit(state, 'caocao')).agi).toBe(agiBefore + 30)
    // 3페이즈(아군 기준 3턴) 지나면 소멸
    for (let i = 0; i < 6; i++) state = applyAction(state, { type: 'endPhase' })
    expect(effectiveStats(unit(state, 'caocao')).agi).toBe(agiBefore)
  })

  it('MP 부족 시 거부', () => {
    const state = startBattle(mkStage(), 1)
    const guojia = unit(state, 'guojia')
    unit(state, 'guojia').mp = 2
    const next = applyAction(state, {
      type: 'strategy', unitId: guojia.id, strategyId: 'choyeol', target: { x: 3, y: 1 },
    })
    expect(next).toBe(state)
  })
})

describe('endPhase / 턴 진행', () => {
  it('player → enemy → 턴 증가 후 player', () => {
    let state = startBattle(mkStage(), 1)
    state = applyAction(state, { type: 'endPhase' })
    expect(state.phase).toBe('enemy')
    expect(state.turn).toBe(1)
    state = applyAction(state, { type: 'endPhase' })
    expect(state.phase).toBe('player')
    expect(state.turn).toBe(2)
  })

  it('페이즈 시작 시 해당 진영 acted/moved 초기화', () => {
    let state = startBattle(mkStage(), 1)
    const dun = unit(state, 'xiahoudun')
    state = applyAction(state, { type: 'wait', unitId: dun.id })
    expect(unit(state, 'xiahoudun').acted).toBe(true)
    state = applyAction(state, { type: 'endPhase' })
    state = applyAction(state, { type: 'endPhase' })
    expect(unit(state, 'xiahoudun').acted).toBe(false)
  })

  it('성채 지형은 페이즈 시작 시 회복시킨다', () => {
    const tiles: TerrainId[][] = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => 'plain' as TerrainId),
    )
    tiles[1][1] = 'fort'
    const stage = mkStage({ map: { width: 8, height: 8, tiles } })
    let state = startBattle(stage, 1)
    unit(state, 'caocao').hp -= 40 // 성채 위의 조조가 부상
    state = applyAction(state, { type: 'endPhase' })
    state = applyAction(state, { type: 'endPhase' })
    const caocao = unit(state, 'caocao')
    expect(caocao.hp).toBeGreaterThan(caocao.maxHp - 40)
  })
})

describe('승패 판정', () => {
  it('적 전멸 → 승리', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 }, level: 20 },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 }, level: 1 },
      ],
    })
    let state = startBattle(stage, 7)
    const dun = unit(state, 'xiahoudun')
    for (let i = 0; i < 6 && state.result === 'ongoing'; i++) {
      state = applyAction(state, { type: 'attack', unitId: dun.id, targetId: unit(state, 'yellowInfantry').id })
      if (state.result === 'ongoing') {
        state = applyAction(state, { type: 'endPhase' })
        state = applyAction(state, { type: 'endPhase' })
      }
    }
    expect(state.result).toBe('victory')
  })

  it('주인공 격파 → 패배', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true, level: 1 },
        { officerId: 'chengYuanzhi', faction: 'enemy', pos: { x: 2, y: 1 }, level: 50 },
      ],
    })
    let state = startBattle(stage, 5)
    state = applyAction(state, { type: 'endPhase' }) // 적 페이즈
    const boss = unit(state, 'chengYuanzhi')
    for (let i = 0; i < 10 && state.result === 'ongoing'; i++) {
      state = applyAction(state, { type: 'attack', unitId: boss.id, targetId: unit(state, 'caocao').id })
      if (state.result === 'ongoing') {
        state = applyAction(state, { type: 'endPhase' })
        state = applyAction(state, { type: 'endPhase' })
      }
    }
    expect(state.result).toBe('defeat')
  })

  it('보스 격파 조건 + N턴 버티기 조건', () => {
    const stage = mkStage({
      victory: [{ type: 'surviveTurns', turns: 2 }],
    })
    let state = startBattle(stage, 1)
    for (let i = 0; i < 4; i++) state = applyAction(state, { type: 'endPhase' })
    expect(state.turn).toBe(3)
    expect(state.result).toBe('victory')
  })

  it('2차 승리조건 달성 시 생존 전원 보너스 경험치', () => {
    const stage = mkStage({
      victory: [{ type: 'annihilation' }, { type: 'surviveTurns', turns: 1 }],
      bonusExp: 50,
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })
    state = applyAction(state, { type: 'endPhase' }) // 턴2 시작 → 2차 조건 달성
    expect(state.result).toBe('victory')
    expect(unit(state, 'xiahoudun').exp).toBe(50)
  })
})

describe('증원', () => {
  it('턴 시작 트리거로 증원 등장', () => {
    const stage = mkStage({
      reinforcements: [
        {
          trigger: { type: 'turnStart', turn: 2 },
          units: [{ officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 7, y: 7 } }],
        },
      ],
    })
    let state = startBattle(stage, 1)
    expect(livingUnits(state, 'enemy').length).toBe(2)
    state = applyAction(state, { type: 'endPhase' })
    state = applyAction(state, { type: 'endPhase' }) // 턴 2 시작
    expect(livingUnits(state, 'enemy').length).toBe(3)
    expect(state.units.some((u) => u.officerId === 'yellowCavalry')).toBe(true)
  })
})
