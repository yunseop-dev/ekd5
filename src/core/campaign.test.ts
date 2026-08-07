// 캠페인 순수 함수 + 세이브 검증 테스트. (IndexedDB는 노드 환경에 없으므로 저장 I/O는 대상 외)

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { STORY_SCRIPTS } from '../data/story'
import { livingUnits, startBattle } from './battle'
import type { GrowthSnapshot, RosterEntry } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  completeStory,
  currentNode,
  growthSummary,
  INITIAL_GOLD,
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
    expect(campaign.version).toBe(2)
    expect(campaign.roster.map((r) => r.officerId)).toEqual(PLAYER_OFFICER_IDS)
    for (const entry of campaign.roster) {
      expect(entry.level).toBe(OFFICERS[entry.officerId].level)
      expect(entry.exp).toBe(0)
    }
    expect(campaign.clearedStages).toEqual([])
    expect(campaign.nodeId).toBe(CAMPAIGN_NODES[0].id)
  })

  it('v2: 초기 군자금 / 빈 창고 / 장수별 초기 장비(원작: 조조 = 의천검)로 시작한다', () => {
    const campaign = newCampaign()
    expect(campaign.gold).toBe(INITIAL_GOLD)
    expect(campaign.inventory).toEqual([])
    for (const entry of campaign.roster) {
      expect(entry.equipment, entry.officerId).toEqual(OFFICERS[entry.officerId].initialEquipment ?? {})
    }
    expect(campaign.roster.find((r) => r.officerId === 'caocao')!.equipment.weapon).toBe('yitianSword')
  })
})

describe('캠페인 노드', () => {
  it('첫 노드부터 next를 따라가면 모든 노드를 지나 null로 끝난다', () => {
    const visited: string[] = []
    let node = currentNode(newCampaign())
    while (node) {
      visited.push(node.id)
      node = node.next ? (CAMPAIGN_NODES.find((n) => n.id === node!.next) ?? null) : null
    }
    // story ↔ battle 교대 체인 (battle id n01/n02는 v0.3 세이브 호환용으로 유지)
    expect(visited).toEqual(['s00', 'n01', 's01', 'n02', 's02', 'n03'])
    expect(visited.length).toBe(CAMPAIGN_NODES.length)
  })

  it('battle 노드는 stage01→03, story 노드는 스크립트를 가리킨다', () => {
    const battles = CAMPAIGN_NODES.filter((n) => n.type === 'battle')
    expect(battles.map((n) => n.stageId)).toEqual(['stage01', 'stage02', 'stage03'])
    const stories = CAMPAIGN_NODES.filter((n) => n.type === 'story')
    expect(stories.map((n) => n.scriptId)).toEqual(['intro', 'afterStage01', 'afterStage02'])
    for (const node of stories) expect(node.title.length).toBeGreaterThan(0)
  })

  it('stageForNode가 실제 스테이지 데이터를 돌려준다', () => {
    for (const node of CAMPAIGN_NODES) {
      if (node.type !== 'battle') continue
      expect(stageForNode(node)).toBe(STAGES.find((s) => s.id === node.stageId))
    }
  })

  it('알 수 없는 노드/스테이지는 각각 null·예외, story 노드는 stageForNode 불가', () => {
    expect(currentNode({ ...newCampaign(), nodeId: 'nope' })).toBeNull()
    expect(() => stageForNode({ id: 'x', type: 'battle', stageId: 'nope', rewardGold: 0, next: null })).toThrow()
    expect(() => stageForNode({ id: 's00', type: 'story', title: 't', scriptId: 'intro', next: null })).toThrow()
  })
})

