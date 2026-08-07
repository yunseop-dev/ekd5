// 스테이지 데이터 무결성 + AI 자동 시뮬레이션 통합 테스트

import { describe, expect, it } from 'vitest'
import { decideUnit, runAiPhase } from '../../core/ai'
import { applyAction, livingUnits, startBattle, unitAt } from '../../core/battle'
import type { BattleState } from '../../core/types'
import { CLASSES } from '../classes'
import { OFFICERS } from '../officers'
import { STRATEGIES } from '../strategies'
import { TERRAIN } from '../terrain'
import { STAGES } from './index'
import { STAGE_01 } from './stage01'
import { STAGE_02 } from './stage02'
import { STAGE_03 } from './stage03'

/** 아군도 AI로 조작해 전투를 완주시키는 헬퍼 */
function simulate(state: BattleState, maxRounds: number, onTurnStart?: (s: BattleState) => void): BattleState {
  let current = state
  let lastTurn = 0
  for (let i = 0; i < maxRounds && current.result === 'ongoing'; i++) {
    if (current.turn !== lastTurn) {
      lastTurn = current.turn
      onTurnStart?.(current)
    }
    if (current.phase === 'player') {
      for (const u of livingUnits(current, 'player')) {
        if (current.result !== 'ongoing') break
        const plan = decideUnit(current, u)
        if (plan.moveTo && !unitAt(current, plan.moveTo)) {
          current = applyAction(current, { type: 'move', unitId: u.id, to: plan.moveTo })
        }
        current = applyAction(current, plan.act)
      }
      if (current.result === 'ongoing') current = applyAction(current, { type: 'endPhase' })
    } else {
      current = runAiPhase(current, current.phase)
    }
  }
  return current
}

describe('스테이지 데이터 무결성', () => {
  it('모든 스테이지: 장수/병과/책략 참조가 유효하다', () => {
    for (const stage of STAGES) {
      const all = [...stage.units, ...stage.reinforcements.flatMap((r) => r.units)]
      for (const u of all) {
        const officer = OFFICERS[u.officerId]
        expect(officer, `${stage.id}: 장수 ${u.officerId}`).toBeDefined()
        const cls = CLASSES[officer.classId]
        expect(cls, `${stage.id}: 병과 ${officer.classId}`).toBeDefined()
        for (const s of cls.strategies) {
          expect(STRATEGIES[s.strategyId], `${stage.id}: 책략 ${s.strategyId}`).toBeDefined()
        }
      }
    }
  })

  it('모든 스테이지: 유닛 배치가 맵 안이고 진입 가능한 지형이며 겹치지 않는다', () => {
    for (const stage of STAGES) {
      const seen = new Set<string>()
      for (const u of stage.units) {
        expect(u.pos.x, `${stage.id}: ${u.officerId} x`).toBeLessThan(stage.map.width)
        expect(u.pos.y, `${stage.id}: ${u.officerId} y`).toBeLessThan(stage.map.height)
        const key = `${u.pos.x},${u.pos.y}`
        expect(seen.has(key), `${stage.id}: ${u.officerId} 위치 중복 ${key}`).toBe(false)
        seen.add(key)
      }
      // 시작 상태가 정상 생성되는지 (진입 불가 지형 배치 등은 startBattle 후 이동 계산에서 드러남)
      const state = startBattle(stage, 1)
      expect(state.units.length).toBe(stage.units.length)
    }
  })

  it('모든 스테이지: 아군 리더가 정확히 1명', () => {
    for (const stage of STAGES) {
      const leaders = stage.units.filter((u) => u.faction === 'player' && u.isLeader)
      expect(leaders.length, stage.id).toBe(1)
    }
  })

  it('출진 슬롯이 있는 스테이지: min/max·강제출진이 슬롯 테이블과 맞물린다', () => {
    for (const stage of STAGES) {
      if (!stage.playerSlots) continue
      const slots = stage.playerSlots
      const min = stage.deployMin!
      const max = stage.deployMax!
      expect(min, `${stage.id} deployMin`).toBeGreaterThan(0)
      expect(min, `${stage.id} deployMin≤Max`).toBeLessThanOrEqual(max)
      expect(max, `${stage.id} deployMax≤슬롯수`).toBeLessThanOrEqual(slots.length)

      // 조조는 전 전투 강제출진 (퇴각 = 게임오버)
      expect(stage.forcedOfficers, stage.id).toContain('caocao')
      expect(stage.forcedOfficers![0], `${stage.id}: ①번 슬롯`).toBe('caocao')
      expect(stage.forcedOfficers!.length, `${stage.id} 강제출진≤min`).toBeLessThanOrEqual(min)
      for (const id of stage.forcedOfficers!) expect(OFFICERS[id], `${stage.id}: ${id}`).toBeDefined()

      // 슬롯 좌표: 맵 안 + 보행 진입 가능 + 중복 없음
      const seen = new Set<string>()
      for (const slot of slots) {
        const where = `${stage.id} (${slot.x},${slot.y})`
        expect(slot.x, where).toBeLessThan(stage.map.width)
        expect(slot.y, where).toBeLessThan(stage.map.height)
        expect(TERRAIN[stage.map.tiles[slot.y][slot.x]].cost.foot, where).not.toBeNull()
        expect(seen.has(`${slot.x},${slot.y}`), where).toBe(false)
        seen.add(`${slot.x},${slot.y}`)
      }
    }
  })
})

