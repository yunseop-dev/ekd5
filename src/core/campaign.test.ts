// 캠페인 순수 함수 + 세이브 검증 테스트. (IndexedDB는 노드 환경에 없으므로 저장 I/O는 대상 외)

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { STORY_SCRIPTS } from '../data/story'
import { livingUnits, startBattle } from './battle'
import type { CampaignNode, GrowthSnapshot, RosterEntry } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  clampGauge,
  completeChoice,
  completeStory,
  currentNode,
  GAUGE_INITIAL,
  GAUGE_MAX,
  GAUGE_MIN,
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
    expect(campaign.version).toBe(5)
    expect(campaign.roster.map((r) => r.officerId)).toEqual(PLAYER_OFFICER_IDS)
    for (const entry of campaign.roster) {
      expect(entry.level).toBe(OFFICERS[entry.officerId].level)
      expect(entry.exp).toBe(0)
    }
    expect(campaign.clearedStages).toEqual([])
    expect(campaign.nodeId).toBe(CAMPAIGN_NODES[0].id)
  })

  it('v3: 초기 군자금 / 빈 창고·열매 / 장수별 초기 장비(원작: 조조 = 의천검)로 시작한다', () => {
    const campaign = newCampaign()
    expect(campaign.gold).toBe(INITIAL_GOLD)
    expect(campaign.inventory).toEqual([])
    expect(campaign.fruits).toEqual([])
    for (const entry of campaign.roster) {
      // 정의는 슬롯 → itemId 문자열, 로스터는 Lv1 인스턴스
      const expected = Object.entries(OFFICERS[entry.officerId].initialEquipment ?? {}).map(([slot, itemId]) => [
        slot,
        { itemId, level: 1, exp: 0 },
      ])
      expect(entry.equipment, entry.officerId).toEqual(Object.fromEntries(expected))
      expect(entry.statBonus, entry.officerId).toEqual({})
    }
    expect(campaign.roster.find((r) => r.officerId === 'caocao')!.equipment.weapon).toEqual({
      itemId: 'yitianSword',
      level: 1,
      exp: 0,
    })
  })
})

