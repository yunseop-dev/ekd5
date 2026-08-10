// v1.1 전투 내 이벤트 엔진 — 트리거 5종 / 즉시형 액션 8종 / eventContinue(dialogue·choice·duel) /
// AI 정지 / autoResolveEvents / 캠페인 회수(allySurvived·pendingRewards).
// 근거: 계획 §1(엔진)·§3(일기토)·§4(전략 선택)·§9(검증 목록).

import { describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { runAiPhase, stepAiUnit } from './ai'
import { applyAction, movementRangeOf, startBattle } from './battle'
import { applyVictory, completeStory, consumableCount, newCampaign } from './campaign'
import { autoResolveEvents } from './events'
import { expGain, maxHp, maxMp } from './formulas'
import { keyOf } from './movement'
import type {
  BattleEventDef,
  BattleState,
  ConsumableStack,
  StageDef,
  TerrainId,
  UnitState,
  Vec2,
} from './types'

// ---------- 헬퍼 (consumables.test.ts의 mkStage/mkBattle 패턴 + events 필드) ----------

/** 10×10 평지 맵 + 조조(아군 주인공) / 황건적병(적) 1기씩. over로 유닛·이벤트를 갈아끼운다 */
function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'events-test',
    name: '이벤트 테스트',
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

const mkBattle = (over: Partial<StageDef> = {}, stock?: ConsumableStack[]): BattleState =>
  startBattle(mkStage(over), 1, undefined, undefined, stock)

/** 대사 1줄짜리 표시형 액션 */
const dialogue = (text = '말하다') => ({ type: 'dialogue' as const, lines: [{ speaker: null, text }] })

const ev = (id: string, trigger: BattleEventDef['trigger'], actions: BattleEventDef['actions']): BattleEventDef => ({
  id,
  trigger,
  actions,
})

/** 적 페이즈까지 넘긴다 (아군 유닛이 없어도 endPhase는 순수하게 동작) */
const toEnemyPhase = (state: BattleState): BattleState => applyAction(state, { type: 'endPhase' })

/** 턴 N까지 진행 (아군 없는 스테이지 기준: endPhase 2회 = 1턴) */
function advanceTurns(state: BattleState, turns: number): BattleState {
  let cur = state
  for (let i = 0; i < turns; i += 1) {
    cur = applyAction(cur, { type: 'endPhase' })
    cur = applyAction(cur, { type: 'endPhase' })
  }
  return cur
}

/**
 * 난수와 무관하게 대상을 격파한다 — 혼란 대상은 **확정 피격**(원작 규칙)이라 명중이 보장된다.
 * 대상 HP를 1로 낮추고 인접한 공격자로 때린다.
 */
function forceKill(state: BattleState, attackerOfficer: string, targetOfficer: string): BattleState {
  const target = unit(state, targetOfficer)
  target.hp = 1
  target.statuses.push({ id: 'confusion' })
  return applyAction(state, { type: 'attack', unitId: unit(state, attackerOfficer).id, targetId: target.id })
}

const ADJACENT_PAIR: StageDef['units'] = [
  { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
  { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 1 } },
]

// ---------- 트리거 ----------

describe('트리거 — battleStart', () => {
  it('startBattle 반환 상태가 이미 pendingEvents를 갖는다 (전략 선택 경로)', () => {
    const state = mkBattle({ events: [ev('e1', { type: 'battleStart' }, [dialogue('개전')])] })
    expect(state.pendingEvents).toHaveLength(1)
    expect(state.pendingEvents[0].eventId).toBe('e1')
    expect(state.pendingEvents[0].queue[0].type).toBe('dialogue')
    expect(state.firedEvents).toEqual(['e1'])
  })

  it('battleStart의 즉시형 액션은 전투 시작 시점에 이미 반영된다', () => {
    const state = mkBattle({
      events: [ev('e1', { type: 'battleStart' }, [{ type: 'buff', target: 'playerAll', stat: 'atk', amount: 10, duration: 2 }])],
    })
    expect(unit(state, 'caocao').buffs).toEqual([{ stat: 'atk', amount: 10, remainingTurns: 2 }])
    expect(state.pendingEvents).toHaveLength(0) // 표시형이 없으면 큐가 남지 않는다
  })

  it('이벤트가 없는 스테이지는 무영향이다', () => {
    const state = mkBattle()
    expect(state.pendingEvents).toEqual([])
    expect(state.firedEvents).toEqual([])
  })
})

describe('트리거 — turnStart', () => {
  it('지정한 턴이 시작될 때 발동한다', () => {
    const state = mkBattle({ events: [ev('t2', { type: 'turnStart', turn: 2 }, [dialogue()])] })
    const next = advanceTurns(state, 1)
    expect(next.turn).toBe(2)
    expect(next.pendingEvents).toHaveLength(1)
    expect(next.firedEvents).toEqual(['t2'])
  })

  it('다른 턴에서는 발동하지 않는다', () => {
    const state = mkBattle({ events: [ev('t3', { type: 'turnStart', turn: 3 }, [dialogue()])] })
    const next = advanceTurns(state, 1)
    expect(next.turn).toBe(2)
    expect(next.pendingEvents).toEqual([])
    expect(next.firedEvents).toEqual([])
  })

  it('페이즈 전환(턴 증가 아님)으로는 발동하지 않는다', () => {
    const state = mkBattle({ events: [ev('t1', { type: 'turnStart', turn: 1 }, [dialogue()])] })
    const next = toEnemyPhase(state)
    expect(next.phase).toBe('enemy')
    expect(next.pendingEvents).toEqual([])
  })
})

describe('트리거 — unitDefeated', () => {
  it('지정 장수가 격파되면 발동한다', () => {
    const state = mkBattle({
      units: ADJACENT_PAIR,
      events: [ev('d1', { type: 'unitDefeated', officerId: 'yellowInfantry' }, [dialogue('쓰러졌다')])],
    })
    const next = forceKill(state, 'caocao', 'yellowInfantry')
    expect(unit(next, 'yellowInfantry').hp).toBe(0)
    expect(next.pendingEvents).toHaveLength(1)
  })

  it('다른 장수의 격파로는 발동하지 않는다', () => {
    const state = mkBattle({
      units: ADJACENT_PAIR,
      events: [ev('d1', { type: 'unitDefeated', officerId: 'zhangJiao' }, [dialogue()])],
    })
    const next = forceKill(state, 'caocao', 'yellowInfantry')
    expect(next.firedEvents).toEqual([])
  })

  it('격파 이벤트가 대기 중이면 승패 판정이 보류된다 (배너 충돌 방지)', () => {
    const state = mkBattle({
      units: ADJACENT_PAIR,
      events: [ev('d1', { type: 'unitDefeated', officerId: 'yellowInfantry' }, [dialogue()])],
    })
    const killed = forceKill(state, 'caocao', 'yellowInfantry')
    expect(killed.result).toBe('ongoing') // 마지막 적이 죽었지만 오버레이가 먼저다
    const done = applyAction(killed, { type: 'eventContinue' })
    expect(done.result).toBe('victory')
  })
})

describe('트리거 — unitsMeet (체비쇼프 1)', () => {
  const meetEvents = [ev('m1', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [dialogue('일기토?')])]

  it('직교 인접에서 발동한다', () => {
    const state = mkBattle({ units: ADJACENT_PAIR, events: meetEvents })
    expect(state.pendingEvents).toHaveLength(1) // 위치 트리거는 전수 평가라 개전 시점에도 잡힌다
  })

  it('이동으로 인접해지면 발동한다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 1 } },
      ],
      events: meetEvents,
    })
    expect(state.pendingEvents).toEqual([])
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 3, y: 1 } })
    expect(next.pendingEvents).toHaveLength(1)
  })

  it('대각 인접도 발동한다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 3 } },
      ],
      events: meetEvents,
    })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 2 } })
    expect(next.pendingEvents).toHaveLength(1)
  })

  it('거리 2에서는 발동하지 않는다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 3 } },
      ],
      events: meetEvents,
    })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 1, y: 2 } })
    expect(next.pendingEvents).toEqual([])
  })

  it('한쪽이 격파돼 있으면 발동하지 않는다 (생존 조건)', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 1 } },
      ],
      events: meetEvents,
    })
    unit(state, 'yellowInfantry').hp = 0
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 3, y: 1 } })
    expect(next.pendingEvents).toEqual([])
  })
})

