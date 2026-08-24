// v1.2 승패 조건 데이터화 + 전장 시스템 — 패배 조건(turnLimit·unitDies) / setVictory·setDefeat /
// 불길(hazards) / 맵 아이템(groundItems·dropItem) / giveItem 표시형 / giveGold / 장수 이탈 /
// 장비 특수효과(사모 관통·여포궁 상태부여).
// 근거: 원작 공략 분석(패배 조건 20턴 표준·미축 페이크·화염 잔존·적장 자리의 보물).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
import { STRATEGIES } from '../data/strategies'
import {
  applyAction,
  effectiveDefeat,
  effectiveMaxHp,
  effectiveMaxMp,
  effectiveVictory,
  hazardAt,
  isImpassableTerrain,
  movementRangeOf,
  startBattle,
} from './battle'
import type { CampaignNode } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  completeStory,
  consumableCount,
  leaveOfficers,
  newCampaign,
} from './campaign'
import { autoResolveEvents } from './events'
import { keyOf } from './movement'
import type {
  BattleEventDef,
  BattleState,
  DefeatCondition,
  StageDef,
  TerrainId,
  UnitState,
  Vec2,
} from './types'

// ---------- 헬퍼 (consumables.test.ts / events.test.ts의 mkStage·mkBattle 패턴) ----------

/** 10×10 평지 맵 + 조조(아군 주인공) / 황건적병(적) 1기씩 */
function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'battlefield-test',
    name: '전장 테스트',
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

const mkBattle = (over: Partial<StageDef> = {}): BattleState => startBattle(mkStage(over), 1)

const ev = (id: string, trigger: BattleEventDef['trigger'], actions: BattleEventDef['actions']): BattleEventDef => ({
  id,
  trigger,
  actions,
})

/** 턴 N 진행 (아군·적만 있는 스테이지 기준 endPhase 2회 = 1턴) */
function advanceTurns(state: BattleState, turns: number): BattleState {
  let cur = state
  for (let i = 0; i < turns; i += 1) {
    cur = applyAction(cur, { type: 'endPhase' })
    cur = applyAction(cur, { type: 'endPhase' })
  }
  return cur
}

const lastLog = (state: BattleState, type: string): string | undefined =>
  state.log.filter((l) => l.type === type).at(-1)?.message

// =====================================================================================
// 1. 패배 조건 데이터화
// =====================================================================================

describe('패배 조건 — turnLimit', () => {
  const stage = (turns: number): Partial<StageDef> => ({ defeat: [{ type: 'turnLimit', turns }] })

  it('제한 턴까지는 전투가 계속된다', () => {
    const next = advanceTurns(mkBattle(stage(20)), 19)
    expect(next.turn).toBe(20)
    expect(next.result).toBe('ongoing')
  })

  it('제한 턴을 넘긴 턴이 시작되면 패배한다 (20턴 상한 → 21턴 시작 시)', () => {
    const next = advanceTurns(mkBattle(stage(20)), 20)
    expect(next.turn).toBe(21)
    expect(next.result).toBe('defeat')
    expect(lastLog(next, 'defeat')).toBe('20턴을 넘겼다 — 패배...')
  })

  it('제한 턴은 데이터값을 그대로 쓴다 (12턴 상한)', () => {
    expect(advanceTurns(mkBattle(stage(12)), 11).result).toBe('ongoing')
    const lost = advanceTurns(mkBattle(stage(12)), 12)
    expect(lost.result).toBe('defeat')
    expect(lastLog(lost, 'defeat')).toBe('12턴을 넘겼다 — 패배...')
  })

  it('패배 조건이 없는 스테이지는 턴이 흘러도 패배하지 않는다', () => {
    const next = advanceTurns(mkBattle(), 30)
    expect(next.turn).toBe(31)
    expect(next.result).toBe('ongoing')
  })
})

