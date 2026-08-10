// v1.0 상태이상 — 방해 책략 부여 · 행동 게이트 · 페이즈 시작 턴 처리 · AI 채점.
// 근거: docs/research/caocao.md §90(지속턴 없음 + 운÷2 자연해제), items.md §3(허보 한계명중 80)
//
// 데이터 독립성: 이 파일은 OFFICERS/CLASSES에 **테스트 전용 레코드**를 등록해서 쓴다.
// 실제 장수 능력치가 바뀌어도(밸런스 조정) 시드 고정 판정이 흔들리지 않게 하는 장치다.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { STATUSES, statusName } from '../data/statuses'
import { STRATEGIES } from '../data/strategies'
import { decideUnit } from './ai'
import { applyAction, effectiveStats, startBattle } from './battle'
import { strategyHitRate } from './formulas'
import type {
  BattleAction,
  BattleState,
  ConsumableStack,
  StageDef,
  StageUnitDef,
  StatusId,
  TerrainId,
  UnitState,
} from './types'

// ---------- 테스트 전용 데이터 ----------

/** 책사 Lv16 시전자 — 정신 130 / 사기 78 (장비 없음) */
const CASTER = 'testCaster'
/** 운 0 — 자연 해제 확률 0% (roll(_, 0)은 언제나 실패). 정신 12 / 사기 3 */
const VICTIM = 'testVictim'
/** VICTIM과 같은 규격의 두 번째 운 0 유닛 (한 페이즈에 둘을 동시에 볼 때) */
const VICTIM2 = 'testVictim2'
/** 운 200 — 자연 해제 확률 100% (roll(_, 100)은 언제나 성공) */
const LUCKY = 'testLucky'
/** 운 40 — 자연 해제 확률 20% (÷2 임계값을 시드로 양쪽에서 찌른다) */
const MID = 'testMid'

/** 방해 책략만 아는 시험용 병과 (테스트마다 strategies를 갈아끼운다) */
const DISRUPTER_CLASS = 'testDisrupterClass'
const DISRUPTER = 'testDisrupter'
const TARGET_MAGE = 'testTargetMage' // 책사 — 책략 보유 + MP > 0 (금책 유효 대상)
const TARGET_FOOT = 'testTargetFoot' // 보병 — 책략 없음, 근접 (부동 유효 대상)
const TARGET_BOW = 'testTargetBow' // 궁병 — 원거리 (부동 무효 대상)

const TEST_OFFICERS: [string, { classId: string; luck: number; int?: number; level: number }][] = [
  [CASTER, { classId: 'strategist', luck: 60, int: 100, level: 16 }],
  [VICTIM, { classId: 'heavyInfantry', luck: 0, level: 1 }],
  [VICTIM2, { classId: 'heavyInfantry', luck: 0, level: 1 }],
  [LUCKY, { classId: 'heavyInfantry', luck: 200, level: 1 }],
  [MID, { classId: 'heavyInfantry', luck: 40, level: 1 }],
  [DISRUPTER, { classId: DISRUPTER_CLASS, luck: 60, int: 100, level: 10 }],
  [TARGET_MAGE, { classId: 'strategist', luck: 40, level: 5 }],
  [TARGET_FOOT, { classId: 'heavyInfantry', luck: 40, level: 5 }],
  [TARGET_BOW, { classId: 'archer', luck: 40, level: 5 }],
]

beforeAll(() => {
  CLASSES[DISRUPTER_CLASS] = {
    ...CLASSES.strategist,
    id: DISRUPTER_CLASS,
    lineage: DISRUPTER_CLASS,
    name: '시험용 방해술사',
    promotesTo: undefined,
    strategies: [], // 테스트마다 교체
  }
  for (const [id, spec] of TEST_OFFICERS) {
    OFFICERS[id] = {
      id,
      name: id,
      stats: { str: 60, ldr: 50, int: spec.int ?? 20, agi: 50, luck: spec.luck },
      classId: spec.classId,
      level: spec.level,
      // 장비를 주지 않는다 — 무구성장·경험치 배율이 섞이지 않게 한다
    }
  }
})
afterAll(() => {
  delete CLASSES[DISRUPTER_CLASS]
  for (const [id] of TEST_OFFICERS) delete OFFICERS[id]
})