describe('트리거 — reachArea', () => {
  const area: Vec2[] = [
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ]
  const twoPlayers: StageDef['units'] = [
    { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 1, y: 2 } },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
  ]

  it('기본 count 1 — 한 기가 올라서면 발동한다', () => {
    const state = mkBattle({
      units: twoPlayers,
      events: [ev('r1', { type: 'reachArea', area, faction: 'player' }, [dialogue('도달')])],
    })
    expect(state.pendingEvents).toEqual([])
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingEvents).toHaveLength(1)
  })

  it('count 2 — 미달이면 발동하지 않고 충족되면 발동한다', () => {
    const state = mkBattle({
      units: twoPlayers,
      events: [ev('r2', { type: 'reachArea', area, faction: 'player', count: 2 }, [dialogue()])],
    })
    const one = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(one.pendingEvents).toEqual([])
    const two = applyAction(one, { type: 'move', unitId: unit(one, 'xiahoudun').id, to: { x: 2, y: 2 } })
    expect(two.pendingEvents).toHaveLength(1)
  })

  it('진영이 다르면 같은 칸이라도 발동하지 않는다', () => {
    const state = mkBattle({
      units: twoPlayers,
      events: [ev('r3', { type: 'reachArea', area, faction: 'enemy' }, [dialogue()])],
    })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingEvents).toEqual([])
  })

  it('격파된 유닛은 칸을 채우지 못한다', () => {
    const state = mkBattle({
      units: twoPlayers,
      events: [ev('r4', { type: 'reachArea', area, faction: 'player', count: 2 }, [dialogue()])],
    })
    const one = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    const dun = applyAction(one, { type: 'move', unitId: unit(one, 'xiahoudun').id, to: { x: 2, y: 2 } })
    expect(dun.pendingEvents).toHaveLength(1) // 살아 있을 때는 발동
    // 같은 배치에서 하후돈이 죽어 있으면 count 2가 채워지지 않는다
    const dead = mkBattle({
      units: twoPlayers,
      events: [ev('r4', { type: 'reachArea', area, faction: 'player', count: 2 }, [dialogue()])],
    })
    unit(dead, 'xiahoudun').hp = 0
    unit(dead, 'xiahoudun').pos = { x: 2, y: 2 }
    const moved = applyAction(dead, { type: 'move', unitId: unit(dead, 'caocao').id, to: { x: 2, y: 1 } })
    expect(moved.pendingEvents).toEqual([])
  })
})

describe('발동은 전투당 1회 (firedEvents)', () => {
  it('조건이 계속 충족돼도 재발동하지 않는다', () => {
    const state = mkBattle({
      units: ADJACENT_PAIR,
      events: [ev('m1', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [dialogue()])],
    })
    const consumed = applyAction(state, { type: 'eventContinue' })
    expect(consumed.pendingEvents).toEqual([])
    expect(consumed.firedEvents).toEqual(['m1'])
    // 여전히 인접해 있지만 다시 뜨지 않는다
    const next = applyAction(consumed, { type: 'wait', unitId: unit(consumed, 'caocao').id })
    expect(next.pendingEvents).toEqual([])
    expect(next.firedEvents).toEqual(['m1'])
  })
})

// ---------- 가드 ----------