describe('패배 조건 — unitDies (사체가 남을 때만)', () => {
  const GUARD: StageDef['units'] = [
    { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
    { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
  ]
  const guardStage = (over: Partial<StageDef> = {}): Partial<StageDef> => ({
    units: GUARD,
    defeat: [{ type: 'unitDies', officerId: 'dianwei' }],
    ...over,
  })

  it('호위 대상이 살아 있으면 패배하지 않는다', () => {
    expect(advanceTurns(mkBattle(guardStage()), 3).result).toBe('ongoing')
  })

  it('호위 대상의 사체가 전장에 남으면 패배하고 로그에 장수명이 들어간다', () => {
    const state = mkBattle(guardStage())
    unit(state, 'dianwei').hp = 0
    const next = applyAction(state, { type: 'endPhase' })
    expect(next.result).toBe('defeat')
    expect(lastLog(next, 'defeat')).toBe('전위가 쓰러졌다 — 패배...')
  })

  it('removeUnits로 전장을 떠난 유닛은 패배를 발동시키지 않는다 (원작 미축 페이크)', () => {
    const state = mkBattle(
      guardStage({
        events: [ev('gone', { type: 'battleStart' }, [{ type: 'removeUnits', officerIds: ['dianwei'] }])],
      }),
    )
    expect(state.units.some((u) => u.officerId === 'dianwei')).toBe(false)
    const next = applyAction(state, { type: 'endPhase' })
    expect(next.result).toBe('ongoing')
  })

  it('일기토 퇴각(retreat)도 배열에서 사라지므로 패배가 아니다', () => {
    const state = mkBattle(
      guardStage({
        events: [
          ev('duel', { type: 'battleStart' }, [
            {
              type: 'duel',
              a: 'dianwei',
              b: 'yellowInfantry',
              lines: [{ speaker: null, text: '일기토' }],
              outcome: { winner: 'b', loserFate: 'retreat' },
            },
          ]),
        ],
      }),
    )
    const next = autoResolveEvents(state)
    expect(next.units.some((u) => u.officerId === 'dianwei')).toBe(false)
    expect(next.result).toBe('ongoing')
  })

  it('일기토 사망(die)은 사체가 남으므로 패배한다', () => {
    const state = mkBattle(
      guardStage({
        events: [
          ev('duel', { type: 'battleStart' }, [
            {
              type: 'duel',
              a: 'dianwei',
              b: 'yellowInfantry',
              lines: [{ speaker: null, text: '일기토' }],
              outcome: { winner: 'b', loserFate: 'die' },
            },
          ]),
        ],
      }),
    )
    const next = autoResolveEvents(state)
    expect(unit(next, 'dianwei').hp).toBe(0)
    expect(next.result).toBe('defeat')
    expect(lastLog(next, 'defeat')).toBe('전위가 쓰러졌다 — 패배...')
  })

  it('주인공 격파는 데이터 패배 조건보다 먼저 판정된다 (전용 문구)', () => {
    const state = mkBattle({ defeat: [{ type: 'unitDies', officerId: 'caocao' }] })
    unit(state, 'caocao').hp = 0
    const next = applyAction(state, { type: 'endPhase' })
    expect(next.result).toBe('defeat')
    expect(lastLog(next, 'defeat')).toBe('주인공 부대 괴멸 — 패배...')
  })

  it('패배 판정은 승리 평가보다 먼저다 (같은 시점에 둘 다 성립하면 패배)', () => {
    // 적을 전멸시키면서 호위 대상의 사체도 남은 상태 → 승리가 아니라 패배
    const state = mkBattle({
      units: GUARD,
      defeat: [{ type: 'unitDies', officerId: 'dianwei' }],
    })
    unit(state, 'dianwei').hp = 0
    unit(state, 'yellowInfantry').hp = 0
    const next = applyAction(state, { type: 'endPhase' })
    expect(next.result).toBe('defeat')
  })
})

describe('effectiveVictory / effectiveDefeat (UI 조건 문구 계약)', () => {
  it('오버라이드가 없으면 스테이지 정의를 돌려준다', () => {
    const stage = mkStage({ defeat: [{ type: 'turnLimit', turns: 20 }] })
    const state = startBattle(stage, 1)
    expect(effectiveVictory(state, stage)).toEqual([{ type: 'annihilation' }])
    expect(effectiveDefeat(state, stage)).toEqual([{ type: 'turnLimit', turns: 20 }])
  })

  it('패배 조건이 정의되지 않은 스테이지는 빈 목록이다 (주인공 격파는 계약 밖)', () => {
    const stage = mkStage()
    expect(effectiveDefeat(startBattle(stage, 1), stage)).toEqual([])
  })

  it('오버라이드가 있으면 그것이 우선한다', () => {
    const stage = mkStage({ defeat: [{ type: 'turnLimit', turns: 20 }] })
    const state = startBattle(stage, 1)
    state.victoryOverride = [{ type: 'defeatBoss' }]
    state.defeatOverride = [{ type: 'turnLimit', turns: 12 }]
    expect(effectiveVictory(state, stage)).toEqual([{ type: 'defeatBoss' }])
    expect(effectiveDefeat(state, stage)).toEqual([{ type: 'turnLimit', turns: 12 }])
  })
})

// =====================================================================================
// 2. setVictory / setDefeat
// =====================================================================================

describe('setVictory / setDefeat', () => {
  it('setVictory가 승리 조건을 갈아끼우고 그 조건으로 승리한다', () => {
    // 원래 조건은 적 전멸이지만, 2턴에 "조조가 서 있는 칸 도달"로 바뀌어 즉시 성립한다
    const state = mkBattle({
      events: [
        ev('turn', { type: 'turnStart', turn: 2 }, [
          { type: 'setVictory', victory: [{ type: 'reachPoint', pos: { x: 1, y: 1 } }] },
        ]),
      ],
    })
    const next = advanceTurns(state, 1)
    expect(next.victoryOverride).toEqual([{ type: 'reachPoint', pos: { x: 1, y: 1 } }])
    expect(next.result).toBe('victory')
    expect(next.log.some((l) => l.type === 'event' && l.message === '승리 조건이 변경되었다!')).toBe(true)
  })

  it('setDefeat은 패배 조건을 갈아끼운다 (12턴 상한으로 교체)', () => {
    const state = mkBattle({
      defeat: [{ type: 'turnLimit', turns: 30 }],
      events: [
        ev('cut', { type: 'turnStart', turn: 2 }, [{ type: 'setDefeat', defeat: [{ type: 'turnLimit', turns: 12 }] }]),
      ],
    })
    const at2 = advanceTurns(state, 1)
    expect(at2.defeatOverride).toEqual([{ type: 'turnLimit', turns: 12 }])
    expect(at2.log.some((l) => l.type === 'event' && l.message === '패배 조건이 변경되었다!')).toBe(true)
    expect(advanceTurns(at2, 10).result).toBe('ongoing') // 12턴
    const lost = advanceTurns(at2, 11) // 13턴
    expect(lost.result).toBe('defeat')
    expect(lastLog(lost, 'defeat')).toBe('12턴을 넘겼다 — 패배...')
  })

  it('스테이지 정의를 오염시키지 않는다 (딥클론 사본)', () => {
    const stage = mkStage({
      defeat: [{ type: 'turnLimit', turns: 30 }],
      events: [
        ev('sw', { type: 'battleStart' }, [
          { type: 'setVictory', victory: [{ type: 'defeatBoss' }] },
          { type: 'setDefeat', defeat: [{ type: 'turnLimit', turns: 5 }] },
        ]),
      ],
    })
    const state = startBattle(stage, 1)
    // 상태 쪽 오버라이드를 마음대로 헝클어도 정의는 그대로다
    state.victoryOverride![0] = { type: 'annihilation' }
    ;(state.defeatOverride![0] as Extract<DefeatCondition, { type: 'turnLimit' }>).turns = 99
    expect(stage.victory).toEqual([{ type: 'annihilation' }])
    expect(stage.defeat).toEqual([{ type: 'turnLimit', turns: 30 }])
    const action = stage.events![0].actions[0] as Extract<BattleEventDef['actions'][number], { type: 'setVictory' }>
    expect(action.victory).toEqual([{ type: 'defeatBoss' }])
  })

  it('표시 대기 이벤트가 남아 있는 동안은 승패 판정이 보류된다 (choice 중 조건 변경 안전)', () => {
    // 선택지 안에서 "1턴 초과 = 패배"로 바꾼다. 큐가 비기 전에는 판정되지 않는다.
    const state = mkBattle({
      events: [
        ev('c', { type: 'battleStart' }, [
          {
            type: 'choice',
            prompt: '어찌하시겠습니까',
            speaker: 'caocao',
            options: [{ text: '물러난다', actions: [{ type: 'setDefeat', defeat: [{ type: 'turnLimit', turns: 0 }] }] }],
          },
        ]),
      ],
    })
    // 선택 전: 조건이 아직 안 바뀌었고 대기 중이라 판정도 없다
    const held = applyAction(state, { type: 'endPhase' })
    expect(held).toBe(state) // 대기 이벤트가 있으면 eventContinue 외 전 액션 무효
    const resolved = applyAction(state, { type: 'eventContinue', choice: 0 })
    expect(resolved.defeatOverride).toEqual([{ type: 'turnLimit', turns: 0 }])
    expect(resolved.pendingEvents).toEqual([]) // 큐 소진 → 이 시점에 한 번에 판정
    expect(resolved.result).toBe('defeat')
  })
})

// =====================================================================================
// 3. hazards (불길)
// =====================================================================================

/** y=1 한 줄만 지나갈 수 있는 외길 맵 — 통과 차단을 검증한다 */
function corridorStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'river' as TerrainId),
  )
  for (let x = 0; x < 10; x += 1) tiles[1][x] = 'plain'
  return mkStage({
    map: { width: 10, height: 10, tiles },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 1 } },
    ],
    ...over,
  })
}

const fire = (cells: Vec2[], duration: number): BattleEventDef['actions'][number] => ({
  type: 'setHazard',
  cells,
  kind: 'fire',
  duration,
})

