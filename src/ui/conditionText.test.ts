// v1.2 상단 정보 스트립 — 승리/패배 조건 문구 (원작 어투 재현).
// 근거: 원작 스크린샷 판독 — 「승리조건: 적을 전멸시킨다.」 / 「패배조건: 1. 조조의 사망 2. 20턴을 넘긴다.」
//
// conditionText는 순수 함수라 DOM 없이 테스트한다. 이름·조사는 데이터(OFFICERS)와
// josa 헬퍼에서 나오므로, 하드코딩한 문장이 아니라 **조립 규칙**을 검증한다.

import { describe, expect, it } from 'vitest'
import { startBattle } from '../core/battle'
import type { BattleState, StageDef, TerrainId, VictoryCondition } from '../core/types'
import { defeatText, leaderNameOf, turnLimitOf, victoryText } from './conditionText'

/** 10×10 평지 + 조조(주인공) / 황건적병(적) — battlefield.test.ts 의 mkStage 패턴 */
function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => 'plain' as TerrainId),
  )
  return {
    id: 'condition-text-test',
    name: '문구 테스트',
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

const mkBattle = (over: Partial<StageDef> = {}): BattleState => startBattle(mkStage(over), 1)

/** 보스 1명(화웅) / 보스 2명(화웅·여포) 스테이지 */
const bossStage = (bosses: string[]): BattleState =>
  mkBattle({
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      ...bosses.map((id, i) => ({
        officerId: id,
        faction: 'enemy' as const,
        pos: { x: 7 + i, y: 8 },
        isBoss: true,
      })),
    ],
    victory: [{ type: 'defeatBoss' }],
  })

describe('victoryText — 조건 4종', () => {
  it('annihilation — 적을 전멸시킨다.', () => {
    const state = mkBattle()
    expect(victoryText([{ type: 'annihilation' }], state)).toBe('적을 전멸시킨다.')
  })

  it('defeatBoss — 보스 1명이면 이름 + 을(를) 퇴각시킨다.', () => {
    const state = bossStage(['huaXiong'])
    // 화웅 = 받침 있음 → 「을」
    expect(victoryText([{ type: 'defeatBoss' }], state)).toBe('화웅을 퇴각시킨다.')
  })

  it('defeatBoss — 보스가 여럿이면 「~ 등 N명」으로 묶는다', () => {
    const state = bossStage(['huaXiong', 'lüBu'])
    expect(victoryText([{ type: 'defeatBoss' }], state)).toBe('화웅 등 2명을 퇴각시킨다.')
  })

  it('defeatBoss — 보스 데이터가 없어도 문장은 성립한다 (적장 폴백)', () => {
    const state = mkBattle()
    expect(victoryText([{ type: 'defeatBoss' }], state)).toBe('적장을 퇴각시킨다.')
  })

  it('defeatBoss — 이미 격파된 보스도 문구에 남는다 (조건은 전투 내내 같다)', () => {
    const state = bossStage(['huaXiong'])
    state.units.find((u) => u.officerId === 'huaXiong')!.hp = 0
    expect(victoryText([{ type: 'defeatBoss' }], state)).toBe('화웅을 퇴각시킨다.')
  })

  it('reachPoint — unitId 생략은 주인공이 대상이다 (조사 「가」)', () => {
    const state = mkBattle()
    expect(victoryText([{ type: 'reachPoint', pos: { x: 9, y: 0 } }], state)).toBe(
      '조조가 지정 지점에 도달한다.',
    )
  })

  it('reachPoint — unitId(장수 id)로 지정한 유닛 이름을 쓴다 (조사 「이」)', () => {
    const state = mkBattle({
      units: [
        { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
        { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 8 } },
      ],
    })
    expect(
      victoryText([{ type: 'reachPoint', pos: { x: 9, y: 0 }, unitId: 'dianwei' }], state),
    ).toBe('전위가 지정 지점에 도달한다.')
  })

  it('reachPoint — 전장에 없는 id는 OFFICERS 이름으로, 그것도 없으면 id를 그대로 쓴다', () => {
    const state = mkBattle()
    expect(victoryText([{ type: 'reachPoint', pos: { x: 0, y: 0 }, unitId: 'xianDi' }], state)).toBe(
      '헌제가 지정 지점에 도달한다.',
    )
    expect(victoryText([{ type: 'reachPoint', pos: { x: 0, y: 0 }, unitId: 'ghost' }], state)).toBe(
      'ghost가 지정 지점에 도달한다.',
    )
  })

  it('surviveTurns — {n}턴까지 버틴다.', () => {
    const state = mkBattle()
    expect(victoryText([{ type: 'surviveTurns', turns: 10 }], state)).toBe('10턴까지 버틴다.')
  })

  it('조건이 없으면 「없음」 — 스트립이 비어 보이지 않게 한다', () => {
    expect(victoryText([], mkBattle())).toBe('없음')
  })
})

