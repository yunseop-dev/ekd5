import { describe, expect, it } from 'vitest'
import { decideUnit, runAiPhase, stepAiUnit } from './ai'
import { applyAction, livingUnits, startBattle } from './battle'
import { manhattan } from './movement'
import type { BattleState, StageDef, TerrainId, UnitState } from './types'

function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'ai-test',
    name: 'AI 테스트',
    map: { width: 10, height: 10, tiles },
    units: [],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const unit = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

describe('decideUnit', () => {
  it('공격 가능한 적이 있으면 공격을 선택한다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
      ],
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })
    const plan = decideUnit(state, unit(state, 'yellowInfantry'))
    expect(plan.act.type).toBe('attack')
  })

  it('빈사 상태의 적(킬 가능)을 우선 공격한다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 4, y: 2 } },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 3, y: 2 } },
      ],
    })
    let state = startBattle(stage, 1)
    unit(state, 'dianwei').hp = 5 // 전위 빈사
    state = applyAction(state, { type: 'endPhase' })
    const plan = decideUnit(state, unit(state, 'yellowCavalry'))
    expect(plan.act.type).toBe('attack')
    if (plan.act.type === 'attack') {
      expect(plan.act.targetId).toBe(unit(state, 'dianwei').id)
    }
  })

  it('사거리 밖이면 최근접 적 방향으로 접근(pursue)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })
    const foe = unit(state, 'yellowInfantry')
    const before = manhattan(foe.pos, { x: 0, y: 0 })
    const plan = decideUnit(state, foe)
    expect(plan.moveTo).not.toBeNull()
    expect(manhattan(plan.moveTo!, { x: 0, y: 0 })).toBeLessThan(before)
  })

  it('guard 유닛은 사거리 밖 적을 추격하지 않는다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 9 }, behavior: 'guard' },
      ],
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })
    const plan = decideUnit(state, unit(state, 'yellowInfantry'))
    expect(plan.moveTo).toBeNull()
    expect(plan.act.type).toBe('wait')
  })

  it('책사는 물리보다 기대값 높은 공격 책략을 선택한다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 5, y: 2 }, level: 5 },
      ],
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })
    const plan = decideUnit(state, unit(state, 'yellowShaman'))
    expect(plan.act.type).toBe('strategy')
  })
})

describe('stepAiUnit', () => {
  it('한 번에 유닛 1기만 행동하고, 전원 소진 시 endPhase와 done을 반환한다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    let state = startBattle(stage, 1)
    state = applyAction(state, { type: 'endPhase' })

    const step1 = stepAiUnit(state, 'enemy')
    expect(step1.done).toBe(false)
    expect(step1.actedUnitId).not.toBeNull()
    expect(livingUnits(step1.state, 'enemy').filter((u) => u.acted).length).toBe(1)

    const step2 = stepAiUnit(step1.state, 'enemy')
    expect(step2.done).toBe(false)
    expect(step2.actedUnitId).not.toBe(step1.actedUnitId)

    const step3 = stepAiUnit(step2.state, 'enemy')
    expect(step3.done).toBe(true)
    expect(step3.actedUnitId).toBeNull()
    expect(step3.state.phase).toBe('player')
    expect(step3.state.turn).toBe(2)
  })

  it('아군 페이즈이거나 종료된 전투에서는 아무것도 하지 않는다', () => {
    const state = startBattle(mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
      ],
    }), 1)
    const step = stepAiUnit(state, 'enemy') // 현재 player 페이즈
    expect(step.done).toBe(true)
    expect(step.state).toBe(state)
  })
})

describe('runAiPhase', () => {
  it('적 전원이 행동하고 페이즈가 넘어간다 (턴 증가)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 2 } },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    let state = startBattle(stage, 1)
    const hpBefore = unit(state, 'caocao').hp
    state = applyAction(state, { type: 'endPhase' })
    state = runAiPhase(state, 'enemy')
    expect(state.phase).toBe('player')
    expect(state.turn).toBe(2)
    // 인접해 있던 적병은 조조를 공격했어야 함 (명중률 90%+, 시드 고정)
    expect(unit(state, 'caocao').hp).toBeLessThanOrEqual(hpBefore)
    // 멀리 있던 기병은 접근했어야 함
    expect(manhattan(unit(state, 'yellowCavalry').pos, { x: 2, y: 2 })).toBeLessThan(12)
  })

  it('AI vs AI 자동 시뮬레이션이 크래시 없이 종료된다 (스모크)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 7, y: 8 } },
      ],
    })
    let state = startBattle(stage, 42)
    // 아군도 AI 로직으로 조작해 완주: 플레이어 페이즈엔 유닛 전원 decideUnit 실행
    for (let round = 0; round < 60 && state.result === 'ongoing'; round++) {
      if (state.phase === 'player') {
        for (const u of livingUnits(state, 'player')) {
          if (state.result !== 'ongoing') break
          const plan = decideUnit(state, u)
          if (plan.moveTo) state = applyAction(state, { type: 'move', unitId: u.id, to: plan.moveTo })
          state = applyAction(state, plan.act)
        }
        if (state.result === 'ongoing') state = applyAction(state, { type: 'endPhase' })
      } else {
        state = runAiPhase(state, state.phase)
      }
    }
    expect(['victory', 'defeat']).toContain(state.result)
  })
})