describe('pendingEvents 가드 — eventContinue만 통과', () => {
  const pendingState = (stock?: ConsumableStack[]): BattleState =>
    startBattle(
      mkStage({ units: ADJACENT_PAIR, events: [ev('e1', { type: 'battleStart' }, [dialogue()])] }),
      1,
      undefined,
      undefined,
      stock,
    )

  it('move를 거부한다 (prev 참조 반환)', () => {
    const state = pendingState()
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 1, y: 2 } })
    expect(next).toBe(state)
  })

  it('attack을 거부한다', () => {
    const state = pendingState()
    const next = applyAction(state, {
      type: 'attack',
      unitId: unit(state, 'caocao').id,
      targetId: unit(state, 'yellowInfantry').id,
    })
    expect(next).toBe(state)
  })

  it('strategy를 거부한다', () => {
    const state = pendingState()
    const next = applyAction(state, {
      type: 'strategy',
      unitId: unit(state, 'caocao').id,
      strategyId: 'goyang',
      target: unit(state, 'caocao').pos,
    })
    expect(next).toBe(state)
  })

  it('useItem을 거부한다', () => {
    const state = pendingState([{ itemId: 'hoebokSsal', count: 1 }])
    const caocao = unit(state, 'caocao')
    caocao.hp = 10
    const next = applyAction(state, {
      type: 'useItem',
      unitId: caocao.id,
      itemId: 'hoebokSsal',
      target: caocao.pos,
    })
    expect(next).toBe(state)
  })

  it('wait과 endPhase를 거부한다', () => {
    const state = pendingState()
    expect(applyAction(state, { type: 'wait', unitId: unit(state, 'caocao').id })).toBe(state)
    expect(applyAction(state, { type: 'endPhase' })).toBe(state)
  })

  it('eventContinue는 통과한다', () => {
    const state = pendingState()
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next).not.toBe(state)
    expect(next.pendingEvents).toEqual([])
  })

  it('대기 이벤트가 없을 때의 eventContinue는 무효 액션이다', () => {
    const state = mkBattle()
    expect(applyAction(state, { type: 'eventContinue' })).toBe(state)
  })
})

// ---------- 즉시형 액션 ----------

describe('즉시형 액션 — buff', () => {
  it("target 'playerAll'은 생존 아군 전원에게 걸린다", () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 1, y: 2 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
      events: [ev('b1', { type: 'battleStart' }, [{ type: 'buff', target: 'playerAll', stat: 'morale', amount: 6, duration: 3 }])],
    })
    expect(unit(state, 'caocao').buffs).toHaveLength(1)
    expect(unit(state, 'xiahoudun').buffs).toHaveLength(1)
    expect(unit(state, 'yellowInfantry').buffs).toHaveLength(0)
  })

  it('officerId 지정은 해당 유닛만 (적에게도 걸 수 있다)', () => {
    const state = mkBattle({
      events: [ev('b1', { type: 'battleStart' }, [{ type: 'buff', target: 'yellowInfantry', stat: 'def', amount: -5, duration: 1 }])],
    })
    expect(unit(state, 'yellowInfantry').buffs).toEqual([{ stat: 'def', amount: -5, remainingTurns: 1 }])
    expect(unit(state, 'caocao').buffs).toHaveLength(0)
  })

  it('없는 장수를 지정하면 조용히 무시된다', () => {
    const state = mkBattle({
      events: [ev('b1', { type: 'battleStart' }, [{ type: 'buff', target: 'zhangJiao', stat: 'atk', amount: 9, duration: 1 }])],
    })
    expect(state.units.every((u) => u.buffs.length === 0)).toBe(true)
    expect(state.firedEvents).toEqual(['b1']) // 발동 자체는 소진된다
  })
})

describe('즉시형 액션 — spawnUnits', () => {
  it('증원과 동일 시맨틱으로 유닛을 투입한다 (id 규칙 e{eventId}_{i}_{officerId})', () => {
    const state = mkBattle({
      events: [
        ev('s1', { type: 'battleStart' }, [
          { type: 'spawnUnits', units: [{ officerId: 'yellowArcher', faction: 'enemy', pos: { x: 5, y: 5 }, level: 4 }] },
        ]),
      ],
    })
    const spawned = unit(state, 'yellowArcher')
    expect(spawned.id).toBe('es1_0_yellowArcher')
    expect(spawned.level).toBe(4)
    expect(spawned.hp).toBe(maxHp(CLASSES[OFFICERS.yellowArcher.classId], 4))
    expect(spawned.faction).toBe('enemy')
  })

  it('자리가 막힌 유닛만 개별 취소된다', () => {
    const state = mkBattle({
      events: [
        ev('s1', { type: 'battleStart' }, [
          {
            type: 'spawnUnits',
            units: [
              { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 8, y: 8 } }, // 기존 적이 서 있는 칸
              { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 5, y: 5 } },
            ],
          },
        ]),
      ],
    })
    expect(state.units.find((u) => u.officerId === 'yellowArcher')).toBeUndefined()
    expect(unit(state, 'yellowCavalry').id).toBe('es1_1_yellowCavalry')
  })
})

describe('즉시형 액션 — removeUnits', () => {
  it('격파 처리 없이 조용히 이탈시킨다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 7, y: 8 } },
      ],
      events: [ev('x1', { type: 'battleStart' }, [{ type: 'removeUnits', officerIds: ['yellowArcher'] }])],
    })
    expect(state.units.find((u) => u.officerId === 'yellowArcher')).toBeUndefined()
    expect(state.log.some((l) => l.type === 'defeat')).toBe(false)
    expect(unit(state, 'caocao').exp).toBe(0) // 경험치도 주지 않는다
  })

  it('마지막 적이 이탈하면 전멸 승리가 된다 (의도된 동작 — 권항책)', () => {
    const state = mkBattle({
      units: ADJACENT_PAIR,
      events: [
        ev('x1', { type: 'battleStart' }, [
          dialogue('항복을 권한다'),
          { type: 'removeUnits', officerIds: ['yellowInfantry'] },
        ]),
      ],
    })
    expect(state.result).toBe('ongoing') // startBattle은 승패를 판정하지 않는다
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.units.some((u) => u.faction === 'enemy')).toBe(false)
    expect(next.result).toBe('victory')
  })
})