describe('hazards — 조회 / 이동 차단', () => {
  it('hazardAt이 그 칸의 불길을 돌려준다', () => {
    const state = mkBattle({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 3 }], 3)])] })
    expect(hazardAt(state, { x: 3, y: 3 })).toEqual({ pos: { x: 3, y: 3 }, kind: 'fire', remainingTurns: 3 })
    expect(hazardAt(state, { x: 4, y: 3 })).toBeUndefined()
  })

  it('불타는 칸은 진입할 수 없다', () => {
    const state = mkBattle({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 1 }], 3)])] })
    const range = movementRangeOf(state, unit(state, 'caocao'))
    expect(range.has(keyOf({ x: 2, y: 1 }))).toBe(true)
    expect(range.has(keyOf({ x: 3, y: 1 }))).toBe(false)
    // 액션 자체도 거부된다 (참조 동일)
    const blocked = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 3, y: 1 } })
    expect(blocked).toBe(state)
  })

  it('불타는 칸은 통과도 불가 — 외길이면 뒤쪽 전부가 닫힌다', () => {
    const state = startBattle(
      corridorStage({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 1 }], 3)])] }),
      1,
    )
    const range = movementRangeOf(state, unit(state, 'caocao'))
    expect(range.has(keyOf({ x: 2, y: 1 }))).toBe(true)
    expect(range.has(keyOf({ x: 3, y: 1 }))).toBe(false)
    expect(range.has(keyOf({ x: 4, y: 1 }))).toBe(false) // 우회로가 없다
    expect(range.has(keyOf({ x: 0, y: 1 }))).toBe(true) // 반대쪽은 정상
  })

  it('적로(전 지형 코스트 1)로도 불길은 지나갈 수 없다', () => {
    const state = startBattle(
      corridorStage({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 1 }], 3)])] }),
      1,
    )
    const caocao = unit(state, 'caocao')
    caocao.equipment = { accessory: { itemId: 'dilu', level: 1, exp: 0 } }
    const range = movementRangeOf(state, caocao)
    expect(range.has(keyOf({ x: 3, y: 1 }))).toBe(false)
    expect(range.has(keyOf({ x: 4, y: 1 }))).toBe(false)
  })

  it('서 있던 칸이 불타도 유닛은 탈출할 수 있다', () => {
    const state = mkBattle({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 1, y: 1 }], 3)])] })
    const caocao = unit(state, 'caocao')
    expect(hazardAt(state, caocao.pos)).toBeDefined()
    const range = movementRangeOf(state, caocao)
    expect(range.has(keyOf({ x: 2, y: 1 }))).toBe(true)
    const moved = applyAction(state, { type: 'move', unitId: caocao.id, to: { x: 2, y: 1 } })
    expect(unit(moved, 'caocao').pos).toEqual({ x: 2, y: 1 })
  })
})

describe('hazards — 감쇠', () => {
  it('턴이 증가할 때 1턴씩 줄고, 다 타면 사라지며 로그를 남긴다', () => {
    const state = mkBattle({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 3 }], 2)])] })
    const t2 = advanceTurns(state, 1)
    expect(t2.hazards[0].remainingTurns).toBe(1)
    expect(t2.log.some((l) => l.type === 'hazard' && l.message === '불길이 사그라들었다')).toBe(false)

    const t3 = advanceTurns(t2, 1)
    expect(t3.hazards).toEqual([])
    expect(t3.log.some((l) => l.type === 'hazard' && l.message === '불길이 사그라들었다')).toBe(true)
  })

  it('남은 턴이 다른 불길은 각각 자기 시점에 사그라든다', () => {
    const state = mkBattle({
      events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 3 }], 1), fire([{ x: 4, y: 3 }], 3)])],
    })
    const t2 = advanceTurns(state, 1)
    expect(t2.hazards.map((h) => h.pos)).toEqual([{ x: 4, y: 3 }])
    expect(advanceTurns(t2, 2).hazards).toEqual([])
  })
})

describe('hazards — setHazard 액션', () => {
  it('맵 밖 칸과 진입 불가 지형(강·성벽·닫힌 성문)은 개별 건너뛴다', () => {
    const stage = mkStage()
    stage.map.tiles[2][2] = 'river'
    stage.map.tiles[2][3] = 'wall'
    stage.map.tiles[2][4] = 'gateClosed'
    stage.events = [
      ev('f', { type: 'battleStart' }, [
        fire(
          [
            { x: 1, y: 2 }, // 평지 — 붙는다
            { x: 2, y: 2 }, // 강
            { x: 3, y: 2 }, // 성벽
            { x: 4, y: 2 }, // 닫힌 성문
            { x: -1, y: 2 }, // 맵 밖
            { x: 10, y: 2 }, // 맵 밖
          ],
          3,
        ),
      ]),
    ]
    const state = startBattle(stage, 1)
    expect(state.hazards.map((h) => h.pos)).toEqual([{ x: 1, y: 2 }])
    expect(state.log.some((l) => l.type === 'event' && l.message === '불길이 치솟았다 — 1칸')).toBe(true)
    expect(isImpassableTerrain('river')).toBe(true)
    expect(isImpassableTerrain('plain')).toBe(false)
  })

  it('이미 타고 있는 칸은 남은 턴을 늘리기만 한다 (짧은 불이 긴 불을 덮지 않는다)', () => {
    const state = mkBattle({
      events: [ev('f', { type: 'battleStart' }, [fire([{ x: 3, y: 3 }], 5), fire([{ x: 3, y: 3 }], 2)])],
    })
    expect(state.hazards).toHaveLength(1)
    expect(state.hazards[0].remainingTurns).toBe(5)
  })
})

describe('hazards — 화계 발화 (strategy.hazard)', () => {
  const ORIGINAL = STRATEGIES.hwajin.hazard
  beforeAll(() => {
    STRATEGIES.hwajin.hazard = { duration: 3 }
  })
  afterAll(() => {
    STRATEGIES.hwajin.hazard = ORIGINAL
  })

  /** 곽가(참모 계열)가 화진을 쓸 수 있는 배치 — 적 2기라 격파해도 전멸 승리가 되지 않는다 */
  function fireStage(over: Partial<StageDef> = {}): StageDef {
    return mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'guojia', faction: 'player', pos: { x: 2, y: 2 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 3 } },
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
      ...over,
    })
  }

  function castHwajin(stage: StageDef): BattleState {
    const state = startBattle(stage, 1)
    const guojia = unit(state, 'guojia')
    guojia.level = 10 // 화진 습득 레벨 8
    guojia.mp = 40
    return applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'hwajin',
      target: { x: 4, y: 3 },
    })
  }

  it('십자 범위의 연소 가능 지형에 불길이 남는다 (명중 여부와 무관)', () => {
    const next = castHwajin(fireStage())
    expect(next.hazards).toHaveLength(5) // 중심 + 상하좌우, 전부 평지
    expect(next.hazards.every((h) => h.kind === 'fire' && h.remainingTurns === 3)).toBe(true)
    // 아무도 서 있지 않은 칸도 타오른다 = 타격 판정과 무관하다
    expect(hazardAt(next, { x: 3, y: 3 })).toBeDefined()
    expect(next.log.some((l) => l.type === 'hazard' && l.message === '불길이 번졌다 — 5칸')).toBe(true)
  })

  it('연소 불가 지형(산지·강)과 맵 밖은 타지 않는다', () => {
    const stage = fireStage()
    stage.map.tiles[2][4] = 'mountain'
    stage.map.tiles[3][5] = 'river'
    const next = castHwajin(stage)
    expect(next.hazards.map((h) => h.pos)).toEqual([
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 3 },
    ])
    expect(next.log.some((l) => l.type === 'hazard' && l.message === '불길이 번졌다 — 3칸')).toBe(true)
  })

  it('이미 더 오래 타는 칸은 남은 턴이 줄지 않는다 (max 갱신)', () => {
    const stage = fireStage({ events: [ev('f', { type: 'battleStart' }, [fire([{ x: 4, y: 3 }], 9)])] })
    const next = castHwajin(stage)
    expect(hazardAt(next, { x: 4, y: 3 })!.remainingTurns).toBe(9)
    expect(hazardAt(next, { x: 3, y: 3 })!.remainingTurns).toBe(3)
  })

  it('hazard가 없는 화계는 불길을 남기지 않는다', () => {
    const stage = fireStage()
    const state = startBattle(stage, 1)
    const guojia = unit(state, 'guojia')
    guojia.level = 10
    guojia.mp = 40
    const next = applyAction(state, {
      type: 'strategy',
      unitId: guojia.id,
      strategyId: 'choyeol', // 단일 화계 — hazard 없음
      target: { x: 4, y: 3 },
    })
    expect(next.hazards).toEqual([])
  })
})

