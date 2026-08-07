// 캠페인 순수 함수 + 세이브 검증 테스트. (IndexedDB는 노드 환경에 없으므로 저장 I/O는 대상 외)

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { startBattle } from './battle'
import type { RosterEntry } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  currentNode,
  growthSummary,
  isCampaignFinished,
  newCampaign,
  PLAYER_OFFICER_IDS,
  stageForNode,
} from './campaign'
import { maxHp } from './formulas'
import type { BattleState, StageDef, TerrainId, UnitState } from './types'

function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'plain' as TerrainId))
  return {
    id: 'stage01',
    name: '테스트 전투',
    map: { width: 8, height: 8, tiles },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      { officerId: 'xiahoudun', faction: 'player', pos: { x: 2, y: 1 }, level: 7 },
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 1 } },
    ],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const unit = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

describe('newCampaign', () => {
  it('아군 6명이 장수 기본 레벨 / 경험치 0으로 편성된다', () => {
    const campaign = newCampaign()
    expect(campaign.version).toBe(1)
    expect(campaign.roster.map((r) => r.officerId)).toEqual(PLAYER_OFFICER_IDS)
    for (const entry of campaign.roster) {
      expect(entry.level).toBe(OFFICERS[entry.officerId].level)
      expect(entry.exp).toBe(0)
    }
    expect(campaign.clearedStages).toEqual([])
    expect(campaign.nodeId).toBe(CAMPAIGN_NODES[0].id)
  })
})

describe('캠페인 노드', () => {
  it('첫 노드부터 next를 따라가면 모든 노드를 지나 null로 끝난다', () => {
    const visited: string[] = []
    let node = currentNode(newCampaign())
    while (node) {
      visited.push(node.stageId)
      node = node.next ? (CAMPAIGN_NODES.find((n) => n.id === node!.next) ?? null) : null
    }
    expect(visited).toEqual(['stage01', 'stage02'])
  })

  it('stageForNode가 실제 스테이지 데이터를 돌려준다', () => {
    for (const node of CAMPAIGN_NODES) {
      expect(stageForNode(node)).toBe(STAGES.find((s) => s.id === node.stageId))
    }
  })

  it('알 수 없는 노드/스테이지는 각각 null·예외', () => {
    expect(currentNode({ ...newCampaign(), nodeId: 'nope' })).toBeNull()
    expect(() => stageForNode({ id: 'x', type: 'battle', stageId: 'nope', next: null })).toThrow()
  })
})

describe('startBattle(roster)', () => {
  it('로스터가 스테이지/장수 기본 레벨을 덮어쓰고 HP도 그 레벨로 계산된다', () => {
    const roster: RosterEntry[] = [
      { officerId: 'caocao', level: 12, exp: 40 },
      { officerId: 'xiahoudun', level: 9, exp: 5 },
    ]
    const state = startBattle(mkStage(), 1, roster)
    const caocao = unit(state, 'caocao')
    expect(caocao.level).toBe(12) // 장수 기본 3 → 로스터 12
    expect(caocao.exp).toBe(40)
    expect(caocao.maxHp).toBe(maxHp(CLASSES[caocao.classId], 12))
    expect(caocao.hp).toBe(caocao.maxHp)
    // 스테이지에 level: 7이 명시돼 있어도 로스터가 이긴다
    expect(unit(state, 'xiahoudun').level).toBe(9)
  })

  it('로스터에 없거나 적군이면 기존 규칙(스테이지 level → 장수 기본)을 유지한다', () => {
    const state = startBattle(mkStage(), 1, [{ officerId: 'yellowInfantry', level: 40, exp: 0 }])
    expect(unit(state, 'caocao').level).toBe(OFFICERS.caocao.level)
    expect(unit(state, 'xiahoudun').level).toBe(7)
    expect(unit(state, 'yellowInfantry').level).toBe(OFFICERS.yellowInfantry.level)
  })

  it('로스터 없이 호출하면 기존 동작과 동일하다', () => {
    const state = startBattle(mkStage(), 1)
    expect(unit(state, 'caocao').level).toBe(OFFICERS.caocao.level)
    expect(unit(state, 'caocao').exp).toBe(0)
  })
})