describe('즉시형 액션 — setBehavior', () => {
  it('지정 장수들의 AI 성향을 바꾼다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 }, behavior: 'guard' },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 7, y: 8 }, behavior: 'guard' },
      ],
      events: [
        ev('g1', { type: 'battleStart' }, [
          { type: 'setBehavior', officerIds: ['yellowInfantry', 'yellowArcher'], behavior: 'pursue' },
        ]),
      ],
    })
    expect(unit(state, 'yellowInfantry').behavior).toBe('pursue')
    expect(unit(state, 'yellowArcher').behavior).toBe('pursue')
  })
})

describe('즉시형 액션 — inflictStatus', () => {
  it('명중 판정 없이 확정 부여하고 로그를 남긴다 (원작 스크립트 혼란)', () => {
    const state = mkBattle({
      events: [ev('c1', { type: 'battleStart' }, [{ type: 'inflictStatus', officerIds: ['yellowInfantry'], status: 'confusion' }])],
    })
    const enemy = unit(state, 'yellowInfantry')
    expect(enemy.statuses).toEqual([{ id: 'confusion' }])
    expect(
      state.log.some((l) => l.type === 'event' && l.message.includes('혼란에 빠졌다') && l.targetId === enemy.id),
    ).toBe(true)
  })

  it('이미 같은 상태면 중복 부여하지 않는다', () => {
    const stage = mkStage({
      events: [
        ev('c1', { type: 'battleStart' }, [
          { type: 'inflictStatus', officerIds: ['yellowInfantry'], status: 'confusion' },
          { type: 'inflictStatus', officerIds: ['yellowInfantry'], status: 'confusion' },
        ]),
      ],
    })
    const state = startBattle(stage, 1)
    expect(unit(state, 'yellowInfantry').statuses).toEqual([{ id: 'confusion' }])
    expect(state.log.filter((l) => l.message.includes('혼란에 빠졌다')).length).toBe(1)
  })

  it('몹 장수 일괄 지정 — 같은 officerId 여러 기에 모두 걸린다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 7, y: 8 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 6, y: 8 } },
      ],
      events: [ev('c1', { type: 'battleStart' }, [{ type: 'inflictStatus', officerIds: ['westInfantry'], status: 'seal' }])],
    })
    const mobs = state.units.filter((u) => u.officerId === 'westInfantry')
    expect(mobs).toHaveLength(2)
    expect(mobs.every((u) => u.statuses.some((s) => s.id === 'seal'))).toBe(true)
    expect(unit(state, 'yellowInfantry').statuses).toEqual([]) // 지정하지 않은 적은 무영향
  })
})

describe('즉시형 액션 — setTile', () => {
  const gateStage = (events?: BattleEventDef[]): StageDef => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
      events,
    })
    stage.map.tiles[1][2] = 'gateClosed'
    return stage
  }

  it('닫힌 성문은 이동범위에서 제외된다', () => {
    const state = startBattle(gateStage(), 1)
    const range = movementRangeOf(state, unit(state, 'caocao'))
    expect(range.has(keyOf({ x: 2, y: 1 }))).toBe(false)
  })

  it('setTile로 열면 즉시 이동범위에 들어온다 (이동범위 캐시 없음)', () => {
    const state = startBattle(
      gateStage([ev('gate', { type: 'battleStart' }, [{ type: 'setTile', cells: [{ x: 2, y: 1 }], terrain: 'gate' }])]),
      1,
    )
    expect(state.map.tiles[1][2]).toBe('gate')
    const range = movementRangeOf(state, unit(state, 'caocao'))
    expect(range.has(keyOf({ x: 2, y: 1 }))).toBe(true)
    const moved = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(unit(moved, 'caocao').pos).toEqual({ x: 2, y: 1 })
  })

  it('스테이지 정의를 오염시키지 않는다 (createBattle 딥클론)', () => {
    const stage = gateStage([ev('gate', { type: 'battleStart' }, [{ type: 'setTile', cells: [{ x: 2, y: 1 }], terrain: 'gate' }])])
    const first = startBattle(stage, 1)
    expect(first.map.tiles[1][2]).toBe('gate')
    expect(stage.map.tiles[1][2]).toBe('gateClosed') // 원본 유지 — 재입장 시 다시 닫혀 있다
    const second = startBattle(stage, 1)
    expect(second.map.tiles[1][2]).toBe('gate') // 다시 열리는 것은 이벤트가 하는 일
    expect(stage.map.tiles[1][2]).toBe('gateClosed')
  })

  it('맵 밖 좌표는 무시된다', () => {
    const state = mkBattle({
      events: [
        ev('t1', { type: 'battleStart' }, [
          { type: 'setTile', cells: [{ x: 99, y: 0 }, { x: -1, y: 0 }, { x: 3, y: 3 }], terrain: 'wall' },
        ]),
      ],
    })
    expect(state.map.tiles[3][3]).toBe('wall')
    expect(state.map.tiles).toHaveLength(10)
    expect(state.map.tiles[0]).toHaveLength(10)
  })
})

describe('즉시형 액션 — levelUpEnemies', () => {
  it('생존 적 전원의 레벨을 올리고 HP/MP를 재계산·완전회복한다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 }, level: 5 },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 7, y: 8 }, level: 5 },
      ],
      events: [ev('lv', { type: 'battleStart' }, [{ type: 'levelUpEnemies', amount: 3 }])],
    })
    const inf = unit(state, 'yellowInfantry')
    const cls = CLASSES[inf.classId]
    expect(inf.level).toBe(8)
    expect(inf.maxHp).toBe(maxHp(cls, 8))
    expect(inf.maxMp).toBe(maxMp(cls, 8))
    expect(inf.hp).toBe(inf.maxHp)
    expect(inf.mp).toBe(inf.maxMp)
    expect(unit(state, 'yellowArcher').level).toBe(8)
    expect(unit(state, 'caocao').level).toBe(OFFICERS.caocao.level) // 아군은 무영향
  })

  it('officerIds를 주면 그 적들만 올린다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 }, level: 5 },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 7, y: 8 }, level: 5 },
      ],
      events: [ev('lv', { type: 'battleStart' }, [{ type: 'levelUpEnemies', amount: 2, officerIds: ['yellowArcher'] }])],
    })
    expect(unit(state, 'yellowInfantry').level).toBe(5)
    expect(unit(state, 'yellowArcher').level).toBe(7)
  })
})