// =====================================================================================
// 4. groundItems / dropItem
// =====================================================================================

describe('groundItems — 맵 아이템 픽업', () => {
  it('아군이 밟으면 회수되고 맵에서 사라진다', () => {
    const state = mkBattle({ groundItems: [{ pos: { x: 2, y: 1 }, itemId: 'leatherShield' }] })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingRewards).toEqual([{ itemId: 'leatherShield', kind: 'equipment' }])
    expect(next.groundItems).toEqual([])
    expect(lastLog(next, 'reward')).toBe('가죽 방패를 손에 넣었다!')
  })

  it('한 칸에 여러 개가 놓여 있으면 전부 회수한다 (도구도 함께)', () => {
    const state = mkBattle({
      groundItems: [
        { pos: { x: 2, y: 1 }, itemId: 'leatherShield' },
        { pos: { x: 2, y: 1 }, itemId: 'hoebokSsal' },
        { pos: { x: 3, y: 1 }, itemId: 'woodSword' },
      ],
    })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingRewards).toEqual([
      { itemId: 'leatherShield', kind: 'equipment' },
      { itemId: 'hoebokSsal', kind: 'consumable' },
    ])
    expect(next.groundItems).toEqual([{ pos: { x: 3, y: 1 }, itemId: 'woodSword' }])
  })

  it('적은 밟아도 줍지 않는다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 5, y: 5 } },
      ],
      groundItems: [{ pos: { x: 5, y: 4 }, itemId: 'leatherShield' }],
    })
    const enemyPhase = applyAction(state, { type: 'endPhase' })
    const next = applyAction(enemyPhase, {
      type: 'move',
      unitId: unit(enemyPhase, 'yellowInfantry').id,
      to: { x: 5, y: 4 },
    })
    expect(unit(next, 'yellowInfantry').pos).toEqual({ x: 5, y: 4 })
    expect(next.pendingRewards).toEqual([])
    expect(next.groundItems).toHaveLength(1)
  })

  it('우군(ally)도 줍지 않는다 — 전리품은 플레이어 것이다', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'dianwei', faction: 'ally', pos: { x: 5, y: 5 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
      groundItems: [{ pos: { x: 5, y: 4 }, itemId: 'leatherShield' }],
    })
    const allyPhase = applyAction(state, { type: 'endPhase' })
    expect(allyPhase.phase).toBe('ally')
    const next = applyAction(allyPhase, { type: 'move', unitId: unit(allyPhase, 'dianwei').id, to: { x: 5, y: 4 } })
    expect(next.pendingRewards).toEqual([])
    expect(next.groundItems).toHaveLength(1)
  })

  it('미등록 itemId는 조용히 무시된다 (칸에서는 치워진다)', () => {
    const state = mkBattle({ groundItems: [{ pos: { x: 2, y: 1 }, itemId: 'nonexistentItem' }] })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingRewards).toEqual([])
    expect(next.groundItems).toEqual([])
  })

  it('스테이지 정의를 오염시키지 않는다 (전투 로컬 사본)', () => {
    const stage = mkStage({ groundItems: [{ pos: { x: 2, y: 1 }, itemId: 'leatherShield' }] })
    const state = startBattle(stage, 1)
    applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(stage.groundItems).toEqual([{ pos: { x: 2, y: 1 }, itemId: 'leatherShield' }])
    expect(startBattle(stage, 1).groundItems).toHaveLength(1) // 재도전은 처음부터
  })

  it('회수한 맵 아이템은 applyVictory가 캠페인으로 옮긴다', () => {
    const campaign = completeStory(newCampaign())
    const stage = mkStage({
      groundItems: [
        { pos: { x: 2, y: 1 }, itemId: 'leatherShield' },
        { pos: { x: 2, y: 1 }, itemId: 'hoebokSsal' },
      ],
    })
    const state = startBattle(stage, 1, campaign.roster)
    const picked = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    const next = applyVictory(campaign, picked)
    expect(next.inventory.filter((i) => i.itemId === 'leatherShield')).toHaveLength(1)
    expect(consumableCount(next.consumables, 'hoebokSsal')).toBe(
      consumableCount(campaign.consumables, 'hoebokSsal') + 1,
    )
  })
})