describe('completeStory', () => {
  it('story 노드에서 next로 전진한다', () => {
    const campaign = newCampaign()
    expect(currentNode(campaign)!.type).toBe('story')
    const next = completeStory(campaign)
    expect(next.nodeId).toBe('n01')
    expect(currentNode(next)!.type).toBe('battle')
  })

  it('battle 노드에서 호출하면 원본을 그대로 반환한다 (no-op)', () => {
    const atBattle = completeStory(newCampaign())
    expect(completeStory(atBattle)).toBe(atBattle)
  })

  it('알 수 없는 노드에서도 원본을 그대로 반환한다', () => {
    const broken = { ...newCampaign(), nodeId: 'nope' }
    expect(completeStory(broken)).toBe(broken)
  })

  it('원본을 변형하지 않고 로스터/클리어 목록을 복사해 넘긴다', () => {
    const campaign = { ...newCampaign(), clearedStages: ['stage00'] }
    const snapshot = JSON.stringify(campaign)
    const next = completeStory(campaign)
    expect(JSON.stringify(campaign)).toBe(snapshot)
    expect(next.roster).toEqual(campaign.roster)
    expect(next.roster).not.toBe(campaign.roster)
    expect(next.roster[0]).not.toBe(campaign.roster[0])
    expect(next.clearedStages).toEqual(['stage00'])
    expect(next.clearedStages).not.toBe(campaign.clearedStages)
  })

  it('story 노드를 소화하기 전에는 완주 판정이 켜지지 않는다', () => {
    expect(isCampaignFinished(newCampaign())).toBe(false)
  })
})

describe('스토리 스크립트', () => {
  it('story 노드의 scriptId마다 6~10줄 대사가 있다', () => {
    for (const node of CAMPAIGN_NODES) {
      if (node.type !== 'story') continue
      const lines = STORY_SCRIPTS[node.scriptId]
      expect(lines, `${node.id}: ${node.scriptId}`).toBeDefined()
      expect(lines.length, node.scriptId).toBeGreaterThanOrEqual(6)
      expect(lines.length, node.scriptId).toBeLessThanOrEqual(10)
    }
  })

  it('화자는 유효한 장수 id 또는 내레이션(null)이고 본문이 비지 않는다', () => {
    for (const [scriptId, lines] of Object.entries(STORY_SCRIPTS)) {
      for (const line of lines) {
        if (line.speaker !== null) {
          expect(OFFICERS[line.speaker], `${scriptId}: ${line.speaker}`).toBeDefined()
        }
        expect(line.text.length, scriptId).toBeGreaterThan(0)
      }
    }
  })
})