describe('표시형 액션 — giveItem / 즉시형 giveExp', () => {
  // v1.2에서 giveItem은 표시형으로 승격됐다 — 큐 헤드에서 멈추고 eventContinue가 적재한다
  it('giveItem은 eventContinue 소비 시 pendingRewards에 쌓인다 (장비/도구 각각)', () => {
    const state = mkBattle({
      events: [
        ev('i1', { type: 'battleStart' }, [
          { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
          { type: 'giveItem', itemId: 'hoebokSsal', kind: 'consumable' },
        ]),
      ],
    })
    // 표시형이므로 아직 적재되지 않고 큐 헤드로 남아 있다 (UI가 모달을 띄우는 계약)
    expect(state.pendingRewards).toEqual([])
    expect(state.pendingEvents[0].queue[0].type).toBe('giveItem')

    const done = autoResolveEvents(state)
    expect(done.pendingRewards).toEqual([
      { itemId: 'leatherShield', kind: 'equipment' },
      { itemId: 'hoebokSsal', kind: 'consumable' },
    ])
    expect(done.pendingEvents).toEqual([])
  })

  it('giveExp는 아군에게 경험치를 주고 레벨업 시 최대치를 재계산한다', () => {
    const state = mkBattle({
      events: [ev('x1', { type: 'battleStart' }, [{ type: 'giveExp', target: 'caocao', amount: 120 }])],
    })
    const caocao = unit(state, 'caocao')
    expect(caocao.level).toBe(OFFICERS.caocao.level + 1)
    expect(caocao.exp).toBe(20)
    expect(caocao.maxHp).toBe(maxHp(CLASSES.lord, caocao.level))
    expect(state.log.some((l) => l.type === 'levelUp')).toBe(true)
  })

  it('giveExp 대상이 적/우군이면 무효다 (성장하지 않음)', () => {
    const state = mkBattle({
      events: [ev('x1', { type: 'battleStart' }, [{ type: 'giveExp', target: 'yellowInfantry', amount: 500 }])],
    })
    const enemy = unit(state, 'yellowInfantry')
    expect(enemy.exp).toBe(0)
    expect(enemy.level).toBe(OFFICERS.yellowInfantry.level)
  })
})

// ---------- 큐 실행 순서 ----------

describe('executeQueue — 즉시형/표시형 혼합', () => {
  it('표시형 앞의 즉시형은 먼저 실행되고 표시형에서 멈춘다', () => {
    const state = mkBattle({
      events: [
        ev('q1', { type: 'battleStart' }, [
          { type: 'buff', target: 'playerAll', stat: 'atk', amount: 5, duration: 1 },
          dialogue('그 다음 대사'),
          { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
        ]),
      ],
    })
    expect(unit(state, 'caocao').buffs).toHaveLength(1)
    expect(state.pendingRewards).toEqual([]) // 대사 뒤 액션은 아직 실행되지 않았다
    expect(state.pendingEvents[0].queue).toHaveLength(2)

    // 대사를 소비하면 다음 헤드(giveItem — v1.2 표시형)에서 다시 멈춘다
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.pendingRewards).toEqual([])
    expect(next.pendingEvents[0].queue[0].type).toBe('giveItem')

    const done = applyAction(next, { type: 'eventContinue' })
    expect(done.pendingRewards).toHaveLength(1)
    expect(done.pendingEvents).toEqual([]) // 큐 소진 → 대기 목록에서 빠진다
  })

  it('대사 여러 줄(연속 dialogue)은 eventContinue마다 하나씩 소비된다', () => {
    const state = mkBattle({
      events: [ev('q2', { type: 'battleStart' }, [dialogue('1'), dialogue('2')])],
    })
    expect(state.pendingEvents[0].queue).toHaveLength(2)
    const one = applyAction(state, { type: 'eventContinue' })
    expect(one.pendingEvents[0].queue).toHaveLength(1)
    const two = applyAction(one, { type: 'eventContinue' })
    expect(two.pendingEvents).toEqual([])
  })

  it('복수 이벤트가 동시 발동하면 정의 순서대로 FIFO로 쌓인다', () => {
    const state = mkBattle({
      events: [
        ev('first', { type: 'battleStart' }, [dialogue('첫째')]),
        ev('second', { type: 'battleStart' }, [dialogue('둘째')]),
      ],
    })
    expect(state.pendingEvents.map((p) => p.eventId)).toEqual(['first', 'second'])
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.pendingEvents.map((p) => p.eventId)).toEqual(['second'])
  })
})