describe('victoryText — 복수 조건은 「또는」으로 잇는다', () => {
  it('2개', () => {
    const state = bossStage(['huaXiong'])
    const victory: VictoryCondition[] = [{ type: 'defeatBoss' }, { type: 'surviveTurns', turns: 8 }]
    expect(victoryText(victory, state)).toBe('화웅을 퇴각시킨다. 또는 8턴까지 버틴다.')
  })

  it('3개 — 순서는 배열 순서를 그대로 따른다', () => {
    const state = mkBattle()
    const victory: VictoryCondition[] = [
      { type: 'annihilation' },
      { type: 'surviveTurns', turns: 5 },
      { type: 'reachPoint', pos: { x: 9, y: 9 } },
    ]
    expect(victoryText(victory, state)).toBe(
      '적을 전멸시킨다. 또는 5턴까지 버틴다. 또는 조조가 지정 지점에 도달한다.',
    )
  })
})

describe('defeatText — 항상 주인공 사망이 1번', () => {
  it('데이터 조건이 없어도 주인공 사망은 표시된다 (엔진 기본이라 배열에 없다)', () => {
    const state = mkBattle()
    expect(defeatText([], state, leaderNameOf(state))).toBe('1. 조조의 사망')
  })

  it('원작 표준 — 1. 조조의 사망 2. 20턴을 넘긴다.', () => {
    const state = mkBattle({ defeat: [{ type: 'turnLimit', turns: 20 }] })
    expect(defeatText([{ type: 'turnLimit', turns: 20 }], state, leaderNameOf(state))).toBe(
      '1. 조조의 사망 2. 20턴을 넘긴다.',
    )
  })

  it('unitDies — 호위 대상 사망이 번호로 붙는다 (헌제 호위)', () => {
    const state = mkBattle()
    const text = defeatText(
      [{ type: 'unitDies', officerId: 'xianDi' }, { type: 'turnLimit', turns: 12 }],
      state,
      leaderNameOf(state),
    )
    expect(text).toBe('1. 조조의 사망 2. 헌제의 사망 3. 12턴을 넘긴다.')
  })

  it('미등록 officerId는 id를 그대로 노출한다 (데이터 실수가 보이게)', () => {
    const state = mkBattle()
    expect(defeatText([{ type: 'unitDies', officerId: 'ghost' }], state, leaderNameOf(state))).toBe(
      '1. 조조의 사망 2. ghost의 사망',
    )
  })

  it('leaderName은 인수로 받는다 — 주인공이 바뀌면 문구도 바뀐다', () => {
    const state = mkBattle()
    expect(defeatText([], state, '유비')).toBe('1. 유비의 사망')
  })
})

describe('leaderNameOf', () => {
  it('아군 주인공의 장수 이름', () => {
    expect(leaderNameOf(mkBattle())).toBe('조조')
  })

  it('주인공이 없으면 「주인공」 폴백', () => {
    const state = mkBattle()
    for (const u of state.units) u.isLeader = false
    expect(leaderNameOf(state)).toBe('주인공')
  })
})

describe('turnLimitOf — 헤더 「턴 수 n/최대」의 최대값 추출', () => {
  it('turnLimit 조건이 있으면 그 턴 수', () => {
    expect(turnLimitOf([{ type: 'turnLimit', turns: 20 }])).toBe(20)
  })

  it('turnLimit이 없으면 null (「턴 수 n」만 표시한다)', () => {
    expect(turnLimitOf([])).toBeNull()
    expect(turnLimitOf([{ type: 'unitDies', officerId: 'xianDi' }])).toBeNull()
  })

  it('여러 개면 첫 turnLimit을 쓴다 (코어 판정도 배열 순서대로 본다)', () => {
    expect(
      turnLimitOf([
        { type: 'unitDies', officerId: 'xianDi' },
        { type: 'turnLimit', turns: 12 },
        { type: 'turnLimit', turns: 30 },
      ]),
    ).toBe(12)
  })
})