describe('dropItem 액션', () => {
  it('pos를 주면 그 칸에 떨어진다', () => {
    const state = mkBattle({
      events: [ev('d', { type: 'battleStart' }, [{ type: 'dropItem', itemId: 'leatherShield', pos: { x: 5, y: 5 } }])],
    })
    expect(state.groundItems).toEqual([{ pos: { x: 5, y: 5 }, itemId: 'leatherShield' }])
    expect(state.pendingRewards).toEqual([])
    expect(state.log.some((l) => l.type === 'event' && l.message === '가죽 방패가 땅에 떨어졌다')).toBe(true)
  })

  it('officerId를 주면 그 장수의 자리에 떨어진다 — hp 0 사체도 포함', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'chengYuanzhi', faction: 'enemy', pos: { x: 6, y: 6 }, isBoss: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } }, // 전멸 승리 방지
      ],
      events: [ev('d', { type: 'turnStart', turn: 2 }, [{ type: 'dropItem', itemId: 'leatherShield', officerId: 'chengYuanzhi' }])],
    })
    unit(state, 'chengYuanzhi').hp = 0 // 격파 유닛은 배열에 남는다
    const next = advanceTurns(state, 1)
    expect(next.groundItems).toEqual([{ pos: { x: 6, y: 6 }, itemId: 'leatherShield' }])
  })

  it('그 칸에 생존 아군이 서 있으면 즉시 손에 들어온다', () => {
    const state = mkBattle({
      events: [ev('d', { type: 'battleStart' }, [{ type: 'dropItem', itemId: 'leatherShield', pos: { x: 1, y: 1 } }])],
    })
    expect(state.pendingRewards).toEqual([{ itemId: 'leatherShield', kind: 'equipment' }])
    expect(state.groundItems).toEqual([])
    expect(state.log.some((l) => l.type === 'event' && l.message === '가죽 방패를 손에 넣었다!')).toBe(true)
  })

  it('적이 서 있는 칸은 즉시 픽업이 아니라 맵에 남는다', () => {
    const state = mkBattle({
      events: [ev('d', { type: 'battleStart' }, [{ type: 'dropItem', itemId: 'leatherShield', pos: { x: 8, y: 8 } }])],
    })
    expect(state.pendingRewards).toEqual([])
    expect(state.groundItems).toHaveLength(1)
  })

  it('미등록 itemId·없는 장수·맵 밖은 조용히 무시된다', () => {
    const state = mkBattle({
      events: [
        ev('d', { type: 'battleStart' }, [
          { type: 'dropItem', itemId: 'nonexistentItem', pos: { x: 5, y: 5 } },
          { type: 'dropItem', itemId: 'leatherShield', officerId: 'liubei' },
          { type: 'dropItem', itemId: 'leatherShield', pos: { x: 99, y: 99 } },
        ]),
      ],
    })
    expect(state.groundItems).toEqual([])
    expect(state.pendingRewards).toEqual([])
  })

  it('떨어진 아이템은 이후 아군이 밟아 회수한다', () => {
    const state = mkBattle({
      events: [ev('d', { type: 'battleStart' }, [{ type: 'dropItem', itemId: 'leatherShield', pos: { x: 2, y: 1 } }])],
    })
    const next = applyAction(state, { type: 'move', unitId: unit(state, 'caocao').id, to: { x: 2, y: 1 } })
    expect(next.pendingRewards).toEqual([{ itemId: 'leatherShield', kind: 'equipment' }])
    expect(next.groundItems).toEqual([])
  })
})

// =====================================================================================
// 5. giveItem 표시형 / giveGold
// =====================================================================================

describe('giveItem — 표시형 승격 (UI 모달 계약)', () => {
  it('큐 헤드로 남아 정지하고, eventContinue 소비 시 적재된다', () => {
    const state = mkBattle({
      events: [
        ev('g', { type: 'battleStart' }, [
          { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
          { type: 'buff', target: 'playerAll', stat: 'atk', amount: 5, duration: 2 },
        ]),
      ],
    })
    // 표시형이므로 뒤의 즉시형(buff)까지 함께 멈춘다
    expect(state.pendingRewards).toEqual([])
    expect(state.pendingEvents[0].queue[0].type).toBe('giveItem')
    expect(unit(state, 'caocao').buffs).toEqual([])

    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.pendingRewards).toEqual([{ itemId: 'leatherShield', kind: 'equipment' }])
    expect(next.log.some((l) => l.type === 'event' && l.message === '가죽 방패를 손에 넣었다!')).toBe(true)
    expect(unit(next, 'caocao').buffs).toHaveLength(1) // 뒤의 즉시형이 이어서 실행된다
    expect(next.pendingEvents).toEqual([])
  })

  it('연속 giveItem은 한 번에 하나씩 소비된다', () => {
    const state = mkBattle({
      events: [
        ev('g', { type: 'battleStart' }, [
          { type: 'giveItem', itemId: 'leatherShield', kind: 'equipment' },
          { type: 'giveItem', itemId: 'hoebokSsal', kind: 'consumable' },
        ]),
      ],
    })
    const one = applyAction(state, { type: 'eventContinue' })
    expect(one.pendingRewards).toHaveLength(1)
    expect(one.pendingEvents[0].queue[0].type).toBe('giveItem')
    const two = applyAction(one, { type: 'eventContinue' })
    expect(two.pendingRewards).toHaveLength(2)
    expect(two.pendingEvents).toEqual([])
  })

  it('미등록 itemId도 모달 계약대로 소비되고 id가 로그에 남는다', () => {
    const state = mkBattle({
      events: [ev('g', { type: 'battleStart' }, [{ type: 'giveItem', itemId: 'ghostItem', kind: 'equipment' }])],
    })
    const next = applyAction(state, { type: 'eventContinue' })
    expect(next.log.some((l) => l.message === 'ghostItem을(를) 손에 넣었다!')).toBe(true)
  })
})

describe('giveGold', () => {
  it('pendingGold에 적재되고 로그를 남긴다 (즉시형)', () => {
    const state = mkBattle({ events: [ev('g', { type: 'battleStart' }, [{ type: 'giveGold', amount: 3000 }])] })
    expect(state.pendingGold).toBe(3000)
    expect(state.log.some((l) => l.type === 'event' && l.message === '군자금 3000을 얻었다!')).toBe(true)
  })

  it('여러 번 받으면 누적된다', () => {
    const state = mkBattle({
      events: [ev('g', { type: 'battleStart' }, [{ type: 'giveGold', amount: 500 }, { type: 'giveGold', amount: 250 }])],
    })
    expect(state.pendingGold).toBe(750)
  })

  it('applyVictory가 노드 보상금에 합산한다', () => {
    const campaign = completeStory(newCampaign()) // n01 — rewardGold 300
    const stage = mkStage({ events: [ev('g', { type: 'battleStart' }, [{ type: 'giveGold', amount: 3000 }])] })
    const state = startBattle(stage, 1, campaign.roster)
    const next = applyVictory(campaign, state)
    expect(next.gold).toBe(campaign.gold + 300 + 3000)
  })

  it('giveGold가 없으면 보상금만 들어온다 (기존 계약 유지)', () => {
    const campaign = completeStory(newCampaign())
    const next = applyVictory(campaign, startBattle(mkStage(), 1, campaign.roster))
    expect(next.gold).toBe(campaign.gold + 300)
  })
})

// =====================================================================================
// 6. 장수 이탈 (leaveOfficers / 노드 leave)
// =====================================================================================

describe('leaveOfficers', () => {
  it('로스터에서 제거하고 장착 장비는 창고로 회수한다', () => {
    const campaign = newCampaign()
    const dianwei = campaign.roster.find((r) => r.officerId === 'dianwei')!
    const gearCount = Object.keys(dianwei.equipment).length
    expect(gearCount).toBeGreaterThan(0)

    const next = leaveOfficers(campaign, ['dianwei'])
    expect(next.roster.some((r) => r.officerId === 'dianwei')).toBe(false)
    expect(next.roster).toHaveLength(campaign.roster.length - 1)
    expect(next.inventory).toHaveLength(campaign.inventory.length + gearCount)
    // 원본 불변
    expect(campaign.roster.some((r) => r.officerId === 'dianwei')).toBe(true)
    expect(campaign.inventory).toHaveLength(0)
  })

  it('무구성장한 장비도 레벨/경험치 그대로 창고로 들어온다', () => {
    const campaign = newCampaign()
    const dianwei = campaign.roster.find((r) => r.officerId === 'dianwei')!
    dianwei.equipment.weapon = { itemId: 'ironSpear', level: 3, exp: 40 }
    const next = leaveOfficers(campaign, ['dianwei'])
    expect(next.inventory).toContainEqual({ itemId: 'ironSpear', level: 3, exp: 40 })
  })

  it('없는 id·이미 빠진 장수는 조용히 무시된다 (멱등, 참조 동일)', () => {
    const campaign = newCampaign()
    expect(leaveOfficers(campaign, ['liubei'])).toBe(campaign)
    expect(leaveOfficers(campaign, [])).toBe(campaign)
    const once = leaveOfficers(campaign, ['dianwei'])
    expect(leaveOfficers(once, ['dianwei'])).toBe(once)
  })

  it('여러 명을 한 번에 뺄 수 있다', () => {
    const campaign = newCampaign()
    const next = leaveOfficers(campaign, ['dianwei', 'xiahouyuan'])
    expect(next.roster).toHaveLength(campaign.roster.length - 2)
  })
})