describe('applyVictory', () => {
  const setup = () => {
    const campaign = newCampaign()
    const state = startBattle(mkStage(), 1, campaign.roster)
    return { campaign, state }
  }

  it('전투 중 성장이 로스터로 회수되고 노드가 진행된다', () => {
    const { campaign, state } = setup()
    const caocao = unit(state, 'caocao')
    caocao.level += 2
    caocao.exp = 37

    const next = applyVictory(campaign, state)
    const entry = next.roster.find((r) => r.officerId === 'caocao')!
    expect(entry.level).toBe(OFFICERS.caocao.level + 2)
    expect(entry.exp).toBe(37)
    expect(next.nodeId).toBe('n02')
    expect(next.clearedStages).toEqual(['stage01'])
  })

  it('퇴각(hp=0)한 부대도 경험치/레벨이 유지된다', () => {
    const { campaign, state } = setup()
    const dun = unit(state, 'xiahoudun')
    dun.level += 1
    dun.exp = 88
    dun.hp = 0

    const entry = applyVictory(campaign, state).roster.find((r) => r.officerId === 'xiahoudun')!
    expect(entry.level).toBe(OFFICERS.xiahoudun.level + 1)
    expect(entry.exp).toBe(88)
  })

  it('출진하지 않은 장수는 그대로 남는다', () => {
    const { campaign, state } = setup()
    const before = campaign.roster.find((r) => r.officerId === 'xunyu')!
    const after = applyVictory(campaign, state).roster.find((r) => r.officerId === 'xunyu')!
    expect(after).toEqual(before)
    expect(after).not.toBe(before)
  })

  it('입력 캠페인을 변형하지 않는다', () => {
    const { campaign, state } = setup()
    unit(state, 'caocao').level += 3
    const snapshot = JSON.stringify(campaign)
    applyVictory(campaign, state)
    expect(JSON.stringify(campaign)).toBe(snapshot)
  })

  it('클리어한 스테이지는 중복 추가되지 않는다', () => {
    const { campaign, state } = setup()
    const once = applyVictory(campaign, state)
    const twice = applyVictory({ ...once, nodeId: campaign.nodeId }, state)
    expect(twice.clearedStages).toEqual(['stage01'])
  })

  it('마지막 노드를 클리어하면 nodeId는 그대로 두고 완주 판정이 켜진다', () => {
    const campaign = newCampaign()
    expect(isCampaignFinished(campaign)).toBe(false)

    const first = applyVictory(campaign, startBattle(mkStage(), 1, campaign.roster))
    expect(isCampaignFinished(first)).toBe(false)

    const lastStage = mkStage({ id: 'stage02' })
    const second = applyVictory(first, startBattle(lastStage, 1, first.roster))
    expect(second.nodeId).toBe('n02')
    expect(second.clearedStages).toEqual(['stage01', 'stage02'])
    expect(isCampaignFinished(second)).toBe(true)
  })
})

describe('growthSummary', () => {
  it('레벨업한 부대를 위로 정렬하고 before/after를 짝지운다', () => {
    const before: RosterEntry[] = [
      { officerId: 'caocao', level: 3, exp: 10 },
      { officerId: 'xiahoudun', level: 2, exp: 0 },
      { officerId: 'dianwei', level: 2, exp: 50 },
    ]
    const after: RosterEntry[] = [
      { officerId: 'caocao', level: 3, exp: 60 }, // 경험치만
      { officerId: 'xiahoudun', level: 3, exp: 20 }, // 레벨업
      { officerId: 'dianwei', level: 4, exp: 0 }, // 레벨업 2회
    ]
    const rows = growthSummary(before, after)
    expect(rows.map((r) => r.officerId)).toEqual(['xiahoudun', 'dianwei', 'caocao'])
    expect(rows[2]).toEqual({
      officerId: 'caocao',
      levelBefore: 3,
      levelAfter: 3,
      expBefore: 10,
      expAfter: 60,
    })
  })

  it('before에 없던 장수는 성장 없음으로 취급한다', () => {
    const rows = growthSummary([], [{ officerId: 'guojia', level: 5, exp: 30 }])
    expect(rows).toEqual([{ officerId: 'guojia', levelBefore: 5, levelAfter: 5, expBefore: 30, expAfter: 30 }])
  })
})

describe('validateCampaign', () => {
  it('newCampaign의 JSON 라운드트립을 통과시킨다', () => {
    const campaign = newCampaign()
    const restored = validateCampaign(JSON.parse(JSON.stringify(campaign)))
    expect(restored).toEqual(campaign)
  })

  it('버전/구조가 어긋나면 null', () => {
    const base = newCampaign()
    expect(validateCampaign(null)).toBeNull()
    expect(validateCampaign(undefined)).toBeNull()
    expect(validateCampaign('{}')).toBeNull()
    expect(validateCampaign({ ...base, version: 2 })).toBeNull()
    expect(validateCampaign({ ...base, nodeId: 1 })).toBeNull()
    expect(validateCampaign({ ...base, roster: 'nope' })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 3 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 'x', exp: 0 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [null] })).toBeNull()
    expect(validateCampaign({ ...base, clearedStages: [1] })).toBeNull()
  })
})
