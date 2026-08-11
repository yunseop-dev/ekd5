// 캠페인 순수 함수 + 세이브 검증 테스트. (IndexedDB는 노드 환경에 없으므로 저장 I/O는 대상 외)

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { shopConsumables } from '../data/consumables'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { STORY_SCRIPTS } from '../data/story'
import { livingUnits, startBattle } from './battle'
import type { CampaignNode, GrowthSnapshot, RosterEntry } from './campaign'
import {
  scriptIdFor,
  applyVictory,
  CAMPAIGN_NODES,
  chapterOf,
  clampGauge,
  classIdOf,
  completeChoice,
  completeStory,
  currentNode,
  GAUGE_INITIAL,
  GAUGE_MAX,
  GAUGE_MIN,
  growthSummary,
  INITIAL_GOLD,
  isCampaignFinished,
  joinOfficers,
  newCampaign,
  newRosterEntry,
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

/** 전위가 출진한 배치 — n31(완성 야습)의 leave ifDead 검증용 */
const withDianwei: StageDef['units'] = [
  { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
  { officerId: 'dianwei', faction: 'player', pos: { x: 2, y: 1 } },
  { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 1 } },
]

describe('newCampaign', () => {
  it('아군 6명이 장수 기본 레벨 / 경험치 0으로 편성된다', () => {
    const campaign = newCampaign()
    expect(campaign.version).toBe(6)
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

  it('첫 갈래(추격·토벌)로 따라가면 전투 노드를 하나도 건너뛰지 않고 종막에 닿는다', () => {
    expect(walk(0)).toEqual([
      's00', 'n01', 's01', 'n02', 's02', 'n03',
      's10', 'n11', 's11', 'n12', 'c01', 'n13', 's13',
      's20', 'n20', 's21', 'c02', 'n21', 's22', 'n22',
      // 제3부 「허도 천도」 — v1.2에서 n22와 s23 사이에 삽입한 10노드
      's30', 'n30', 's31', 'c30', 'n31', 's32', 's33', 'n32', 'c31', 'n33',
      's23', 'n23', 's24', 'n24', 's25', 'fin',
    ])
  })

  it('둘째 갈래(회군·화친)는 전투 노드 n13·n21을 건너뛰고 종막에 닿는다', () => {
    const visited = walk(1)
    expect(visited).toEqual([
      's00', 'n01', 's01', 'n02', 's02', 'n03',
      's10', 'n11', 's11', 'n12', 'c01', 's12', 's13',
      's20', 'n20', 's21', 'c02', 's22', 'n22',
      // c30·c31은 어느 갈래를 골라도 같은 전투로 합류한다 (원작도 완성 야습은 회피 불가)
      's30', 'n30', 's31', 'c30', 'n31', 's32', 's33', 'n32', 'c31', 'n33',
      's23', 'n23', 's24', 'n24', 's25', 'fin',
    ])
    expect(visited).not.toContain('n13')
    expect(visited).not.toContain('n21')
  })

  it('제3부 삽입 구간: n22 → s30 … n33 → s23으로 이어붙고 보상금 곡선이 단조 증가한다', () => {
    const node = (id: string) => CAMPAIGN_NODES.find((n) => n.id === id)!
    const n22 = node('n22')
    expect(n22.type === 'battle' && n22.next).toBe('s30')
    const n33 = node('n33')
    expect(n33.type === 'battle' && n33.next).toBe('s23')

    // c30 = 완성의 항복 (원작 비대칭 증감폭 +5 / -10). 두 갈래 모두 n31로 합류한다
    const c30 = node('c30')
    expect(c30.type).toBe('choice')
    if (c30.type === 'choice') {
      expect(c30.speaker).toBe('caoAnMin')
      expect(c30.options.map((o) => o.gaugeDelta)).toEqual([5, -10])
      expect(c30.options.map((o) => o.next)).toEqual(['n31', 'n31'])
    }
    // c31 = 가후의 서신 (최소 증감폭 ±2)
    const c31 = node('c31')
    expect(c31.type).toBe('choice')
    if (c31.type === 'choice') {
      expect(c31.speaker).toBe('caocao')
      expect(c31.options.map((o) => o.gaugeDelta)).toEqual([2, -2])
      expect(c31.options.map((o) => o.next)).toEqual(['n33', 'n33'])
    }

    // 신규 구간 합류·이탈
    const s30 = node('s30')
    expect(s30.type === 'story' && s30.join).toEqual(['xuChu'])
    const s31 = node('s31')
    expect(s31.type === 'story' && s31.join).toEqual(['xuHuang', 'manChong'])
    const n31 = node('n31')
    expect(n31.type === 'battle' && n31.leave).toEqual([{ officerId: 'dianwei', when: 'ifDead' }])
    const s32 = node('s32')
    expect(s32.type === 'story' && s32.variants).toEqual([
      { absentOfficerId: 'dianwei', scriptId: 'mourningDianwei' },
    ])
    // s23의 join은 구 세이브 안전망으로 남는다 (joinOfficers 멱등)
    const s23 = node('s23')
    expect(s23.type === 'story' && s23.join).toEqual(['xuChu'])

    // 2부 후반 보상금 상향 (신규 구간과의 곡선 정합)
    const golds = ['n30', 'n31', 'n32', 'n33', 'n23', 'n24'].map((id) => {
      const n = node(id)
      return n.type === 'battle' ? n.rewardGold : 0
    })
    expect(golds).toEqual([1500, 1600, 1700, 1750, 1900, 2200])
    expect([...golds].sort((a, b) => a - b)).toEqual(golds)
  })

  it('c02는 원작 c05의 「화친/토벌」 선택지 — 화친을 고르면 서주 전투를 건너뛴다', () => {
    const c02 = CAMPAIGN_NODES.find((n) => n.id === 'c02')!
    expect(c02.type).toBe('choice')
    if (c02.type !== 'choice') return
    // 원작에 서주 학살 선택지는 없다 (조조가 명시 부정) — 대신 화친 시 전투가 사라진다
    expect(c02.options.map((o) => o.next)).toEqual(['n21', 's22'])
    expect(c02.options.map((o) => o.gaugeDelta)).toEqual([5, -5])
    expect(c02.speaker).toBe('caocao')
  })

  it('chapterOf: s13까지는 1부, s20부터는 2부다 (인수 상점 해금 경계)', () => {
    for (const id of ['s00', 'n01', 'n12', 'c01', 'n13', 's12', 's13']) {
      expect(chapterOf(id), id).toBe(1)
    }
    for (const id of ['s20', 'n20', 'c02', 'n21', 's23', 'n24', 's25', 'fin']) {
      expect(chapterOf(id), id).toBe(2)
    }
    // 미등록 노드는 1부로 떨어진다 (findIndex -1 < start)
    expect(chapterOf('nope')).toBe(1)
  })

  it('두 갈래를 합치면 모든 노드가 정확히 한 번씩 등장한다 (고아 노드 없음)', () => {
    const all = new Set([...walk(0), ...walk(1)])
    expect([...all].sort()).toEqual(CAMPAIGN_NODES.map((n) => n.id).sort())
  })

  it('battle 노드는 stage01→15, story 노드는 스크립트를 가리킨다', () => {
    const battles = CAMPAIGN_NODES.filter((n) => n.type === 'battle')
    expect(battles.map((n) => n.stageId)).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06',
      'stage07', 'stage08', 'stage09',
      // 제3부 4전투는 그래프상 stage09 뒤 · stage10 앞에 놓인다
      'stage12', 'stage13', 'stage14', 'stage15',
      'stage10', 'stage11',
    ])
    expect(new Set(battles.map((n) => n.stageId)).size).toBe(15) // 15전투 전부 1회씩
    const stories = CAMPAIGN_NODES.filter((n) => n.type === 'story')
    expect(stories.map((n) => n.scriptId)).toEqual([
      'intro', 'afterStage01', 'afterStage02', 'coalition', 'toHulao', 'retreat', 'chapterEnd',
      'chapter2Intro', 'fatherDeath', 'puyangBetrayal',
      'emperorFlight', 'xuduCapital', 'afterWan', 'yuanShuEmperor',
      'xuzhouRescue', 'xiapiSiege', 'chapter2End',
    ])
    for (const node of stories) expect(node.title.length).toBeGreaterThan(0)
    // variants가 가리키는 대체 스크립트도 실재해야 한다 (노드 scriptId 목록에는 없다)
    for (const node of stories) {
      for (const variant of node.variants ?? []) {
        expect(STORY_SCRIPTS[variant.scriptId], variant.scriptId).toBeDefined()
        expect(OFFICERS[variant.absentOfficerId], variant.absentOfficerId).toBeDefined()
      }
    }
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

describe('인수 상점 진열 — 2부 해금 (chapterOf 연동)', () => {
  it('1부 노드에서는 진열되지 않고, 2부(s20~) 노드에서는 진열된다', () => {
    expect(shopConsumables({ nodeId: 's00' }).map((c) => c.id)).not.toContain('insu')
    expect(shopConsumables({ nodeId: 's13' }).map((c) => c.id)).not.toContain('insu')
    expect(shopConsumables({ nodeId: 's20' }).map((c) => c.id)).toContain('insu')
    expect(shopConsumables({ nodeId: 'n24' }).map((c) => c.id)).toContain('insu')
  })

  it('진열 목록은 가격 오름차순이고 비매품은 빠진다', () => {
    const listed = shopConsumables({ nodeId: 's20' })
    expect(listed.every((c) => c.price !== null)).toBe(true)
    const prices = listed.map((c) => c.price!)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
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
    for (let guard = 0; guard < 100 && !isCampaignFinished(campaign); guard++) {
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

  it('첫 갈래를 끝까지 진행하면 15전투를 모두 클리어하고 종막에 닿는다', () => {
    const campaign = playThrough(0)
    expect(campaign.nodeId).toBe('fin')
    expect(isCampaignFinished(campaign)).toBe(true)
    expect(campaign.clearedStages).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06',
      'stage07', 'stage08', 'stage09',
      'stage12', 'stage13', 'stage14', 'stage15',
      'stage10', 'stage11',
    ])
    // c01 추격 +10, c02 토벌 속행 +5, c30 자제 +5, c31 후대 +2
    expect(campaign.gauge).toBe(GAUGE_INITIAL + 22)
    // 2·3부 합류 4명이 로스터에 얹힌다 (전위는 mkStage 시뮬에서 사체가 남지 않아 이탈하지 않는다)
    expect(campaign.roster.map((r) => r.officerId)).toEqual([
      ...PLAYER_OFFICER_IDS,
      'xuChu',
      'xuHuang',
      'manChong',
      'zhangLiao',
    ])
  })

  it('둘째 갈래를 끝까지 진행하면 stage06·stage08을 건너뛴 채 종막에 닿는다', () => {
    const campaign = playThrough(1)
    expect(campaign.nodeId).toBe('fin')
    expect(isCampaignFinished(campaign)).toBe(true)
    expect(campaign.clearedStages).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05',
      'stage07', 'stage09',
      'stage12', 'stage13', 'stage14', 'stage15',
      'stage10', 'stage11',
    ])
    // c01 회군 -10, c02 화친 -5, c30 추씨 -10, c31 처형 -2
    expect(campaign.gauge).toBe(GAUGE_INITIAL - 27)
  })

  it('n31에서 전위의 사체가 남으면 로스터에서 이탈하고 장비는 창고로 회수된다 (leave ifDead)', () => {
    let campaign = { ...newCampaign(), nodeId: 'n31' }
    const state = startBattle(mkStage({ id: 'stage13', units: withDianwei }), 1, campaign.roster)
    const dianwei = unit(state, 'dianwei')
    const weapon = campaign.roster.find((r) => r.officerId === 'dianwei')!.equipment.weapon!
    dianwei.hp = 0 // 사체가 전장에 남았다
    campaign = applyVictory(campaign, state)
    expect(campaign.nodeId).toBe('s32')
    expect(campaign.roster.some((r) => r.officerId === 'dianwei')).toBe(false)
    expect(campaign.inventory).toContainEqual(weapon)
  })

  it('절영 등으로 구출해 사체가 없으면 전위는 로스터에 남는다 + s32는 정상 스크립트를 쓴다', () => {
    const campaign = { ...newCampaign(), nodeId: 'n31' }
    const state = startBattle(mkStage({ id: 'stage13', units: withDianwei }), 1, campaign.roster)
    const after = applyVictory(campaign, state) // 아무도 쓰러지지 않았다
    expect(after.roster.some((r) => r.officerId === 'dianwei')).toBe(true)

    // s32 variants 해석은 표시 계층 몫이지만, 두 스크립트가 모두 존재해야 성립한다
    const s32 = CAMPAIGN_NODES.find((n) => n.id === 's32')!
    expect(s32.type).toBe('story')
    if (s32.type !== 'story') return
    expect(STORY_SCRIPTS[s32.scriptId]).toBeDefined()
    expect(STORY_SCRIPTS[s32.variants![0].scriptId]).toBeDefined()
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
    const atFinalStory = { ...newCampaign(), nodeId: 's25' }
    const done = completeStory(atFinalStory)
    expect(done.nodeId).toBe('fin')
    expect(isCampaignFinished(done)).toBe(true)
    // 종막에서는 더 이상 전진하지 않는다
    expect(completeStory(done)).toBe(done)
  })
})

// ---------- 장수 합류 (노드 join) ----------

describe('joinOfficers / 노드 join 배선', () => {
  it('신규 장수는 장수 기본 레벨 + 병과 기본 장비를 지니고 합류한다', () => {
    const after = joinOfficers(newCampaign(), ['xuChu'])
    const entry = after.roster.find((r) => r.officerId === 'xuChu')!
    expect(entry).toEqual(newRosterEntry('xuChu'))
    expect(entry.level).toBe(OFFICERS.xuChu.level)
    expect(entry.equipment.weapon).toEqual({ itemId: 'bronzeSword', level: 1, exp: 0 })
    expect(entry.equipment.armor).toEqual({ itemId: 'leatherArmor', level: 1, exp: 0 })
  })

  it('멱등: 이미 있는 장수 / 미등록 id는 조용히 무시하고 원본 참조를 돌려준다', () => {
    const once = joinOfficers(newCampaign(), ['xuChu'])
    expect(joinOfficers(once, ['xuChu'])).toBe(once)
    expect(joinOfficers(once, ['caocao'])).toBe(once)
    expect(joinOfficers(once, ['nobodyHere'])).toBe(once)
    expect(joinOfficers(once, [])).toBe(once)
    // 유효 id가 섞여 있으면 그것만 들어온다
    const mixed = joinOfficers(once, ['nobodyHere', 'zhangLiao'])
    expect(mixed.roster.map((r) => r.officerId)).toEqual([...PLAYER_OFFICER_IDS, 'xuChu', 'zhangLiao'])
  })

  it('장료는 2차 병과(중기병)로 합류한다 — 원작 "기합류 장수는 클래스업 보너스 없음"', () => {
    const entry = joinOfficers(newCampaign(), ['zhangLiao']).roster.find((r) => r.officerId === 'zhangLiao')!
    // classId 오버라이드가 아니라 장수 정의 자체가 2차다 (세이브에 classId 키가 생기지 않는다)
    expect(entry.classId).toBeUndefined()
    expect(classIdOf(entry)).toBe('heavyCavalry')
    expect(CLASSES.heavyCavalry.tier).toBe(2)
  })

  it('completeStory가 story 노드의 join(s23 허저 / s25 장료)을 소화한다', () => {
    const atS23 = { ...newCampaign(), nodeId: 's23' }
    const joined = completeStory(atS23)
    expect(joined.nodeId).toBe('n23')
    expect(joined.roster.some((r) => r.officerId === 'xuChu')).toBe(true)
    // 재진입해도 중복되지 않는다 (멱등)
    expect(completeStory({ ...joined, nodeId: 's23' }).roster.filter((r) => r.officerId === 'xuChu')).toHaveLength(1)

    const atS25 = { ...joined, nodeId: 's25' }
    expect(completeStory(atS25).roster.some((r) => r.officerId === 'zhangLiao')).toBe(true)
  })

  it('join이 없는 story 노드는 로스터를 건드리지 않는다', () => {
    const before = newCampaign()
    expect(completeStory(before).roster.map((r) => r.officerId)).toEqual(PLAYER_OFFICER_IDS)
  })

  it('applyVictory도 노드 join을 소화한다 (battle 노드에 join이 붙는 경우 대비)', () => {
    // 그래프상 join은 story 노드에만 있으므로 battle 노드에 붙은 경우를 직접 확인한다
    const battleNode = CAMPAIGN_NODES.find((n) => n.id === 'n23')!
    expect(battleNode.type).toBe('battle')
    const campaign = { ...newCampaign(), nodeId: 's23' }
    const advanced = completeStory(campaign) // s23의 join(허저) 소화 → n23
    const state = startBattle(mkStage({ id: 'stage10' }), 1, advanced.roster)
    const after = applyVictory(advanced, state)
    expect(after.nodeId).toBe('s24')
    expect(after.roster.filter((r) => r.officerId === 'xuChu')).toHaveLength(1)
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
    expect(validateCampaign({ ...base, version: 7 })).toBeNull()
    expect(validateCampaign({ ...base, nodeId: 1 })).toBeNull()
    expect(validateCampaign({ ...base, roster: 'nope' })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 3 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [{ officerId: 'caocao', level: 'x', exp: 0 }] })).toBeNull()
    expect(validateCampaign({ ...base, roster: [null] })).toBeNull()
    expect(validateCampaign({ ...base, clearedStages: [1] })).toBeNull()
  })

  it('v3 세이브는 게이지 중립(50)으로 승계된다', () => {
    const { gauge: _drop, ...v3 } = newCampaign()
    const restored = validateCampaign({ ...v3, version: 3 })!
    expect(restored.version).toBe(6)
    expect(restored.gauge).toBe(GAUGE_INITIAL)
    // 나머지 필드는 손대지 않는다
    expect(restored.roster).toEqual(newCampaign().roster)
    expect(restored.gold).toBe(INITIAL_GOLD)
  })

  it('v1/v2 세이브도 게이지 중립으로 승계된다', () => {
    const base = newCampaign()
    const v1 = validateCampaign({ version: 1, nodeId: 'n01', roster: [{ officerId: 'caocao', level: 5, exp: 0 }], clearedStages: [] })!
    expect(v1.version).toBe(6)
    expect(v1.gauge).toBe(GAUGE_INITIAL)
    const v2 = validateCampaign({ ...base, version: 2, fruits: undefined, gauge: undefined })!
    expect(v2.version).toBe(6)
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

// ---------- 스토리 variants (v1.2) ----------

describe('scriptIdFor — 로스터 부재에 따른 대체 스크립트', () => {
  const s32 = CAMPAIGN_NODES.find((n) => n.id === 's32')!

  it('s32는 전위 부재 시 추모 스크립트로 갈린다', () => {
    const base = newCampaign()
    // 전위가 로스터에 있으면 기본 스크립트
    expect(scriptIdFor(s32, base)).toBe('afterWan')
    // 전위가 이탈했으면 variant
    const bereaved = { ...base, roster: base.roster.filter((r) => r.officerId !== 'dianwei') }
    expect(scriptIdFor(s32, bereaved)).toBe('mourningDianwei')
  })

  it('variants가 없는 story 노드는 항상 자기 scriptId', () => {
    const s00 = CAMPAIGN_NODES.find((n) => n.id === 's00' && n.type === 'story')!
    const empty = { ...newCampaign(), roster: [] }
    expect(scriptIdFor(s00, empty)).toBe('intro')
  })

  it('story가 아닌 노드는 null', () => {
    const battle = CAMPAIGN_NODES.find((n) => n.type === 'battle')!
    expect(scriptIdFor(battle, newCampaign())).toBeNull()
  })

  it('모든 variant의 scriptId가 STORY_SCRIPTS에 실재한다', () => {
    for (const node of CAMPAIGN_NODES) {
      if (node.type !== 'story') continue
      for (const v of node.variants ?? []) {
        expect(STORY_SCRIPTS[v.scriptId], `${node.id} → ${v.scriptId}`).toBeDefined()
      }
    }
  })
})