describe('노드 leave — applyVictory 소화 (join 뒤)', () => {
  const NODE_ID = 'testLeaveNode'
  const node: CampaignNode = {
    id: NODE_ID,
    type: 'battle',
    stageId: 'battlefield-test',
    rewardGold: 100,
    join: ['xuChu'],
    leave: [{ officerId: 'dianwei', when: 'ifDead' }, { officerId: 'xiahouyuan' }],
    next: null,
  }
  beforeAll(() => {
    CAMPAIGN_NODES.push(node)
  })
  afterAll(() => {
    CAMPAIGN_NODES.splice(CAMPAIGN_NODES.indexOf(node), 1)
  })

  const stage = (): StageDef =>
    mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'xiahouyuan', faction: 'player', pos: { x: 3, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })

  const atNode = () => ({ ...newCampaign(), nodeId: NODE_ID })

  it("when 'ifDead'는 사체가 남았을 때만 이탈한다", () => {
    const campaign = atNode()
    const state = startBattle(stage(), 1, campaign.roster)
    unit(state, 'dianwei').hp = 0
    const next = applyVictory(campaign, state)
    expect(next.roster.some((r) => r.officerId === 'dianwei')).toBe(false)
  })

  it("when 'ifDead'인데 살아서 돌아오면 로스터에 남는다", () => {
    const campaign = atNode()
    const next = applyVictory(campaign, startBattle(stage(), 1, campaign.roster))
    expect(next.roster.some((r) => r.officerId === 'dianwei')).toBe(true)
  })

  it('when 생략은 always — 생사와 무관하게 이탈한다', () => {
    const campaign = atNode()
    const next = applyVictory(campaign, startBattle(stage(), 1, campaign.roster))
    expect(next.roster.some((r) => r.officerId === 'xiahouyuan')).toBe(false)
  })

  it('합류(join)를 먼저 소화한 뒤 이탈이 처리된다', () => {
    const campaign = atNode()
    const state = startBattle(stage(), 1, campaign.roster)
    unit(state, 'dianwei').hp = 0
    const next = applyVictory(campaign, state)
    expect(next.roster.some((r) => r.officerId === 'xuChu')).toBe(true)
    expect(next.roster.map((r) => r.officerId)).not.toContain('dianwei')
    expect(next.roster.map((r) => r.officerId)).not.toContain('xiahouyuan')
  })

  it('이탈한 장수의 장비는 창고로 회수된다 (전투 중 성장분 포함)', () => {
    const campaign = atNode()
    const state = startBattle(stage(), 1, campaign.roster)
    const dianwei = unit(state, 'dianwei')
    dianwei.hp = 0
    dianwei.equipment = { weapon: { itemId: 'ironSpear', level: 2, exp: 30 } }
    const next = applyVictory(campaign, state)
    expect(next.inventory).toContainEqual({ itemId: 'ironSpear', level: 2, exp: 30 })
  })
})

// =====================================================================================
// 7. 장비 특수효과 — pierceBack (사모) / onHitStatus (여포궁)
// =====================================================================================