describe('eventContinue — choice', () => {
  const choiceStage = (): StageDef =>
    mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 }, level: 5 },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 7, y: 8 }, level: 5 },
      ],
      events: [
        ev('strategy', { type: 'battleStart' }, [
          {
            type: 'choice',
            prompt: '어느 책을 쓰시겠습니까?',
            speaker: 'caocao',
            options: [
              { text: '권항책', actions: [{ type: 'removeUnits', officerIds: ['yellowArcher'] }] },
              {
                text: '강행책',
                actions: [
                  { type: 'levelUpEnemies', amount: 4 },
                  { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
                ],
              },
              { text: '유인책', actions: [dialogue('유인'), { type: 'buff', target: 'playerAll', stat: 'agi', amount: 3, duration: 2 }] },
            ],
          },
        ]),
      ],
    })

  it('옵션 0(기본)이 선택된다 — choice 미지정', () => {
    const state = startBattle(choiceStage(), 1)
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.units.find((u) => u.officerId === 'yellowArcher')).toBeUndefined()
    expect(next.pendingEvents).toEqual([])
  })

  it('선택한 옵션의 액션들이 큐 앞에 삽입돼 순서대로 실행된다', () => {
    const state = startBattle(choiceStage(), 1)
    const next = applyAction(state, { type: 'eventContinue', choice: 1 })
    expect(unit(next, 'yellowInfantry').level).toBe(9)
    // 분기 안의 giveItem은 표시형(v1.2)이라 한 번 더 소비해야 적재된다
    expect(next.pendingEvents[0].queue[0].type).toBe('giveItem')
    const done = applyAction(next, { type: 'eventContinue' })
    expect(done.pendingRewards).toEqual([{ itemId: 'leatherShield', kind: 'equipment' }])
  })

  it('분기 안의 표시형에서 다시 멈추고, 이어지는 즉시형은 그 뒤에 실행된다', () => {
    const state = startBattle(choiceStage(), 1)
    const picked = applyAction(state, { type: 'eventContinue', choice: 2 })
    expect(picked.pendingEvents).toHaveLength(1)
    expect(picked.pendingEvents[0].queue[0].type).toBe('dialogue')
    expect(unit(picked, 'caocao').buffs).toHaveLength(0)
    const done = applyAction(picked, { type: 'eventContinue' })
    expect(unit(done, 'caocao').buffs).toEqual([{ stat: 'agi', amount: 3, remainingTurns: 2 }])
    expect(done.pendingEvents).toEqual([])
  })

  it('범위 밖 choice는 0번으로 떨어진다', () => {
    const state = startBattle(choiceStage(), 1)
    const next = applyAction(state, { type: 'eventContinue', choice: 9 })
    expect(next.units.find((u) => u.officerId === 'yellowArcher')).toBeUndefined()
    const negative = applyAction(state, { type: 'eventContinue', choice: -1 })
    expect(negative.units.find((u) => u.officerId === 'yellowArcher')).toBeUndefined()
  })

  it('선택 결과가 로그에 남는다', () => {
    const state = startBattle(choiceStage(), 1)
    const next = applyAction(state, { type: 'eventContinue', choice: 1 })
    expect(next.log.some((l) => l.type === 'event' && l.message.includes('강행책'))).toBe(true)
  })

  it('스테이지 정의의 액션 배열을 소비하지 않는다 (딥클론)', () => {
    const stage = choiceStage()
    const state = startBattle(stage, 1)
    applyAction(state, { type: 'eventContinue', choice: 1 })
    const choice = stage.events![0].actions[0]
    expect(stage.events![0].actions).toHaveLength(1)
    expect(choice.type === 'choice' && choice.options[1].actions).toHaveLength(2)
  })
})

// ---------- 일기토 (duel) ----------

describe('eventContinue — duel', () => {
  const duelStage = (
    outcome: Extract<BattleEventDef['actions'][number], { type: 'duel' }>['outcome'],
    extra: BattleEventDef[] = [],
  ): StageDef =>
    mkStage({
      units: ADJACENT_PAIR,
      events: [
        ev('duel', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [
          {
            type: 'duel',
            a: 'caocao',
            b: 'yellowInfantry',
            lines: [{ speaker: 'caocao', text: '받아라!' }],
            outcome,
          },
        ]),
        ...extra,
      ],
    })

  it('아군 승리 경험치는 일반 격파와 동일하다 (grantExp 재사용)', () => {
    // 기준선: 같은 배치에서 평범하게 격파했을 때의 경험치
    const normal = forceKill(mkBattle({ units: ADJACENT_PAIR }), 'caocao', 'yellowInfantry')
    const normalExp = unit(normal, 'caocao').exp

    const duel = applyAction(startBattle(duelStage({ winner: 'a', loserFate: 'die' }), 1), { type: 'eventContinue' })
    expect(unit(duel, 'caocao').exp).toBe(normalExp)
    expect(normalExp).toBe(expGain(OFFICERS.caocao.level, OFFICERS.yellowInfantry.level, true))
  })

  it("loserFate 'die'는 격파 처리를 태운다 (로그 + 연쇄 unitDefeated 이벤트)", () => {
    const stage = duelStage({ winner: 'a', loserFate: 'die' }, [
      ev('chain', { type: 'unitDefeated', officerId: 'yellowInfantry' }, [
        { type: 'spawnUnits', units: [{ officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 5, y: 5 } }] },
        dialogue('원수를 갚으러 왔다'),
      ]),
    ])
    const next = applyAction(startBattle(stage, 1), { type: 'eventContinue' })
    expect(unit(next, 'yellowInfantry').hp).toBe(0)
    expect(next.log.some((l) => l.type === 'defeat')).toBe(true)
    // 연쇄: 일기토 사망 → unitDefeated 이벤트 발동 → 증원 + 새 대사 대기
    expect(next.firedEvents).toEqual(['duel', 'chain'])
    expect(unit(next, 'yellowCavalry')).toBeDefined()
    expect(next.pendingEvents).toHaveLength(1)
    expect(next.result).toBe('ongoing') // 새 적이 생겼으니 전멸도 아니다
  })

  it("loserFate 'die'는 기존 증원(reinforcements)도 연쇄시킨다", () => {
    const stage = duelStage({ winner: 'a', loserFate: 'die' })
    stage.reinforcements = [
      {
        trigger: { type: 'unitDefeated', unitId: 'u1_yellowInfantry' },
        units: [{ officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 6 } }],
      },
    ]
    const next = applyAction(startBattle(stage, 1), { type: 'eventContinue' })
    expect(next.spawnedReinforcements).toEqual([0])
    expect(unit(next, 'yellowArcher')).toBeDefined()
  })

  it("loserFate 'retreat'은 격파 처리 없이 전장에서 제거한다", () => {
    const next = applyAction(startBattle(duelStage({ winner: 'a', loserFate: 'retreat' }), 1), {
      type: 'eventContinue',
    })
    expect(next.units.find((u) => u.officerId === 'yellowInfantry')).toBeUndefined()
    expect(next.log.some((l) => l.type === 'defeat')).toBe(false)
    expect(next.log.some((l) => l.message.includes('퇴각'))).toBe(true)
    // 제거 자체는 경험치를 주지 않는다 — 아군 승리분(일기토 경험치)만 들어온다
    expect(unit(next, 'caocao').exp).toBe(expGain(OFFICERS.caocao.level, OFFICERS.yellowInfantry.level, true))
    expect(next.result).toBe('victory') // 남은 적이 없으면 전멸 승리
  })

  it('적이 이긴 일기토는 아군에게 경험치를 주지 않는다', () => {
    const next = applyAction(startBattle(duelStage({ winner: 'b', loserFate: 'retreat' }), 1), {
      type: 'eventContinue',
    })
    expect(next.units.find((u) => u.officerId === 'caocao')).toBeUndefined()
    expect(next.units.every((u) => u.exp === 0)).toBe(true)
  })

  it('무승부는 로그만 남기고 양쪽을 그대로 둔다', () => {
    const next = applyAction(startBattle(duelStage({ draw: true }), 1), { type: 'eventContinue' })
    expect(unit(next, 'caocao').hp).toBeGreaterThan(0)
    expect(unit(next, 'yellowInfantry').hp).toBeGreaterThan(0)
    expect(unit(next, 'caocao').exp).toBe(0)
    expect(next.log.some((l) => l.type === 'event' && l.message.includes('승부'))).toBe(true)
    expect(next.pendingEvents).toEqual([])
  })

  it('회피 가능 일기토는 choice + duel 조합으로 표현된다', () => {
    const stage = mkStage({
      units: ADJACENT_PAIR,
      events: [
        ev('avoidable', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [
          {
            type: 'choice',
            prompt: '일기토에 응하겠습니까?',
            speaker: 'caocao',
            options: [
              { text: '물러난다', actions: [dialogue('훗날을 기약하지')] },
              {
                text: '응한다',
                actions: [
                  {
                    type: 'duel',
                    a: 'caocao',
                    b: 'yellowInfantry',
                    lines: [{ speaker: null, text: '격돌!' }],
                    outcome: { draw: true },
                  },
                ],
              },
            ],
          },
        ]),
      ],
    })
    // 회피(옵션 0) — 대사만 남고 아무도 죽지 않는다
    const avoided = autoResolveEvents(startBattle(stage, 1), 0)
    expect(unit(avoided, 'yellowInfantry').hp).toBeGreaterThan(0)
    // 응전(옵션 1) — duel이 헤드로 올라와 소비된다
    const fought = applyAction(startBattle(stage, 1), { type: 'eventContinue', choice: 1 })
    expect(fought.pendingEvents[0].queue[0].type).toBe('duel')
    const resolved = applyAction(fought, { type: 'eventContinue' })
    expect(resolved.pendingEvents).toEqual([])
    expect(unit(resolved, 'caocao').hp).toBeGreaterThan(0)
  })

  it('참조 유닛이 이미 없으면 조용히 넘어간다', () => {
    const stage = duelStage({ winner: 'a', loserFate: 'die' })
    const state = startBattle(stage, 1)
    unit(state, 'yellowInfantry').hp = 0 // 대기 중에 다른 경로로 격파된 상황
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.pendingEvents).toEqual([])
    expect(unit(next, 'caocao').exp).toBe(0)
  })
})