describe('캠페인 노드', () => {
  /** 첫 노드부터 next를 따라간다. choice 노드에서는 optionIndex번 갈래를 탄다 */
  const walk = (optionIndex: number): string[] => {
    const visited: string[] = []
    let node: CampaignNode | null = currentNode(newCampaign())
    while (node) {
      visited.push(node.id)
      const nextId: string | null =
        node.type === 'choice' ? node.options[optionIndex].next : node.type === 'end' ? null : node.next
      node = nextId ? (CAMPAIGN_NODES.find((n) => n.id === nextId) ?? null) : null
    }
    return visited
  }

  it('추격 갈래로 따라가면 동탁 추격전을 거쳐 종막에 닿는다', () => {
    expect(walk(0)).toEqual([
      's00', 'n01', 's01', 'n02', 's02', 'n03',
      's10', 'n11', 's11', 'n12', 'c01', 'n13', 's13', 'fin',
    ])
  })

  it('회군 갈래로 따라가면 전투 노드(n13)를 건너뛰고 종막에 닿는다', () => {
    const visited = walk(1)
    expect(visited).toEqual([
      's00', 'n01', 's01', 'n02', 's02', 'n03',
      's10', 'n11', 's11', 'n12', 'c01', 's12', 's13', 'fin',
    ])
    expect(visited).not.toContain('n13')
  })

  it('두 갈래를 합치면 모든 노드가 정확히 한 번씩 등장한다 (고아 노드 없음)', () => {
    const all = new Set([...walk(0), ...walk(1)])
    expect([...all].sort()).toEqual(CAMPAIGN_NODES.map((n) => n.id).sort())
  })

  it('battle 노드는 stage01→06, story 노드는 스크립트를 가리킨다', () => {
    const battles = CAMPAIGN_NODES.filter((n) => n.type === 'battle')
    expect(battles.map((n) => n.stageId)).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06',
    ])
    const stories = CAMPAIGN_NODES.filter((n) => n.type === 'story')
    expect(stories.map((n) => n.scriptId)).toEqual([
      'intro', 'afterStage01', 'afterStage02', 'coalition', 'toHulao', 'retreat', 'chapterEnd',
    ])
    for (const node of stories) expect(node.title.length).toBeGreaterThan(0)
  })

  it('모든 next/선택지 목적지가 실제 노드를 가리킨다', () => {
    const ids = new Set(CAMPAIGN_NODES.map((n) => n.id))
    for (const node of CAMPAIGN_NODES) {
      if (node.type === 'choice') {
        expect(node.options.length, node.id).toBeGreaterThanOrEqual(2)
        for (const option of node.options) {
          expect(ids.has(option.next), `${node.id} → ${option.next}`).toBe(true)
          expect(option.text.length, node.id).toBeGreaterThan(0)
        }
        expect(node.prompt.length, node.id).toBeGreaterThan(0)
      } else if (node.type !== 'end' && node.next !== null) {
        expect(ids.has(node.next), `${node.id} → ${node.next}`).toBe(true)
      }
    }
    // 종막은 정확히 하나
    expect(CAMPAIGN_NODES.filter((n) => n.type === 'end').map((n) => n.id)).toEqual(['fin'])
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
      { officerId: 'caocao', level: 12, exp: 40, equipment: {}, statBonus: {} },
      { officerId: 'xiahoudun', level: 9, exp: 5, equipment: {}, statBonus: {} },
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
    const state = startBattle(mkStage(), 1, [{ officerId: 'yellowInfantry', level: 40, exp: 0, equipment: {}, statBonus: {} }])
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
      { officerId: 'caocao', level: 9, exp: 12, equipment: {}, statBonus: {} },
      { officerId: 'dianwei', level: 4, exp: 3, equipment: {}, statBonus: {} },
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

  /**
   * 캠페인 전체를 자동 완주시킨다 — battle 노드는 즉시 승리, story는 소화,
   * choice는 optionIndex번 갈래. end 노드에 닿으면 멈춘다.
   */
  const playThrough = (optionIndex: number) => {
    let campaign = newCampaign()
    for (let guard = 0; guard < 50 && !isCampaignFinished(campaign); guard++) {
      const node = currentNode(campaign)!
      if (node.type === 'battle') {
        campaign = applyVictory(campaign, startBattle(mkStage({ id: node.stageId }), 1, campaign.roster))
      } else if (node.type === 'story') {
        campaign = completeStory(campaign)
      } else if (node.type === 'choice') {
        campaign = completeChoice(campaign, optionIndex)
      }
    }
    return campaign
  }

  it('추격 갈래를 끝까지 진행하면 6전투를 모두 클리어하고 종막에 닿는다', () => {
    const campaign = playThrough(0)
    expect(campaign.nodeId).toBe('fin')
    expect(isCampaignFinished(campaign)).toBe(true)
    expect(campaign.clearedStages).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06',
    ])
    expect(campaign.gauge).toBe(GAUGE_INITIAL + 10) // 추격 = 사실 +10
  })

  it('회군 갈래를 끝까지 진행하면 stage06을 건너뛴 채 종막에 닿는다', () => {
    const campaign = playThrough(1)
    expect(campaign.nodeId).toBe('fin')
    expect(isCampaignFinished(campaign)).toBe(true)
    expect(campaign.clearedStages).toEqual(['stage01', 'stage02', 'stage03', 'stage04', 'stage05'])
    expect(campaign.gauge).toBe(GAUGE_INITIAL - 10) // 회군 = 가상 -10
  })

  it('보상금은 노드에 박힌 값의 합이다 (추격 갈래)', () => {
    // 추격 갈래는 전투 노드를 하나도 건너뛰지 않는다
    const rewards = CAMPAIGN_NODES.filter((n) => n.type === 'battle').reduce((sum, n) => sum + n.rewardGold, 0)
    expect(playThrough(0).gold).toBe(INITIAL_GOLD + rewards)
  })
})