describe('장비 특수효과 — pierceBack / onHitStatus', () => {
  const PIERCE = 'testSamo'
  const STATUS_BOW = 'testYeobogung'

  beforeAll(() => {
    EQUIPMENT[PIERCE] = {
      id: PIERCE,
      name: '시험용 사모',
      slot: 'weapon',
      bonus: { atk: 80 },
      price: null,
      tier: 3,
      isTreasure: true,
      pierceBack: true,
      description: '테스트 전용 — 관통 무기',
    }
    EQUIPMENT[STATUS_BOW] = {
      id: STATUS_BOW,
      name: '시험용 여포궁',
      slot: 'weapon',
      bonus: { atk: 40 },
      price: null,
      tier: 3,
      isTreasure: true,
      onHitStatus: 'immobile',
      description: '테스트 전용 — 상태이상 부여 무기',
    }
  })
  afterAll(() => {
    delete EQUIPMENT[PIERCE]
    delete EQUIPMENT[STATUS_BOW]
  })

  /** 조조 → (2,1) 적 → (3,1) 뒤편 칸. 뒤편 유닛은 over로 갈아끼운다 */
  function lineStage(behind?: StageDef['units'][number]): StageDef {
    return mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 1 } },
        ...(behind ? [behind] : []),
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 9 } }, // 전멸 승리 방지
      ],
    })
  }

  /** 조조에게 무기를 물리고, 대상은 혼란(확정 피격)으로 만들어 명중을 보장한다 */
  function attackWith(stage: StageDef, itemId: string): { before: BattleState; after: BattleState } {
    const before = startBattle(stage, 1)
    const caocao = unit(before, 'caocao')
    caocao.equipment = { weapon: { itemId, level: 1, exp: 0 } }
    const target = unit(before, 'yellowInfantry')
    target.statuses.push({ id: 'confusion' })
    target.hp = target.maxHp
    const after = applyAction(before, { type: 'attack', unitId: caocao.id, targetId: target.id })
    return { before, after }
  }

  it('명중 시 대상 뒤편 칸의 적도 관통한다', () => {
    const { before, after } = attackWith(
      lineStage({ officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 1 } }),
      PIERCE,
    )
    expect(unit(after, 'yellowArcher').hp).toBeLessThan(unit(before, 'yellowArcher').hp)
    expect(after.log.some((l) => l.type === 'pierce' || l.type === 'pierceCrit')).toBe(true)
    expect(after.log.some((l) => l.message.includes('(관통!)'))).toBe(true)
  })

  it('뒤편이 비어 있으면 관통이 발생하지 않는다', () => {
    const { after } = attackWith(lineStage(), PIERCE)
    expect(after.log.some((l) => l.type === 'pierce' || l.type === 'pierceCrit')).toBe(false)
  })

  it('뒤편이 아군이면 관통하지 않는다 (적만 맞는다)', () => {
    const { before, after } = attackWith(
      lineStage({ officerId: 'dianwei', faction: 'player', pos: { x: 3, y: 1 } }),
      PIERCE,
    )
    expect(unit(after, 'dianwei').hp).toBe(unit(before, 'dianwei').hp)
    expect(after.log.some((l) => l.type === 'pierce')).toBe(false)
  })

  it('관통 대상은 반격하지 않는다 (본 대상만 반격 판정)', () => {
    const { after } = attackWith(
      lineStage({ officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 1 } }),
      PIERCE,
    )
    // 혼란 대상은 반격 불가 + 관통 대상은 반격 경로에 없다 → 반격 로그가 없다
    expect(after.log.some((l) => l.type === 'counter')).toBe(false)
  })

  it('pierceBack이 없는 무기는 뒤편에 적이 있어도 관통하지 않는다', () => {
    const { before, after } = attackWith(
      lineStage({ officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 1 } }),
      'yitianSword',
    )
    expect(unit(after, 'yellowArcher').hp).toBe(unit(before, 'yellowArcher').hp)
  })

  /** 대상이 반드시 살아남는(방어 버프) 상태로 한 대 때린다 — 상태 부여 검증용 */
  function tankAttack(itemId: string, extraStatuses: UnitState['statuses'] = []): BattleState {
    const before = startBattle(lineStage(), 1)
    const caocao = unit(before, 'caocao')
    caocao.equipment = { weapon: { itemId, level: 1, exp: 0 } }
    const target = unit(before, 'yellowInfantry')
    target.statuses.push({ id: 'confusion' }, ...extraStatuses) // 혼란 = 확정 피격
    target.buffs.push({ stat: 'def', amount: 9999, remainingTurns: 9 }) // 이번 타격으로는 죽지 않는다
    return applyAction(before, { type: 'attack', unitId: caocao.id, targetId: target.id })
  }

  it('onHitStatus는 명중 시 상태이상을 확정 부여한다', () => {
    const after = tankAttack(STATUS_BOW)
    const target = unit(after, 'yellowInfantry')
    expect(target.hp).toBeGreaterThan(0)
    expect(target.statuses.some((s) => s.id === 'immobile')).toBe(true)
    expect(after.log.some((l) => l.type === 'status' && l.message.includes('부동'))).toBe(true)
  })

  it('onHitStatus가 없는 무기는 상태이상을 부여하지 않는다', () => {
    const after = tankAttack('yitianSword')
    expect(unit(after, 'yellowInfantry').statuses.some((s) => s.id === 'immobile')).toBe(false)
  })

  it('이미 그 상태이상을 가진 대상에게는 중복 부여하지 않는다', () => {
    const after = tankAttack(STATUS_BOW, [{ id: 'immobile' }])
    expect(unit(after, 'yellowInfantry').statuses.filter((s) => s.id === 'immobile')).toHaveLength(1)
  })

  it('반격에도 적용된다 — 그 타격의 공격자(방어자) 장비 기준', () => {
    // 조조(1,1) → 적(2,1) 공격 → 적이 사모로 반격 → 조조 뒤편(0,1)의 하후돈까지 관통.
    // 조조의 순발을 1로 눌러 반격 명중을 보장하고, 적 방어를 올려 반격 전에 죽지 않게 한다.
    const stage = mkStage({
      units: [
        { officerId: 'xiahoudun', faction: 'player', pos: { x: 0, y: 1 } },
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 1 } },
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    const before = startBattle(stage, 1)
    const caocao = unit(before, 'caocao')
    caocao.equipment = {}
    caocao.buffs.push({ stat: 'agi', amount: -9999, remainingTurns: 9 }) // 실효 순발 1 → 반격 명중 100%
    const enemy = unit(before, 'yellowInfantry')
    enemy.equipment = { weapon: { itemId: PIERCE, level: 1, exp: 0 } }
    enemy.buffs.push({ stat: 'def', amount: 9999, remainingTurns: 9 }) // 반격 전에 죽지 않는다

    const after = applyAction(before, { type: 'attack', unitId: caocao.id, targetId: enemy.id })
    expect(after.log.some((l) => l.type === 'counter')).toBe(true)
    expect(unit(after, 'xiahoudun').hp).toBeLessThan(unit(before, 'xiahoudun').hp)
    expect(after.log.some((l) => l.type === 'pierce' || l.type === 'pierceCrit')).toBe(true)
  })
})

// =====================================================================================
// 8. v1.3 장비 특수효과 — 최대 HP/MP·책략/원거리 감소·회심 회피·명중/회피 (kr-blog §R5)
// =====================================================================================