describe('startBattle(roster)', () => {
  it('로스터가 스테이지/장수 기본 레벨을 덮어쓰고 HP도 그 레벨로 계산된다', () => {
    const roster: RosterEntry[] = [
      { officerId: 'caocao', level: 12, exp: 40, equipment: {} },
      { officerId: 'xiahoudun', level: 9, exp: 5, equipment: {} },
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
    const state = startBattle(mkStage(), 1, [{ officerId: 'yellowInfantry', level: 40, exp: 0, equipment: {} }])
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

describe('startBattle(deployment)', () => {
  // 출진 슬롯 3칸 — 인덱스 = 선택 순서 = 배치 위치 (campaign-ux.md 1부 §2)
  const slotStage = (): StageDef =>
    mkStage({
      playerSlots: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
      deployMin: 2,
      deployMax: 3,
      forcedOfficers: ['caocao'],
    })

  it('출진 명단 순서가 슬롯 좌표 순서와 일치한다', () => {
    const state = startBattle(slotStage(), 1, undefined, ['caocao', 'guojia', 'dianwei'])
    expect(livingUnits(state, 'player').map((u) => u.officerId)).toEqual(['caocao', 'guojia', 'dianwei'])
    expect(unit(state, 'caocao').pos).toEqual({ x: 1, y: 5 })
    expect(unit(state, 'guojia').pos).toEqual({ x: 2, y: 5 })
    expect(unit(state, 'dianwei').pos).toEqual({ x: 3, y: 5 })
  })

  it('stage.units의 player 정의를 무시하고 로스터 레벨을 적용하며 조조가 주인공이 된다', () => {
    const roster: RosterEntry[] = [
      { officerId: 'caocao', level: 9, exp: 12, equipment: {} },
      { officerId: 'dianwei', level: 4, exp: 3, equipment: {} },
    ]
    const state = startBattle(slotStage(), 1, roster, ['caocao', 'dianwei'])
    // 스테이지에 level 7로 박혀 있던 하후돈은 출진하지 않았으므로 존재하지 않는다
    expect(state.units.some((u) => u.officerId === 'xiahoudun')).toBe(false)
    const caocao = unit(state, 'caocao')
    expect(caocao.level).toBe(9)
    expect(caocao.exp).toBe(12)
    expect(caocao.maxHp).toBe(maxHp(CLASSES[caocao.classId], 9))
    expect(caocao.isLeader).toBe(true)
    const dian = unit(state, 'dianwei')
    expect(dian.level).toBe(4)
    expect(dian.isLeader).toBeFalsy()
    // 적군은 언제나 stage.units에서 생성된다
    expect(unit(state, 'yellowInfantry').pos).toEqual({ x: 4, y: 1 })
  })

  it('로스터에 없는 장수는 장수 기본 레벨로 출진한다', () => {
    const state = startBattle(slotStage(), 1, [], ['caocao', 'xunyu'])
    expect(unit(state, 'xunyu').level).toBe(OFFICERS.xunyu.level)
    expect(unit(state, 'xunyu').exp).toBe(0)
  })

  it('슬롯보다 많이 고르면 초과분은 무시된다', () => {
    const state = startBattle(slotStage(), 1, undefined, ['caocao', 'guojia', 'dianwei', 'xunyu'])
    expect(livingUnits(state, 'player').length).toBe(3)
    expect(state.units.some((u) => u.officerId === 'xunyu')).toBe(false)
  })

  it('슬롯 테이블이 없는 스테이지는 명단을 무시하고 기존 배치를 유지한다 (하위호환)', () => {
    const state = startBattle(mkStage(), 1, undefined, ['guojia'])
    expect(unit(state, 'caocao').pos).toEqual({ x: 1, y: 1 })
    expect(state.units.some((u) => u.officerId === 'guojia')).toBe(false)
  })
})

describe('applyVictory', () => {
  const setup = () => {
    // 서장 story 노드(s00)를 소화해 첫 전투 노드(n01)에 선 상태
    const campaign = completeStory(newCampaign())
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
    expect(next.nodeId).toBe('s01') // 전투 뒤 후속 story 노드
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
    const stageIds = ['stage01', 'stage02', 'stage03']
    let campaign = completeStory(newCampaign()) // s00 → n01
    expect(isCampaignFinished(campaign)).toBe(false)

    for (const stageId of stageIds) {
      campaign = applyVictory(campaign, startBattle(mkStage({ id: stageId }), 1, campaign.roster))
      expect(isCampaignFinished(campaign), stageId).toBe(stageId === 'stage03')
      campaign = completeStory(campaign) // 후속 story 노드 소화 (마지막 전투 뒤에는 no-op)
    }

    expect(campaign.nodeId).toBe('n03')
    expect(campaign.clearedStages).toEqual(stageIds)
    expect(isCampaignFinished(campaign)).toBe(true)
  })
})

describe('growthSummary', () => {
  it('레벨업한 부대를 위로 정렬하고 before/after를 짝지운다', () => {
    const before: GrowthSnapshot[] = [
      { officerId: 'caocao', level: 3, exp: 10 },
      { officerId: 'xiahoudun', level: 2, exp: 0 },
      { officerId: 'dianwei', level: 2, exp: 50 },
    ]
    const after: GrowthSnapshot[] = [
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
    expect(validateCampaign({ ...base, version: 3 })).toBeNull()
    expect(validateCampaign({ ...base, nodeId: 1 })).toBeNull()
    expect(validateCampaign({ ...base, roster: 'nope' })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 3 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 'x', exp: 0 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [null] })).toBeNull()
    expect(validateCampaign({ ...base, clearedStages: [1] })).toBeNull()
  })
})