describe('completeChoice', () => {
  /** 선택지 노드(c01) 앞에 선 캠페인 */
  const atChoice = (gauge = GAUGE_INITIAL) => ({ ...newCampaign(), nodeId: 'c01', gauge })

  it('첫 번째 갈래(추격)는 n13으로 가며 게이지가 사실 쪽으로 +10', () => {
    const next = completeChoice(atChoice(), 0)
    expect(next.nodeId).toBe('n13')
    expect(currentNode(next)!.type).toBe('battle')
    expect(next.gauge).toBe(GAUGE_INITIAL + 10)
  })

  it('두 번째 갈래(회군)는 전투를 건너뛰고 s12로 가며 게이지가 가상 쪽으로 -10', () => {
    const next = completeChoice(atChoice(), 1)
    expect(next.nodeId).toBe('s12')
    expect(currentNode(next)!.type).toBe('story')
    expect(next.gauge).toBe(GAUGE_INITIAL - 10)
  })

  it('게이지는 0~100으로 잘린다', () => {
    expect(completeChoice(atChoice(GAUGE_MAX - 2), 0).gauge).toBe(GAUGE_MAX)
    expect(completeChoice(atChoice(GAUGE_MIN + 3), 1).gauge).toBe(GAUGE_MIN)
    expect(clampGauge(-40)).toBe(GAUGE_MIN)
    expect(clampGauge(140)).toBe(GAUGE_MAX)
    expect(clampGauge(50.9)).toBe(50)
    expect(clampGauge(Number.NaN)).toBe(GAUGE_INITIAL)
  })

  it('choice가 아닌 노드 / 범위 밖 인덱스면 원본을 그대로 반환한다 (no-op)', () => {
    const story = newCampaign() // s00 = story
    expect(completeChoice(story, 0)).toBe(story)
    const choice = atChoice()
    expect(completeChoice(choice, 2)).toBe(choice)
    expect(completeChoice(choice, -1)).toBe(choice)
    expect(completeChoice(choice, 0.5)).toBe(choice)
    const broken = { ...newCampaign(), nodeId: 'nope' }
    expect(completeChoice(broken, 0)).toBe(broken)
  })

  it('원본을 변형하지 않고 로스터/창고를 복사해 넘긴다', () => {
    const campaign = atChoice()
    const snapshot = JSON.stringify(campaign)
    const next = completeChoice(campaign, 0)
    expect(JSON.stringify(campaign)).toBe(snapshot)
    expect(next.roster).toEqual(campaign.roster)
    expect(next.roster).not.toBe(campaign.roster)
    expect(next.roster[0]).not.toBe(campaign.roster[0])
    expect(next.inventory).not.toBe(campaign.inventory)
  })

  it('completeStory는 종막(end) 노드로도 전진한다', () => {
    const atFinalStory = { ...newCampaign(), nodeId: 's13' }
    const done = completeStory(atFinalStory)
    expect(done.nodeId).toBe('fin')
    expect(isCampaignFinished(done)).toBe(true)
    // 종막에서는 더 이상 전진하지 않는다
    expect(completeStory(done)).toBe(done)
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
    expect(validateCampaign({ ...base, version: 6 })).toBeNull()
    expect(validateCampaign({ ...base, nodeId: 1 })).toBeNull()
    expect(validateCampaign({ ...base, roster: 'nope' })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 3 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 'x', exp: 0 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [null] })).toBeNull()
    expect(validateCampaign({ ...base, clearedStages: [1] })).toBeNull()
  })

  it('v3 세이브는 게이지 중립(50)으로 v5에 승계된다', () => {
    const { gauge: _drop, ...v3 } = newCampaign()
    const restored = validateCampaign({ ...v3, version: 3 })!
    expect(restored.version).toBe(5)
    expect(restored.gauge).toBe(GAUGE_INITIAL)
    // 나머지 필드는 손대지 않는다
    expect(restored.roster).toEqual(newCampaign().roster)
    expect(restored.gold).toBe(INITIAL_GOLD)
  })

  it('v1/v2 세이브도 게이지 중립으로 승계된다', () => {
    const base = newCampaign()
    const v1 = validateCampaign({ version: 1, nodeId: 'n01', roster: [{ officerId: 'caocao', level: 5, exp: 0 }], clearedStages: [] })!
    expect(v1.version).toBe(5)
    expect(v1.gauge).toBe(GAUGE_INITIAL)
    const v2 = validateCampaign({ ...base, version: 2, fruits: undefined, gauge: undefined })!
    expect(v2.version).toBe(5)
    expect(v2.gauge).toBe(GAUGE_INITIAL)
  })

  it('게이지는 0~100 정수로 잘리고, 숫자가 아니면 중립으로 되돌린다', () => {
    const base = newCampaign()
    expect(validateCampaign({ ...base, gauge: 250 })!.gauge).toBe(GAUGE_MAX)
    expect(validateCampaign({ ...base, gauge: -5 })!.gauge).toBe(GAUGE_MIN)
    expect(validateCampaign({ ...base, gauge: 77.9 })!.gauge).toBe(77)
    expect(validateCampaign({ ...base, gauge: 'high' })!.gauge).toBe(GAUGE_INITIAL)
    expect(validateCampaign({ ...base, gauge: Number.NaN })!.gauge).toBe(GAUGE_INITIAL)
  })
})