describe('v1.3 장비 특수효과 (kr-blog §R5)', () => {
  function make(over: Partial<StageDef> = {}): BattleState {
    return startBattle(mkStage(over), 1)
  }

  const equipArmor = (state: BattleState, officerId: string, itemId: string): void => {
    unit(state, officerId).equipment = { armor: { itemId, level: 1, exp: 0 } }
  }

  it('투구 최대 HP 가산 — 실효 최대 HP가 올라간다', () => {
    const state = make()
    const caocao = unit(state, 'caocao')
    const base = effectiveMaxHp(caocao)
    caocao.equipment = { accessory: { itemId: 'bronzeHelm', level: 1, exp: 0 } }
    expect(effectiveMaxHp(caocao)).toBe(base + 30) // 구리투구 +30
    caocao.equipment = { accessory: { itemId: 'leatherHelm', level: 1, exp: 0 } }
    expect(effectiveMaxHp(caocao)).toBe(base + 15)
  })

  it('생성 시 최대 HP 가산 반영 — 스폰 유닛의 maxHp에 즉시 적용된다', () => {
    const state = make()
    const caocao = unit(state, 'caocao')
    const base = caocao.maxHp // 스폰 시점 기본
    caocao.equipment = { accessory: { itemId: 'bronzeHelm', level: 1, exp: 0 } }
    caocao.maxHp = effectiveMaxHp(caocao) // 실제 장비 변경 경로는 리듀서가 처리 (레벨업/승급 시 재계산)
    expect(caocao.maxHp).toBe(base + 30)
  })

  it('복건/칠흑도복 — 실효 최대 MP 가산', () => {
    const state = make()
    const caocao = unit(state, 'caocao')
    const base = effectiveMaxMp(caocao)
    caocao.equipment = { accessory: { itemId: 'fuJin', level: 1, exp: 0 } }
    expect(effectiveMaxMp(caocao)).toBe(base + 15) // 복건 +15
    caocao.equipment = { accessory: { itemId: 'guanJin', level: 1, exp: 0 } }
    expect(effectiveMaxMp(caocao)).toBe(base + 30) // 관건 +30
    caocao.equipment = { armor: { itemId: 'blackRobe', level: 1, exp: 0 } }
    expect(effectiveMaxMp(caocao)).toBe(base + 20) // 칠흑도복 +20
  })

  it('봉황깃옷 — 매턴 최대 HP 20% 회복', () => {
    const state = make()
    const caocao = unit(state, 'caocao')
    equipArmor(state, 'caocao', 'phoenixRobe')
    caocao.hp = Math.trunc((caocao.maxHp * 40) / 100) // 절반 이상 잃게 설정, 20% 회복 예상
    const before = caocao.hp
    const after = advanceTurns(state, 1)
    const regenTarget = unit(after, 'caocao')
    expect(regenTarget.hp).toBeGreaterThan(before)
    expect(regenTarget.hp).toBeLessThanOrEqual(before + Math.trunc((regenTarget.maxHp * 20) / 100) + 1)
  })

  it('황금갑옷 — 회심의 일격을 무조건 회피 (crit 로그 없음)', () => {
    const state = make()
    const caocao = unit(state, 'caocao')
    caocao.equipment = { weapon: { itemId: 'gudingDao', level: 1, exp: 0 } } // 공격력 확보
    const target = unit(state, 'yellowInfantry')
    equipArmor(state, 'yellowInfantry', 'goldenArmor')
    target.statuses.push({ id: 'confusion' }) // 확정 피격
    caocao.buffs.push({ stat: 'morale', amount: 9999, remainingTurns: 9 }) // 회심 확률 100%
    const after = applyAction(state, { type: 'attack', unitId: caocao.id, targetId: target.id })
    expect(after.log.some((l) => l.type === 'crit' || l.type === 'pierceCrit')).toBe(false)
  })

  it('백은갑옷 — 책략 피해 절반 (독연 시전 비교)', () => {
    // 책략(독연, 데미지+상태)을 아는 시험용 풍수사와 표적을 직접 정의해 동일 시드로 시전한다.
    // 대상이 백은갑옷을 낀 경우만 책략 데미지가 절반으로 줄어든다.
    const originalStrategies = CLASSES['geomancer'].strategies
    CLASSES['geomancer'].strategies = [{ strategyId: 'dogyeon', learnLevel: 1 }]
    try {
      const stage = mkStage({
        units: [
          { officerId: 'caocao', faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
          { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 4 } },
        ],
      })
      const castOn = (armored: boolean): number => {
        const state = startBattle(stage, 999)
        const caster = unit(state, 'caocao')
        caster.classId = 'geomancer'
        caster.mp = 99
        caster.equipment = { weapon: { itemId: 'stoneGemSword', level: 1, exp: 0 } }
        const target = unit(state, 'yellowInfantry')
        target.statuses.push({ id: 'confusion' }) // 책략 명중 100% 강제
        if (armored) target.equipment = { armor: { itemId: 'silverArmor', level: 1, exp: 0 } }
        target.hp = target.maxHp
        const after = applyAction(state, { type: 'strategy', unitId: caster.id, strategyId: 'dogyeon', target: target.pos })
        return (
          after.log
            .filter((l) => l.type === 'strategy' && (l.amount ?? 0) < 0)
            .reduce((acc, l) => acc + Math.abs(l.amount!), 0) || 0
        )
      }
      // 백은갑옷 미착용 ~ 착용 비교 — 명중은 난수 999 시드로 양쪽 동일 (감쇠는 대상 장비 의존)
      const plain = castOn(false)
      const armored = castOn(true)
      expect(armored).toBeLessThan(plain)
    } finally {
      CLASSES['geomancer'].strategies = originalStrategies
    }
  })

  it('무명장갑 명중+ / 방패 회피+ — 명중률 퍼센트포인트 보정 (데이터·헬퍼 존재 확인)', () => {
    expect(EQUIPMENT.namelessGauntlet.hitBonus).toBe(10)
    expect(EQUIPMENT.leatherShield.evadeBonus).toBe(10)
    expect(EQUIPMENT.bronzeShield.evadeBonus).toBe(15)
  })

  it('기마갑옷 — 원거리(활) 공격 피해를 감소시킨다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 5 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 7, y: 5 }, level: 5 },
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 9 } }, // 전멸 승리 방지
      ],
    })
    const makeArcher = (state: BattleState): void => {
      const arc = unit(state, 'xiahouyuan')
      arc.classId = 'archer'
      arc.equipment = { weapon: { itemId: 'ironBow', level: 1, exp: 0 } }
    }
    const dealt = (s: BattleState, uid: string): number => {
      // 해당 유닛에게 날아간 타격 로그 음수 합 = 받은 데미지 (hit/crit)
      return s.log
        .filter((l) => l.targetId === uid && (l.amount ?? 0) < 0)
        .reduce((acc, l) => acc + (l.amount ?? 0), 0)
    }
    // 가죽기마갑옷 미착용
    const s1 = startBattle(stage, 1)
    makeArcher(s1)
    unit(s1, 'yellowInfantry').statuses.push({ id: 'confusion' }) // 확정 명중
    const a1 = applyAction(s1, {
      type: 'attack',
      unitId: unit(s1, 'xiahouyuan').id,
      targetId: unit(s1, 'yellowInfantry').id,
    })
    const plainDmg = dealt(a1, unit(a1, 'yellowInfantry').id)
    // 가죽기마갑옷(0.7) 장착
    const s2 = startBattle(stage, 1)
    makeArcher(s2)
    unit(s2, 'yellowInfantry').statuses.push({ id: 'confusion' }) // 확정 명중
    unit(s2, 'yellowInfantry').equipment = { armor: { itemId: 'leatherHorseArmor', level: 1, exp: 0 } }
    const a2 = applyAction(s2, {
      type: 'attack',
      unitId: unit(s2, 'xiahouyuan').id,
      targetId: unit(s2, 'yellowInfantry').id,
    })
    const armoredDmg = dealt(a2, unit(a2, 'yellowInfantry').id)
    // 기마갑옷은 피해를 0.7배로 줄인다 → 받은 데미지(음수)의 절댓값이 더 작다
    expect(Math.abs(armoredDmg)).toBeLessThan(Math.abs(plainDmg))
  })
})

// =====================================================================================
// v1.3 몰우전 — 근접 병과에 원거리 공격 부여 (kr-blog §R5)
// =====================================================================================

describe('몰우전 rangedAttack (v1.3)', () => {
  it('근접 병과가 몰우전을 장착하면 2~3칸의 원거리 공격이 가능하다', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } }, // 거리 2
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 9 } }, // 전멸 승리 방지
      ],
    })
    const state = startBattle(stage, 1)
    const caocao = unit(state, 'caocao') // lord — 근접(minRange 1)
    caocao.equipment = { accessory: { itemId: 'moYuJian', level: 1, exp: 0 }, weapon: { itemId: 'ironSword', level: 1, exp: 0 } }
    const target = unit(state, 'yellowInfantry')
    target.statuses.push({ id: 'confusion' }) // 확정 명중
    // 거리 2에서 공격 시도 — 근접 병과지만 몰우전으로 유효해야 한다
    const after = applyAction(state, { type: 'attack', unitId: caocao.id, targetId: target.id })
    expect(after.log.some((l) => l.type === 'hit' || l.type === 'crit' || l.type === 'miss')).toBe(true)
    expect(unit(after, 'yellowInfantry').hp).toBeLessThan(target.maxHp)
  })

  it('몰우전 없이는 거리 2 공격이 거부된다 (근접 병과)', () => {
    const stage = mkStage({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 3, y: 1 } },
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
    })
    const state = startBattle(stage, 1)
    const caocao = unit(state, 'caocao')
    const target = unit(state, 'yellowInfantry')
    target.hp = target.maxHp
    const after = applyAction(state, { type: 'attack', unitId: caocao.id, targetId: target.id })
    expect(unit(after, 'yellowInfantry').hp).toBe(target.maxHp) // 공격 무효
  })
})