// ---------- AI / 자동 소화 ----------

describe('AI — 이벤트 정지', () => {
  const aiStage = (): StageDef =>
    mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 1 } },
      ],
      events: [ev('meet', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [dialogue('적장 발견')])],
    })

  it('AI 이동으로 이벤트가 발동하면 stepAiUnit이 즉시 멈춘다', () => {
    const state = toEnemyPhase(startBattle(aiStage(), 1))
    const step = stepAiUnit(state, 'enemy')
    expect(step.state.pendingEvents).toHaveLength(1)
    expect(step.done).toBe(false)
    expect(step.actedUnitId).toBe(unit(state, 'yellowInfantry').id)
  })

  it('대기 이벤트가 있는 상태의 stepAiUnit은 진행 없이 반환한다 (무한루프 방지)', () => {
    const state = toEnemyPhase(startBattle(aiStage(), 1))
    const paused = stepAiUnit(state, 'enemy').state
    const again = stepAiUnit(paused, 'enemy')
    expect(again.state).toBe(paused)
    expect(again.done).toBe(false)
    expect(again.actedUnitId).toBeNull()
  })

  it('runAiPhase는 이벤트가 생기면 그대로 반환한다 (정책 없음)', () => {
    const state = toEnemyPhase(startBattle(aiStage(), 1))
    const after = runAiPhase(state, 'enemy')
    expect(after.pendingEvents).toHaveLength(1)
    expect(after.phase).toBe('enemy') // 페이즈를 넘기지 않았다
  })

  it('이벤트를 소화하면 AI 페이즈가 정상적으로 마무리된다', () => {
    const state = toEnemyPhase(startBattle(aiStage(), 1))
    const paused = runAiPhase(state, 'enemy')
    const resumed = runAiPhase(autoResolveEvents(paused), 'enemy')
    expect(resumed.pendingEvents).toEqual([])
    expect(resumed.phase).toBe('player')
    expect(resumed.turn).toBe(2)
  })
})