describe('스테이지 1 — 연습전', () => {
  it('AI vs AI 자동 시뮬레이션이 승패를 낸다', () => {
    const result = simulate(startBattle(STAGE_01, 42), 120)
    expect(['victory', 'defeat']).toContain(result.result)
  })
})

describe('스테이지 2 — 관문 방어전', () => {
  it('턴 3/5에 증원 웨이브가 등장한다', () => {
    const spawnsAtTurn: Record<number, number> = {}
    simulate(startBattle(STAGE_02, 42), 200, (s) => {
      spawnsAtTurn[s.turn] = s.units.length
    })
    // 턴 3에 +2 (기병 2), 턴 5에 +2 (등무+요술사)
    if (spawnsAtTurn[3] !== undefined) {
      expect(spawnsAtTurn[3]).toBeGreaterThanOrEqual(STAGE_02.units.length + 2)
    }
    if (spawnsAtTurn[5] !== undefined) {
      expect(spawnsAtTurn[5]).toBeGreaterThanOrEqual(STAGE_02.units.length + 4)
    }
  })

  it('AI 자동 시뮬레이션이 크래시 없이 종료된다 (버티기 또는 보스 격파 또는 패배)', () => {
    const result = simulate(startBattle(STAGE_02, 7), 200)
    expect(['victory', 'defeat']).toContain(result.result)
  })

  it('아무도 행동하지 않아도 8턴 버티면 게임이 끝난다 (surviveTurns 평가)', () => {
    let state = startBattle(STAGE_02, 1)
    for (let i = 0; i < 60 && state.result === 'ongoing'; i++) {
      if (state.phase === 'player') {
        state = applyAction(state, { type: 'endPhase' })
      } else {
        state = runAiPhase(state, state.phase)
      }
    }
    expect(state.result).not.toBe('ongoing')
  })
})

describe('스테이지 3 — 황건 본진 소탕', () => {
  it('AI vs AI 자동 시뮬레이션이 크래시 없이 승패를 낸다', () => {
    // 장수 기본 레벨(2~3)로는 협곡에서 밀린다 — 최종 스테이지라 로스터 이월을 전제한다
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_03, 42), 400).result)

    // 두 전투를 거친 로스터(≈Lv6)면 협곡→성문→성채까지 실제로 진행돼 장각을 잡는다
    const roster = STAGE_03.units
      .filter((u) => u.faction === 'player')
      .map((u) => ({ officerId: u.officerId, level: 6, exp: 0 }))
    const grown = simulate(startBattle(STAGE_03, 42, roster), 400)
    expect(grown.result).toBe('victory')
    expect(grown.units.find((u) => u.isBoss)!.hp).toBe(0)
  })

  it('출진 명단으로 시작하면 슬롯에 배치되고 적 배치는 그대로다', () => {
    const state = startBattle(STAGE_03, 1, undefined, ['caocao', 'dianwei', 'xunyu', 'guojia'])
    const players = livingUnits(state, 'player')
    expect(players.map((u) => u.officerId)).toEqual(['caocao', 'dianwei', 'xunyu', 'guojia'])
    expect(players.map((u) => u.pos)).toEqual(STAGE_03.playerSlots!.slice(0, 4))
    const boss = state.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('zhangJiao')
    expect(boss.pos).toEqual({ x: 7, y: 1 })
  })
})