// ---------- 헬퍼 ----------

function mkStage(units: StageUnitDef[], over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 12 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'status-test',
    name: '상태이상 테스트',
    map: { width: 12, height: 12, tiles },
    units,
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const mkBattle = (units: StageUnitDef[], over?: Partial<StageDef>, stock?: ConsumableStack[]): BattleState =>
  startBattle(mkStage(units, over), 1, undefined, undefined, stock)

const unit = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

const logsOf = (state: BattleState, type: string) => state.log.filter((l) => l.type === type)

/** 방해술사(적)의 AI 판단 결과 액션 */
const actOf = (state: BattleState): BattleAction => decideUnit(state, unit(state, DISRUPTER)).act

/** 시전자(책사 Lv16) + 피격자(운 0 보병 Lv1)가 인접해 선 전투 */
const castBattle = (): BattleState =>
  mkBattle([
    { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
    { officerId: VICTIM, faction: 'enemy', pos: { x: 2, y: 3 } },
  ])

// ---------- 데이터 계약 ----------

describe('방해 책략 데이터', () => {
  it('4종 모두 원작 ルＡ 규격이다 — 사거리 4 / 단일 / MP8 / 무속성 / 적 대상', () => {
    const expected: [string, StatusId][] = [
      ['heobo', 'confusion'],
      ['bongchaek', 'seal'],
      ['dogyeon', 'poison'],
      ['pobak', 'immobile'],
    ]
    for (const [id, inflicts] of expected) {
      const s = STRATEGIES[id]
      expect(s, id).toBeDefined()
      expect(s.kind, id).toBe('status')
      expect(s.inflicts, id).toBe(inflicts)
      expect(s.element, id).toBe('none')
      expect(s.mpCost, id).toBe(8)
      expect(s.range, id).toBe(4)
      expect(s.area, id).toBe('single')
      expect(s.capHitRate, id).toBe(80)
      expect(s.targets, id).toBe('enemy')
      // 지속턴은 존재하지 않는다 (원작: 운÷2 자연해제 / 해제약만)
      expect(s.buff, id).toBeUndefined()
      expect(s.power, id).toBeUndefined()
    }
  })

  it('병과 배분 — 책사 허보 Lv14 / 참모 +봉책 Lv16 / 풍수사 포박 Lv14 / 방술사 +독연 Lv16', () => {
    const learn = (classId: string, strategyId: string): number | undefined =>
      CLASSES[classId].strategies.find((s) => s.strategyId === strategyId)?.learnLevel

    expect(learn('strategist', 'heobo')).toBe(14)
    expect(learn('counselor', 'heobo')).toBe(14) // 2차 전승
    expect(learn('counselor', 'bongchaek')).toBe(16)
    expect(learn('geomancer', 'pobak')).toBe(14)
    expect(learn('seniorGeomancer', 'pobak')).toBe(14) // 2차 전승
    expect(learn('seniorGeomancer', 'dogyeon')).toBe(16)
    // 1차에 없는 것은 1차에 새지 않는다
    expect(learn('strategist', 'bongchaek')).toBeUndefined()
    expect(learn('geomancer', 'dogyeon')).toBeUndefined()
  })

  it('독 데미지 비율은 data/statuses.ts 단일 출처를 쓴다', () => {
    expect(STATUSES.poison.poisonDamagePct).toBe(10)
  })
})

// ---------- 부여 ----------

describe('status 책략 — 부여', () => {
  it('한계명중률 80이 그대로 판정에 쓰인다 (시드로 양쪽 확인)', () => {
    const state = castBattle()
    const caster = unit(state, CASTER)
    const victim = unit(state, VICTIM)
    const cs = effectiveStats(caster)
    const vs = effectiveStats(victim)
    // 능력치 차가 커서 기본 명중은 100 — 실효 명중률은 cap(80) 그 자체다
    expect(strategyHitRate(cs.mind, cs.morale, vs.mind, vs.morale, 100)).toBe(100)
    expect(strategyHitRate(cs.mind, cs.morale, vs.mind, vs.morale, 80)).toBe(80)

    // rngState 20 → 첫 난수 75.26 (< 80) → 명중
    const hitState = { ...state, rngState: 20 }
    const hit = applyAction(hitState, {
      type: 'strategy',
      unitId: caster.id,
      strategyId: 'heobo',
      target: victim.pos,
    })
    expect(unit(hit, VICTIM).statuses).toEqual([{ id: 'confusion' }])

    // rngState 44 → 첫 난수 83.62 (≥ 80) → 빗나감 (기존 miss 로그 재사용)
    const missState = { ...state, rngState: 44 }
    const miss = applyAction(missState, {
      type: 'strategy',
      unitId: caster.id,
      strategyId: 'heobo',
      target: victim.pos,
    })
    expect(unit(miss, VICTIM).statuses).toEqual([])
    expect(logsOf(miss, 'miss').at(-1)!.message).toContain('허보')
    // 빗나가도 MP는 소모되고 행동은 끝난다 (기존 책략 관례)
    expect(unit(miss, CASTER).mp).toBe(caster.mp - STRATEGIES.heobo.mpCost)
    expect(unit(miss, CASTER).acted).toBe(true)
  })

  it('부여 성공 시 status 로그 + 경험치를 얹는다 (debuff와 1:1)', () => {
    const state = { ...castBattle(), rngState: 20 }
    const caster = unit(state, CASTER)
    const victim = unit(state, VICTIM)
    expect(caster.exp).toBe(0)

    const next = applyAction(state, {
      type: 'strategy',
      unitId: caster.id,
      strategyId: 'heobo',
      target: victim.pos,
    })
    const entry = logsOf(next, 'status').at(-1)!
    expect(entry.targetId).toBe(victim.id)
    expect(entry.message).toContain(statusName('confusion'))
    expect(unit(next, CASTER).exp).toBeGreaterThan(0)
    // 장비 경험치는 damage 전용 — 부여는 무구성장에 관여하지 않는다
    expect(logsOf(next, 'equipLevelUp')).toHaveLength(0)
  })

  it('이미 같은 상태면 no-op 로그만 남고 중복 부여·경험치가 없다', () => {
    const state = { ...castBattle(), rngState: 20 }
    const caster = unit(state, CASTER)
    const victim = unit(state, VICTIM)
    victim.statuses = [{ id: 'confusion' }]

    const next = applyAction(state, {
      type: 'strategy',
      unitId: caster.id,
      strategyId: 'heobo',
      target: victim.pos,
    })
    expect(unit(next, VICTIM).statuses).toEqual([{ id: 'confusion' }])
    expect(logsOf(next, 'status').at(-1)!.message).toContain('이미')
    expect(unit(next, CASTER).exp).toBe(0)
    // 낭비 캐스팅 자체는 막지 않는다 (리듀서 관례 — 방지는 UI/AI 몫)
    expect(unit(next, CASTER).mp).toBe(caster.mp - STRATEGIES.heobo.mpCost)
  })

  it('각 책략은 자기 상태만 부여한다', () => {
    const matrix: [string, StatusId][] = [
      ['heobo', 'confusion'],
      ['bongchaek', 'seal'],
      ['dogyeon', 'poison'],
      ['pobak', 'immobile'],
    ]
    for (const [strategyId, statusId] of matrix) {
      // 시전자에게 4종을 모두 쥐여주기 위해 시험용 병과를 쓴다
      CLASSES[DISRUPTER_CLASS].strategies = matrix.map(([id]) => ({ strategyId: id, learnLevel: 1 }))
      const state = {
        ...mkBattle([
          { officerId: DISRUPTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
          { officerId: VICTIM, faction: 'enemy', pos: { x: 2, y: 3 } },
        ]),
        rngState: 20,
      }
      const next = applyAction(state, {
        type: 'strategy',
        unitId: unit(state, DISRUPTER).id,
        strategyId,
        target: unit(state, VICTIM).pos,
      })
      expect(unit(next, VICTIM).statuses, strategyId).toEqual([{ id: statusId }])
    }
  })
})

// ---------- 행동 게이트 ----------

describe('상태이상 행동 게이트', () => {
  /** 아군 유닛에게 상태를 직접 걸어둔 아군 페이즈 전투 */
  const gated = (officerId: string, status: StatusId, stock?: ConsumableStack[]): BattleState => {
    const state = mkBattle(
      [
        { officerId, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: VICTIM, faction: 'enemy', pos: { x: 2, y: 3 } },
      ],
      undefined,
      stock,
    )
    unit(state, officerId).statuses = [{ id: status }]
    return state
  }

  it('부동 — 이동은 거부하지만 제자리 공격은 허용한다', () => {
    const state = gated(CASTER, 'immobile')
    const me = unit(state, CASTER)
    expect(applyAction(state, { type: 'move', unitId: me.id, to: { x: 3, y: 2 } })).toBe(state)

    const attacked = applyAction(state, {
      type: 'attack',
      unitId: me.id,
      targetId: unit(state, VICTIM).id,
    })
    expect(attacked).not.toBe(state)
    expect(unit(attacked, CASTER).acted).toBe(true)
  })

  it('금책 — 책략은 거부하지만 공격·도구는 허용한다', () => {
    const state = gated(CASTER, 'seal', [{ itemId: 'hoebokKong', count: 1 }])
    const me = unit(state, CASTER)
    me.hp = 10

    expect(
      applyAction(state, {
        type: 'strategy',
        unitId: me.id,
        strategyId: 'choyeol',
        target: unit(state, VICTIM).pos,
      }),
    ).toBe(state)

    expect(applyAction(state, { type: 'attack', unitId: me.id, targetId: unit(state, VICTIM).id })).not.toBe(
      state,
    )
    const healed = applyAction(state, {
      type: 'useItem',
      unitId: me.id,
      itemId: 'hoebokKong',
      target: me.pos,
    })
    expect(unit(healed, CASTER).hp).toBe(40)
  })

  it('혼란 — 이동·공격·책략·도구·대기 전부 거부한다', () => {
    const state = gated(CASTER, 'confusion', [{ itemId: 'gakseongYak', count: 1 }])
    const me = unit(state, CASTER)
    const foe = unit(state, VICTIM)
    for (const action of [
      { type: 'move', unitId: me.id, to: { x: 3, y: 2 } },
      { type: 'attack', unitId: me.id, targetId: foe.id },
      { type: 'strategy', unitId: me.id, strategyId: 'choyeol', target: foe.pos },
      { type: 'useItem', unitId: me.id, itemId: 'gakseongYak', target: me.pos },
      { type: 'wait', unitId: me.id },
    ] as const) {
      expect(applyAction(state, action), action.type).toBe(state)
    }
  })
})

// ---------- 페이즈 시작 턴 처리 ----------

describe('endPhase — 상태이상 턴 처리', () => {
  it('운 0은 절대 자연 해제되지 않고, 운 200은 전부 해제된다 (판정은 원시 luck ÷ 2)', () => {
    const state = mkBattle([
      { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
      { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 } },
      { officerId: LUCKY, faction: 'enemy', pos: { x: 9, y: 9 } },
    ])
    unit(state, VICTIM).statuses = [{ id: 'seal' }, { id: 'immobile' }]
    unit(state, LUCKY).statuses = [{ id: 'seal' }, { id: 'immobile' }]

    const next = applyAction(state, { type: 'endPhase' }) // → 적 페이즈
    expect(next.phase).toBe('enemy')
    expect(unit(next, VICTIM).statuses).toEqual([{ id: 'seal' }, { id: 'immobile' }])
    expect(unit(next, LUCKY).statuses).toEqual([])

    const cured = logsOf(next, 'statusCured')
    expect(cured).toHaveLength(2)
    expect(cured.every((l) => l.targetId === unit(next, LUCKY).id)).toBe(true)
    expect(cured.map((l) => l.message).join(' ')).toContain(statusName('seal'))
  })

  it('자연 해제 확률은 운÷2 — 운 40은 20% 임계값 양쪽에서 갈린다 (고정 시드)', () => {
    const build = (rngState: number): BattleState => {
      const state = mkBattle([
        { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: MID, faction: 'enemy', pos: { x: 9, y: 9 } },
      ])
      unit(state, MID).statuses = [{ id: 'seal' }]
      return { ...state, rngState }
    }
    // rngState 9 → 첫 난수 19.87 (< 20) → 해제
    expect(unit(applyAction(build(9), { type: 'endPhase' }), MID).statuses).toEqual([])
    // rngState 44 → 첫 난수 83.62 (≥ 20) → 유지
    expect(unit(applyAction(build(44), { type: 'endPhase' }), MID).statuses).toEqual([{ id: 'seal' }])
  })

  it('독은 최대 HP 10%를 dealDamage 경유로 깎는다 (격파 로그 + 증원 트리거 공유)', () => {
    const state = mkBattle([
      { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
      { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 } },
    ])
    const victim = unit(state, VICTIM)
    victim.statuses = [{ id: 'poison' }]
    const expected = Math.trunc((victim.maxHp * 10) / 100)

    const next = applyAction(state, { type: 'endPhase' })
    expect(unit(next, VICTIM).hp).toBe(victim.hp - expected)
    const entry = logsOf(next, 'poison').at(-1)!
    expect(entry.targetId).toBe(victim.id)
    expect(entry.amount).toBe(-expected) // 플로터 계약: 음수
  })

  it('독으로 보스가 죽으면 승리 판정까지 이어진다 (증원 트리거도 발동)', () => {
    const state = mkBattle(
      [
        { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 }, isBoss: true },
      ],
      { victory: [{ type: 'defeatBoss' }] },
    )
    const boss = unit(state, VICTIM)
    boss.statuses = [{ id: 'poison' }]
    boss.hp = 1
    // 격파 이벤트가 dealDamage에서 나온다는 증거 — 격파 트리거 증원을 달아둔다
    state.__stage!.reinforcements = [
      {
        trigger: { type: 'unitDefeated', unitId: boss.id },
        units: [{ officerId: VICTIM, faction: 'enemy', pos: { x: 5, y: 5 } }],
      },
    ]

    const next = applyAction(state, { type: 'endPhase' })
    expect(logsOf(next, 'defeat').some((l) => l.message.includes('괴멸'))).toBe(true)
    expect(next.spawnedReinforcements).toEqual([0])
    expect(next.result).toBe('victory')
  })

  it('독으로 주인공이 죽으면 패배 판정이 잡힌다', () => {
    const state = mkBattle([
      { officerId: VICTIM, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
      { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 } },
    ])
    const leader = state.units.find((u) => u.faction === 'player')!
    leader.statuses = [{ id: 'poison' }]
    leader.hp = 1

    const enemyPhase = applyAction(state, { type: 'endPhase' }) // 적 페이즈 — 아군은 아직 처리 전
    expect(enemyPhase.result).toBe('ongoing')
    expect(enemyPhase.units.find((u) => u.faction === 'player')!.hp).toBe(1)

    const playerPhase = applyAction(enemyPhase, { type: 'endPhase' }) // → 아군 페이즈에서 독사
    expect(playerPhase.turn).toBe(2)
    expect(playerPhase.result).toBe('defeat')
  })

  it('혼란은 페이즈 시작에 행동을 소진시키고(statusHold), 부동은 이동만 소진시킨다', () => {
    const state = mkBattle([
      { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
      { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 } },
      { officerId: VICTIM2, faction: 'enemy', pos: { x: 9, y: 9 } },
    ])
    unit(state, VICTIM).statuses = [{ id: 'confusion' }]
    unit(state, VICTIM2).statuses = [{ id: 'immobile' }]

    const next = applyAction(state, { type: 'endPhase' })
    const confused = unit(next, VICTIM)
    expect(confused.acted).toBe(true)
    expect(confused.moved).toBe(true)
    const hold = logsOf(next, 'statusHold').at(-1)!
    expect(hold.targetId).toBe(confused.id)
    expect(hold.message).toContain('혼란')

    // 부동은 이동만 봉쇄 — 제자리 공격·책략이 남아 있어야 한다
    const immobile = unit(next, VICTIM2)
    expect(immobile.moved).toBe(true)
    expect(immobile.acted).toBe(false)
  })

  it('독사한 유닛은 지형 회복으로 되살아나지 않는다 (처리 순서 보호)', () => {
    const tiles: TerrainId[][] = Array.from({ length: 12 }, () =>
      Array.from({ length: 12 }, () => 'plain' as TerrainId),
    )
    tiles[8][8] = 'fort' // 매턴 회복 지형
    const state = mkBattle(
      [
        { officerId: CASTER, faction: 'player', pos: { x: 2, y: 2 }, isLeader: true },
        { officerId: VICTIM, faction: 'enemy', pos: { x: 8, y: 8 } },
        { officerId: MID, faction: 'enemy', pos: { x: 9, y: 9 } },
      ],
      { map: { width: 12, height: 12, tiles } },
    )
    const victim = unit(state, VICTIM)
    victim.statuses = [{ id: 'poison' }]
    victim.hp = 1

    const next = applyAction(state, { type: 'endPhase' })
    expect(unit(next, VICTIM).hp).toBe(0)
    expect(logsOf(next, 'terrainHeal')).toHaveLength(0)
  })
})

// ---------- AI 채점 ----------

describe('AI — 방해 책략 채점', () => {
  /** 시험용 방해술사에게 주어진 책략만 쥐여주고, guard로 제자리 판단만 시킨다 */
  const aiBattle = (strategyIds: string[], targetOfficer: string): BattleState => {
    CLASSES[DISRUPTER_CLASS].strategies = strategyIds.map((strategyId) => ({ strategyId, learnLevel: 1 }))
    const state = mkBattle([
      { officerId: targetOfficer, faction: 'player', pos: { x: 5, y: 8 }, isLeader: true },
      { officerId: DISRUPTER, faction: 'enemy', pos: { x: 5, y: 5 }, behavior: 'guard' }, // 거리 3 = 책략만 닿는다
    ])
    return applyAction(state, { type: 'endPhase' }) // 적 페이즈로
  }

  it('금책은 책략을 쓰는 상대에게만 건다', () => {
    const onMage = actOf(aiBattle(['bongchaek'], TARGET_MAGE))
    expect(onMage.type).toBe('strategy')
    if (onMage.type === 'strategy') expect(onMage.strategyId).toBe('bongchaek')
  })

  it('부동은 근접 병과에게만 건다 (원거리는 제자리에서 계속 쏜다)', () => {
    const onFoot = actOf(aiBattle(['pobak'], TARGET_FOOT))
    expect(onFoot.type).toBe('strategy')
    const onBow = actOf(aiBattle(['pobak'], TARGET_BOW))
    expect(onBow.type).toBe('wait')
  })

  it('여러 방해를 알면 가치가 가장 높은 혼란(허보)을 고른다', () => {
    const act = actOf(aiBattle(['heobo', 'bongchaek', 'dogyeon', 'pobak'], TARGET_MAGE))
    expect(act.type).toBe('strategy')
    if (act.type === 'strategy') expect(act.strategyId).toBe('heobo')
  })

  it('이미 그 상태인 상대에게는 재시전하지 않는다', () => {
    const state = aiBattle(['heobo'], TARGET_MAGE)
    state.units.find((u) => u.officerId === TARGET_MAGE)!.statuses = [{ id: 'confusion' }]
    expect(actOf(state).type).toBe('wait')
  })

  it('금책에 걸린 AI는 책략 후보를 아예 만들지 않는다', () => {
    const state = aiBattle(['heobo'], TARGET_MAGE)
    state.units.find((u) => u.officerId === DISRUPTER)!.statuses = [{ id: 'seal' }]
    expect(actOf(state).type).toBe('wait')
  })
})