describe('autoResolveEvents', () => {
  it('대사 큐를 끝까지 소화한다', () => {
    const state = mkBattle({ events: [ev('d', { type: 'battleStart' }, [dialogue('1'), dialogue('2'), dialogue('3')])] })
    const done = autoResolveEvents(state)
    expect(done.pendingEvents).toEqual([])
    expect(done.firedEvents).toEqual(['d'])
  })

  it('pick으로 choice 분기를 고른다 (기본 0)', () => {
    const stage = mkStage({
      events: [
        ev('c', { type: 'battleStart' }, [
          {
            type: 'choice',
            prompt: '고르시오',
            speaker: null,
            options: [
              { text: 'A', actions: [{ type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' }] },
              { text: 'B', actions: [{ type: 'giveItem', itemId: 'hoebokSsal', kind: 'consumable' }] },
            ],
          },
        ]),
      ],
    })
    expect(autoResolveEvents(startBattle(stage, 1)).pendingRewards).toEqual([
      { itemId: 'leatherShield', kind: 'equipment' },
    ])
    expect(autoResolveEvents(startBattle(stage, 1), 1).pendingRewards).toEqual([
      { itemId: 'hoebokSsal', kind: 'consumable' },
    ])
  })

  it('대기 이벤트가 없으면 같은 상태를 그대로 반환한다', () => {
    const state = mkBattle()
    expect(autoResolveEvents(state)).toBe(state)
  })

  it('연쇄 이벤트까지 모두 소화한다', () => {
    const stage = mkStage({
      units: ADJACENT_PAIR,
      events: [
        ev('duel', { type: 'unitsMeet', a: 'caocao', b: 'yellowInfantry' }, [
          {
            type: 'duel',
            a: 'caocao',
            b: 'yellowInfantry',
            lines: [{ speaker: null, text: '!' }],
            outcome: { winner: 'a', loserFate: 'die' },
          },
        ]),
        ev('after', { type: 'unitDefeated', officerId: 'yellowInfantry' }, [dialogue('끝났다')]),
      ],
    })
    const done = autoResolveEvents(startBattle(stage, 1))
    expect(done.firedEvents).toEqual(['duel', 'after'])
    expect(done.pendingEvents).toEqual([])
    expect(done.result).toBe('victory')
  })
})

// ---------- 캠페인 회수 ----------

describe('캠페인 — loot allySurvived', () => {
  const allyStage = (itemId: string): StageDef =>
    mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'liuBei', faction: 'ally', pos: { x: 2, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
      loot: [{ trigger: 'allySurvived', itemId, officerId: 'liuBei' }],
    })

  it('지정 우군이 생존하면 도구가 지급된다 (원작 c13 유비 → 인수)', () => {
    const campaign = completeStory(newCampaign())
    const state = startBattle(allyStage('insu'), 1, campaign.roster)
    const before = consumableCount(campaign.consumables, 'insu')
    const next = applyVictory(campaign, state)
    expect(consumableCount(next.consumables, 'insu')).toBe(before + 1)
  })

  it('지정 우군이 퇴각(hp 0)하면 지급되지 않는다', () => {
    const campaign = completeStory(newCampaign())
    const state = startBattle(allyStage('insu'), 1, campaign.roster)
    unit(state, 'liuBei').hp = 0
    const before = consumableCount(campaign.consumables, 'insu')
    expect(consumableCount(applyVictory(campaign, state).consumables, 'insu')).toBe(before)
  })

  it('장비 itemId면 소지품으로 들어온다', () => {
    const campaign = completeStory(newCampaign())
    const state = startBattle(allyStage('leatherShield'), 1, campaign.roster)
    const next = applyVictory(campaign, state)
    expect(next.inventory.filter((i) => i.itemId === 'leatherShield')).toHaveLength(1)
  })

  it('기존 victory/bossKill 전리품은 그대로 동작한다', () => {
    const campaign = completeStory(newCampaign())
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 }, isBoss: true },
      ],
      loot: [
        { trigger: 'victory', itemId: 'leatherShield' },
        { trigger: 'bossKill', itemId: 'woodSword' },
      ],
    })
    const state = startBattle(stage, 1, campaign.roster)
    // 보스 생존 → victory 전리품만
    expect(applyVictory(campaign, state).inventory.some((i) => i.itemId === 'woodSword')).toBe(false)
    unit(state, 'yellowInfantry').hp = 0
    const killed = applyVictory(campaign, state)
    expect(killed.inventory.some((i) => i.itemId === 'leatherShield')).toBe(true)
    expect(killed.inventory.some((i) => i.itemId === 'woodSword')).toBe(true)
  })
})

describe('캠페인 — pendingRewards 회수', () => {
  const rewardStage = (): StageDef =>
    mkStage({
      events: [
        ev('reward', { type: 'battleStart' }, [
          { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
          { type: 'giveItem', itemId: 'hoebokSsal', kind: 'consumable' },
        ]),
      ],
    })

  it('장비는 소지품, 도구는 스톡으로 회수된다', () => {
    const campaign = completeStory(newCampaign())
    // giveItem은 표시형(v1.2) — 모달 소비까지 진행해야 적재된다
    const state = autoResolveEvents(startBattle(rewardStage(), 1, campaign.roster))
    expect(state.pendingRewards).toHaveLength(2)
    const next = applyVictory(campaign, state)
    expect(next.inventory.filter((i) => i.itemId === 'leatherShield')).toHaveLength(1)
    expect(consumableCount(next.consumables, 'hoebokSsal')).toBe(
      consumableCount(campaign.consumables, 'hoebokSsal') + 1,
    )
  })

  it('알 수 없는 itemId는 조용히 무시된다', () => {
    const campaign = completeStory(newCampaign())
    const state = startBattle(mkStage(), 1, campaign.roster)
    state.pendingRewards.push({ itemId: 'nonexistentItem', kind: 'equipment' })
    const next = applyVictory(campaign, state)
    expect(next.inventory).toHaveLength(campaign.inventory.length)
  })

  it('패배한 전투의 보상은 회수되지 않는다 (applyVictory 전용 경로)', () => {
    const campaign = completeStory(newCampaign())
    const stage = mkStage({
      units: ADJACENT_PAIR,
      events: [ev('reward', { type: 'battleStart' }, [{ type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' }])],
    })
    const state = autoResolveEvents(startBattle(stage, 1, campaign.roster))
    expect(state.pendingRewards).toHaveLength(1)
    const lost = forceKill(toEnemyPhase(state), 'yellowInfantry', 'caocao')
    expect(lost.result).toBe('defeat')
    // 캠페인 회수 경로는 applyVictory뿐 — 패배 상태에서는 호출되지 않으므로 보상은 소멸한다
    expect(campaign.inventory.some((i) => i.itemId === 'leatherShield')).toBe(false)
    // 재도전은 처음부터 (모달 소비 전이므로 pendingRewards는 비어 있고 큐에 남아 있다)
    expect(autoResolveEvents(startBattle(stage, 1, campaign.roster)).pendingRewards).toHaveLength(1)
  })
})
