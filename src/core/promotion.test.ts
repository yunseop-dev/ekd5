// v0.8 승급(클래스 체인지) — 인수 경제 · 2차 병과 · 계열(lineage) 착용 규칙.
// 근거: docs/research/caocao.md §2.1~2.2 (Lv15↑ 인수 → 2차, 클래스업 보너스)

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { STRATEGIES } from '../data/strategies'
import { decideUnit, runAiPhase } from './ai'
import { applyAction, effectiveStats, knownStrategies, livingUnits, startBattle, unitAt } from './battle'
import type { CampaignState, RosterEntry } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  canEquip,
  canEquipClass,
  canPromote,
  classIdOf,
  completeChoice,
  consumableCount,
  completeStory,
  currentNode,
  equipItem,
  newCampaign,
  PROMOTION_LEVEL,
  promoteOfficer,
  stageForNode,
} from './campaign'
import { maxHp } from './formulas'
import type { BattleState, StageDef } from './types'

// ---------- 헬퍼 ----------

/** 지정한 부대만 레벨/병과를 바꾼 캠페인 (원본 불변 유지) */
function withRoster(
  campaign: CampaignState,
  officerId: string,
  patch: Partial<RosterEntry>,
): CampaignState {
  return {
    ...campaign,
    roster: campaign.roster.map((r) => (r.officerId === officerId ? { ...r, ...patch } : r)),
  }
}

/** Lv15 + 인수 1개를 갖춘 승급 직전 상태 */
function readyToPromote(officerId: string, level = PROMOTION_LEVEL): CampaignState {
  return { ...withRoster(newCampaign(), officerId, { level }), consumables: [{ itemId: 'insu', count: 1 }] }
}

const entryOf = (campaign: CampaignState, officerId: string): RosterEntry =>
  campaign.roster.find((r) => r.officerId === officerId)!

const stage = (id: string): StageDef => STAGES.find((s) => s.id === id)!

// ---------- 데이터 정합 ----------

describe('병과 데이터 — 계열(lineage)과 승급 트리', () => {
  it('모든 병과가 lineage를 갖고, 그 lineage는 실재하는 1차 병과다', () => {
    for (const cls of Object.values(CLASSES)) {
      const root = CLASSES[cls.lineage]
      expect(root, `${cls.id}.lineage`).toBeDefined()
      expect(root.tier, `${cls.id}.lineage는 1차`).toBe(1)
    }
  })

  it('1차 병과의 lineage는 자기 자신이고, 전부 2차로 승급한다', () => {
    const tier1 = Object.values(CLASSES).filter((c) => c.tier === 1)
    expect(tier1).toHaveLength(6)
    for (const cls of tier1) {
      expect(cls.lineage, cls.id).toBe(cls.id)
      const next = CLASSES[cls.promotesTo!]
      expect(next, `${cls.id}.promotesTo`).toBeDefined()
      expect(next.tier).toBe(2)
      expect(next.lineage, `${next.id}는 ${cls.id} 계열`).toBe(cls.id)
    }
  })

  it('2차 병과 6종은 더 위로 승급하지 않는다 (3차는 v0.8 범위 밖)', () => {
    const tier2 = Object.values(CLASSES).filter((c) => c.tier === 2)
    expect(tier2.map((c) => c.id).sort()).toEqual(
      ['chancellor', 'counselor', 'crossbowman', 'guardInfantry', 'heavyCavalry', 'seniorGeomancer'].sort(),
    )
    for (const cls of tier2) expect(cls.promotesTo, cls.id).toBeUndefined()
  })

  it('2차는 1차의 책략을 전부 물려받는다 (같은 learnLevel)', () => {
    for (const base of Object.values(CLASSES).filter((c) => c.tier === 1)) {
      const next = CLASSES[base.promotesTo!]
      for (const s of base.strategies) {
        expect(next.strategies, `${next.id} ⊇ ${base.id}`).toContainEqual(s)
      }
    }
  })

  it('클래스업 보너스는 원작 공식 그대로 — HP/MP 기본치 +레벨성장치×2, 성장등급은 불변', () => {
    // 근거: 나무위키 병과 문서 "클래스 업을 하면 그 순간 HP와 MP가 레벨 상승치의 2배만큼 증가"
    //       + "영걸전, 공명전과 다르게 부대를 승급시켜도 능력치나 성장률에는 변화가 없다"
    //       (조창 HP 107 + 49×5 + 2회×10 = 372 검산 일치, docs/research/promotion.md §2)
    for (const base of Object.values(CLASSES).filter((c) => c.tier === 1)) {
      const next = CLASSES[base.promotesTo!]
      expect(next.hpBase, next.id).toBe(base.hpBase + base.hpGrowth * 2)
      expect(next.mpBase, next.id).toBe(base.mpBase + base.mpGrowth * 2)
      expect(next.hpGrowth, next.id).toBe(base.hpGrowth)
      expect(next.mpGrowth, next.id).toBe(base.mpGrowth)
      expect(next.growth, next.id).toEqual(base.growth)
    }
  })

  it('중기병은 원작대로 수치 무변화 — 이동력도 성장도 경기병 그대로 (보너스 HP/MP뿐)', () => {
    expect(CLASSES.heavyCavalry.move).toBe(CLASSES.lightCavalry.move)
    expect(CLASSES.heavyCavalry.growth).toEqual(CLASSES.lightCavalry.growth)
  })

  it('노병은 원작대로 사거리가 확장된 원거리 병과다 (궁병 2~2 → 노병 2~3)', () => {
    expect(CLASSES.crossbowman.minRange).toBe(2)
    expect(CLASSES.crossbowman.maxRange).toBe(3)
    expect(CLASSES.crossbowman.ranged).toBe(true)
  })

  it('방술사는 원작대로 계열 중 유일하게 2차에서 이동력이 오른다 (4→5)', () => {
    expect(CLASSES.seniorGeomancer.move).toBe(CLASSES.geomancer.move + 1)
    for (const base of Object.values(CLASSES).filter((c) => c.tier === 1 && c.id !== 'geomancer')) {
      expect(CLASSES[base.promotesTo!].move, base.id).toBe(base.move)
    }
  })

  it('모든 병과의 책략 참조가 실재한다', () => {
    for (const cls of Object.values(CLASSES)) {
      for (const s of cls.strategies) expect(STRATEGIES[s.strategyId], `${cls.id}: ${s.strategyId}`).toBeDefined()
    }
  })
})

describe('신규 책략 — 화룡 / 대치료', () => {
  it('화룡은 MP20 사거리3의 광역 화계(위력 60 / 한계명중 80)', () => {
    expect(STRATEGIES.hwaryong).toMatchObject({
      kind: 'damage',
      element: 'fire',
      mpCost: 20,
      range: 3,
      area: 'cross',
      power: 60,
      capHitRate: 80,
      targets: 'enemy',
    })
  })

  it('대치료는 MP12 사거리3의 광역 회복(80 / 한계명중 100)', () => {
    expect(STRATEGIES.daechiryo).toMatchObject({
      kind: 'heal',
      element: 'holy',
      mpCost: 12,
      range: 3,
      area: 'cross',
      healAmount: 80,
      capHitRate: 100,
      targets: 'ally',
    })
  })

  it('2차 병과만 Lv15에 익힌다 (1차 목록에는 없다)', () => {
    expect(CLASSES.counselor.strategies).toContainEqual({ strategyId: 'hwaryong', learnLevel: 15 })
    expect(CLASSES.seniorGeomancer.strategies).toContainEqual({ strategyId: 'daechiryo', learnLevel: 15 })
    expect(CLASSES.strategist.strategies.some((s) => s.strategyId === 'hwaryong')).toBe(false)
    expect(CLASSES.geomancer.strategies.some((s) => s.strategyId === 'daechiryo')).toBe(false)
  })

  it('승급한 모사는 Lv15부터 실제로 화룡을 쓸 수 있다', () => {
    const roster: RosterEntry[] = [
      { officerId: 'guojia', level: 15, exp: 0, classId: 'counselor', equipment: {}, statBonus: {} },
    ]
    const state = startBattle(stage('stage01'), 1, roster)
    const guojia = state.units.find((u) => u.officerId === 'guojia')!
    expect(knownStrategies(guojia).map((s) => s.id)).toContain('hwaryong')
    // 승급 전 같은 레벨의 책사는 못 쓴다
    const before = startBattle(stage('stage01'), 1, [{ ...roster[0], classId: undefined }])
    expect(knownStrategies(before.units.find((u) => u.officerId === 'guojia')!).map((s) => s.id)).not.toContain(
      'hwaryong',
    )
  })
})

// ---------- classIdOf ----------

describe('classIdOf', () => {
  it('오버라이드가 없으면 장수 기본 병과', () => {
    expect(classIdOf({ officerId: 'xiahoudun' })).toBe(OFFICERS.xiahoudun.classId)
    expect(classIdOf({ officerId: 'xiahoudun', classId: undefined })).toBe('lightCavalry')
  })

  it('오버라이드가 있으면 그 병과', () => {
    expect(classIdOf({ officerId: 'xiahoudun', classId: 'heavyCavalry' })).toBe('heavyCavalry')
  })

  it('미등록 병과 id는 기본 병과로 되돌린다 (데이터 개편 내성)', () => {
    expect(classIdOf({ officerId: 'xiahoudun', classId: 'nonexistent' })).toBe('lightCavalry')
  })
})

// ---------- 승급 조건 ----------

describe('canPromote — 승급 조건 매트릭스', () => {
  it('Lv15 + 인수 + 상위 병과가 모두 갖춰지면 true', () => {
    expect(canPromote(readyToPromote('xiahoudun'), 'xiahoudun')).toBe(true)
  })

  it('레벨 미달이면 false (경계: Lv14 ✗ / Lv15 ✓)', () => {
    expect(canPromote(readyToPromote('xiahoudun', PROMOTION_LEVEL - 1), 'xiahoudun')).toBe(false)
    expect(canPromote(readyToPromote('xiahoudun', PROMOTION_LEVEL), 'xiahoudun')).toBe(true)
    expect(canPromote(readyToPromote('xiahoudun', PROMOTION_LEVEL + 10), 'xiahoudun')).toBe(true)
  })

  it('인수가 없으면 false', () => {
    expect(canPromote({ ...readyToPromote('xiahoudun'), consumables: [] }, 'xiahoudun')).toBe(false)
  })

  it('상위 병과가 없으면(이미 2차) false — 인수를 낭비하지 않는다', () => {
    const promoted = withRoster(readyToPromote('xiahoudun'), 'xiahoudun', { classId: 'heavyCavalry' })
    expect(canPromote(promoted, 'xiahoudun')).toBe(false)
  })

  it('로스터에 없는 장수는 false', () => {
    expect(canPromote({ ...newCampaign(), consumables: [{ itemId: 'insu', count: 5 }] }, 'lüBu')).toBe(false)
    expect(canPromote({ ...newCampaign(), consumables: [{ itemId: 'insu', count: 5 }] }, 'nobody')).toBe(false)
  })

  it('전 아군 6명이 Lv15 + 인수면 모두 승급 대상 (1차 6종 전부 트리를 갖는다)', () => {
    for (const officerId of newCampaign().roster.map((r) => r.officerId)) {
      expect(canPromote(readyToPromote(officerId), officerId), officerId).toBe(true)
    }
  })
})

describe('promoteOfficer', () => {
  it('인수 1개를 쓰고 병과를 상위로 바꾼다', () => {
    const before = readyToPromote('xiahoudun')
    const after = promoteOfficer(before, 'xiahoudun')
    expect(consumableCount(after.consumables, 'insu')).toBe(0)
    expect(entryOf(after, 'xiahoudun').classId).toBe('heavyCavalry')
    expect(classIdOf(entryOf(after, 'xiahoudun'))).toBe('heavyCavalry')
  })

  it('원본을 건드리지 않는다 (불변)', () => {
    const before = readyToPromote('xiahoudun')
    const snapshot = JSON.parse(JSON.stringify(before))
    const after = promoteOfficer(before, 'xiahoudun')
    expect(before).toEqual(snapshot)
    expect(after).not.toBe(before)
    expect(after.roster[0]).not.toBe(before.roster[0])
  })

  it('레벨/경험치/장비/열매 보정은 그대로 유지된다', () => {
    const before = { ...readyToPromote('xiahoudun', 17), fruits: ['strFruit'] }
    const patched = withRoster(before, 'xiahoudun', { exp: 42, statBonus: { str: 4 } })
    const after = promoteOfficer(patched, 'xiahoudun')
    const entry = entryOf(after, 'xiahoudun')
    expect(entry.level).toBe(17)
    expect(entry.exp).toBe(42)
    expect(entry.statBonus).toEqual({ str: 4 })
    expect(entry.equipment).toEqual(entryOf(patched, 'xiahoudun').equipment)
    expect(after.fruits).toEqual(['strFruit'])
    expect(after.gold).toBe(patched.gold)
  })

  it('다른 부대는 승급하지 않는다', () => {
    const after = promoteOfficer(readyToPromote('xiahoudun'), 'xiahoudun')
    for (const entry of after.roster) {
      if (entry.officerId === 'xiahoudun') continue
      expect(entry.classId, entry.officerId).toBeUndefined()
    }
  })

  it('조건 미충족이면 원본을 그대로 돌려준다 (참조 동일)', () => {
    const lowLevel = readyToPromote('xiahoudun', 14)
    expect(promoteOfficer(lowLevel, 'xiahoudun')).toBe(lowLevel)
    const noSeal = { ...readyToPromote('xiahoudun'), consumables: [] }
    expect(promoteOfficer(noSeal, 'xiahoudun')).toBe(noSeal)
    const absent = readyToPromote('xiahoudun')
    expect(promoteOfficer(absent, 'nobody')).toBe(absent)
    // 2차에서 한 번 더 → 인수가 남아 있어도 아무 일 없음
    const twice = { ...promoteOfficer(readyToPromote('xiahoudun'), 'xiahoudun'), consumables: [{ itemId: 'insu', count: 3 }] }
    expect(promoteOfficer(twice, 'xiahoudun')).toBe(twice)
  })

  it('인수 2개면 두 명을 각각 승급시킬 수 있다', () => {
    let campaign = { ...withRoster(newCampaign(), 'xiahoudun', { level: 15 }), consumables: [{ itemId: 'insu', count: 2 }] }
    campaign = withRoster(campaign, 'guojia', { level: 20 })
    campaign = promoteOfficer(campaign, 'xiahoudun')
    campaign = promoteOfficer(campaign, 'guojia')
    expect(consumableCount(campaign.consumables, 'insu')).toBe(0)
    expect(entryOf(campaign, 'xiahoudun').classId).toBe('heavyCavalry')
    expect(entryOf(campaign, 'guojia').classId).toBe('counselor')
  })
})

// ---------- 착용 규칙 (계열 기준) ----------

describe('canEquipClass — 착용 판정은 계열(lineage) 기준', () => {
  it('승급해도 계열 무기를 계속 쓴다 (중기병 ← 창)', () => {
    expect(canEquipClass('lightCavalry', 'woodSpear')).toBe(true)
    expect(canEquipClass('heavyCavalry', 'woodSpear')).toBe(true)
    expect(canEquipClass('heavyCavalry', 'ironSpear')).toBe(true)
    // 계열이 다른 무기는 여전히 못 든다
    expect(canEquipClass('heavyCavalry', 'woodSword')).toBe(false)
    expect(canEquipClass('heavyCavalry', 'woodBow')).toBe(false)
  })

  it('2차 6종 전부: 1차와 착용 가능 집합이 같다', () => {
    for (const base of Object.values(CLASSES).filter((c) => c.tier === 1)) {
      for (const itemId of Object.keys(EQUIPMENT)) {
        expect(canEquipClass(base.promotesTo!, itemId), `${base.promotesTo}: ${itemId}`).toBe(
          canEquipClass(base.id, itemId),
        )
      }
    }
  })

  it('미등록 병과/장비는 false', () => {
    expect(canEquipClass('nonexistent', 'woodSword')).toBe(false)
    expect(canEquipClass('lord', 'nonexistent')).toBe(false)
  })

  it('canEquip은 장수 기본 병과 기준으로 동작한다 (기존 시그니처 유지)', () => {
    expect(canEquip('xiahoudun', 'woodSpear')).toBe(true)
    expect(canEquip('caocao', 'woodSpear')).toBe(false)
    expect(canEquip('nobody', 'woodSword')).toBe(false)
  })
})

describe('equipItem — 승급 병과로 판정한다', () => {
  it('승급 후에도 계열 무기를 장착할 수 있다', () => {
    let campaign = { ...readyToPromote('xiahoudun'), inventory: [{ itemId: 'ironSpear', level: 1, exp: 0 }] }
    campaign = promoteOfficer(campaign, 'xiahoudun')
    const equipped = equipItem(campaign, 'xiahoudun', 0)
    expect(equipped).not.toBe(campaign)
    expect(entryOf(equipped, 'xiahoudun').equipment.weapon?.itemId).toBe('ironSpear')
    // 병과는 그대로 승급 상태
    expect(entryOf(equipped, 'xiahoudun').classId).toBe('heavyCavalry')
  })

  it('승급해도 계열 밖 무기는 여전히 거부된다', () => {
    let campaign = { ...readyToPromote('xiahoudun'), inventory: [{ itemId: 'ironSword', level: 1, exp: 0 }] }
    campaign = promoteOfficer(campaign, 'xiahoudun')
    expect(equipItem(campaign, 'xiahoudun', 0)).toBe(campaign)
  })
})

// ---------- 전투 반영 ----------

describe('createBattle — 로스터 병과 오버라이드', () => {
  const rosterFor = (classId?: string): RosterEntry[] => [
    { officerId: 'xiahoudun', level: 15, exp: 0, classId, equipment: {}, statBonus: {} },
  ]

  it('아군 유닛의 classId가 승급 병과로 바뀐다', () => {
    const state = startBattle(stage('stage01'), 1, rosterFor('heavyCavalry'))
    expect(state.units.find((u) => u.officerId === 'xiahoudun')!.classId).toBe('heavyCavalry')
  })

  it('2차 병과의 클래스업 보너스는 HP/MP에만 나타난다 (원작: 능력치·성장률 무변화)', () => {
    const before = startBattle(stage('stage01'), 1, rosterFor(undefined))
    const after = startBattle(stage('stage01'), 1, rosterFor('heavyCavalry'))
    const u1 = before.units.find((u) => u.officerId === 'xiahoudun')!
    const u2 = after.units.find((u) => u.officerId === 'xiahoudun')!

    expect(u2.maxHp).toBe(maxHp(CLASSES.heavyCavalry, 15))
    expect(u2.maxHp).toBe(u1.maxHp + CLASSES.lightCavalry.hpGrowth * 2)
    expect(u2.hp).toBe(u2.maxHp)
    // 능력치는 승급 전과 동일해야 한다 — 성장등급이 계열 단위로 하나뿐이므로
    expect(effectiveStats(u2).atk).toBe(effectiveStats(u1).atk)
    expect(effectiveStats(u2).def).toBe(effectiveStats(u1).def)
  })

  it('미등록 병과 오버라이드는 기본 병과로 되돌아간다 (세이브 내성)', () => {
    const state = startBattle(stage('stage01'), 1, rosterFor('nonexistent'))
    expect(state.units.find((u) => u.officerId === 'xiahoudun')!.classId).toBe('lightCavalry')
  })

  it('적/우군은 로스터와 무관하게 장수 기본 병과를 쓴다', () => {
    const state = startBattle(stage('stage01'), 1, [
      { officerId: 'yellowInfantry', level: 15, exp: 0, classId: 'guardInfantry', equipment: {}, statBonus: {} },
    ])
    for (const u of state.units.filter((u) => u.faction !== 'player')) {
      expect(u.classId, u.officerId).toBe(OFFICERS[u.officerId].classId)
    }
  })
})

// ---------- 인수 획득 ----------

describe('rewardSeal — 인수는 특정 전투 승리에서만 나온다', () => {
  it('n11/n12/n13에만 rewardSeal이 붙어 있다', () => {
    const battles = CAMPAIGN_NODES.filter((n) => n.type === 'battle')
    const sealed = battles.filter((n) => n.type === 'battle' && n.rewardSeal).map((n) => n.id)
    expect(sealed).toEqual(['n11', 'n12', 'n13'])
  })

  it('applyVictory가 인수를 1개 늘린다', () => {
    const campaign = { ...newCampaign(), nodeId: 'n11' }
    const after = applyVictory(campaign, startBattle(stage('stage04'), 1, campaign.roster))
    expect(consumableCount(after.consumables, 'insu')).toBe(1)
    expect(after.gold).toBe(campaign.gold + 700)
  })

  it('rewardSeal이 없는 전투는 인수를 주지 않는다', () => {
    const campaign = { ...newCampaign(), nodeId: 'n01', consumables: [{ itemId: 'insu', count: 2 }] }
    // 캠페인 전투는 항상 스톡을 반입한다 (App 계약) — applyVictory는 전투 사본 잔량을 정본으로 회수한다
    const after = applyVictory(campaign, startBattle(stage('stage01'), 1, campaign.roster, undefined, campaign.consumables))
    expect(consumableCount(after.consumables, 'insu')).toBe(2)
  })

  it('추격 루트를 끝까지 타면 인수 3개 — 6명 중 3명을 승급시킬 수 있다', () => {
    const sealed = CAMPAIGN_NODES.filter((n) => n.type === 'battle' && n.rewardSeal)
    expect(sealed).toHaveLength(3)
  })

  it('회군 루트(n13 스킵)에서는 인수가 2개뿐이다', () => {
    let campaign = newCampaign()
    let guard = 0
    while (currentNode(campaign)?.type !== 'end' && guard++ < 50) {
      const node = currentNode(campaign)!
      if (node.type === 'story') campaign = completeStory(campaign)
      else if (node.type === 'choice') campaign = completeChoice(campaign, 1) // 회군
      else if (node.type === 'battle') {
        campaign = applyVictory(
          campaign,
          startBattle(stageForNode(node), 1, campaign.roster, undefined, campaign.consumables),
        )
      } else break
    }
    expect(campaign.clearedStages).not.toContain('stage06')
    expect(consumableCount(campaign.consumables, 'insu')).toBe(2)
  })
})

// ---------- 세이브 승계 ----------

describe('validateCampaign — v4~v5 → v6 승계', () => {
  it('v4 세이브는 인수 0으로 승계된다', () => {
    const { consumables: _drop, ...v4 } = newCampaign()
    const restored = validateCampaign({ ...v4, version: 4 })!
    expect(restored.version).toBe(6)
    expect(consumableCount(restored.consumables, 'insu')).toBe(0)
    expect(restored.roster).toEqual(newCampaign().roster)
  })

  it('v5 라운드트립은 인수와 승급 병과를 보존한다', () => {
    const promoted = promoteOfficer(readyToPromote('xiahoudun'), 'xiahoudun')
    const campaign = { ...promoted, consumables: [{ itemId: 'insu', count: 2 }] }
    expect(validateCampaign(JSON.parse(JSON.stringify(campaign)))).toEqual(campaign)
  })

  it('미등록 승급 병과는 떨어내 기본 병과로 복원한다', () => {
    const raw = JSON.parse(JSON.stringify(newCampaign())) as Record<string, unknown>
    const roster = raw.roster as Record<string, unknown>[]
    roster.find((r) => r.officerId === 'xiahoudun')!.classId = 'gone'
    const restored = validateCampaign(raw)!
    const entry = entryOf(restored, 'xiahoudun')
    expect(entry.classId).toBeUndefined()
    expect(classIdOf(entry)).toBe('lightCavalry')
  })

  it('망가진 인수 값은 세이브를 버리지 않고 0 이상 정수로 조인다', () => {
    const base = newCampaign()
    expect(consumableCount(validateCampaign({ ...base, seals: -3 })!.consumables, 'insu')).toBe(0)
    expect(consumableCount(validateCampaign({ ...base, seals: 2.9 })!.consumables, 'insu')).toBe(2)
    expect(consumableCount(validateCampaign({ ...base, seals: 'many' })!.consumables, 'insu')).toBe(0)
    expect(consumableCount(validateCampaign({ ...base, seals: Number.NaN })!.consumables, 'insu')).toBe(0)
  })

  it('승급한 부대의 계열 무기는 세이브 정화에서 살아남는다', () => {
    const promoted = promoteOfficer(readyToPromote('xiahoudun'), 'xiahoudun')
    const restored = validateCampaign(JSON.parse(JSON.stringify(promoted)))!
    expect(entryOf(restored, 'xiahoudun').equipment.weapon?.itemId).toBe('woodSpear')
    expect(restored.inventory).toEqual([])
  })
})

// ---------- 풀 캠페인 레벨 커브 시뮬레이션 ----------

/** 아군까지 AI로 굴려 전투를 끝까지 진행시킨다 (stages.test.ts와 같은 방식) */
function simulate(state: BattleState, maxRounds: number): BattleState {
  let current = state
  for (let i = 0; i < maxRounds && current.result === 'ongoing'; i++) {
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

/** 출진 명단 — 강제출진을 앞에 두고 나머지 로스터로 슬롯을 채운다 */
function deploymentFor(stageDef: StageDef, roster: RosterEntry[]): string[] | undefined {
  if (!stageDef.playerSlots) return undefined
  const forced = stageDef.forcedOfficers ?? []
  const rest = roster.map((r) => r.officerId).filter((id) => !forced.includes(id))
  return [...forced, ...rest].slice(0, stageDef.deployMax ?? stageDef.playerSlots.length)
}

describe('풀 캠페인 레벨 커브 (추격 루트 완주)', () => {
  it('전 노드를 AI로 완주하면 로스터가 이월되고 최고 레벨이 보고된다', () => {
    let campaign = newCampaign()
    const results: string[] = []
    let guard = 0

    while (currentNode(campaign)?.type !== 'end' && guard++ < 60) {
      const node = currentNode(campaign)!
      if (node.type === 'story') {
        campaign = completeStory(campaign)
      } else if (node.type === 'choice') {
        campaign = completeChoice(campaign, 0) // 추격 루트 (사실)
      } else if (node.type === 'battle') {
        const stageDef = stageForNode(node)
        const state = simulate(
          startBattle(stageDef, 42, campaign.roster, deploymentFor(stageDef, campaign.roster), campaign.consumables),
          600,
        )
        const bonusFired = state.log.some((l) => l.type === 'bonus')
        results.push(`${node.id}(${stageDef.id}): ${state.result}${bonusFired ? '+보너스' : ''}`)
        campaign = applyVictory(campaign, state)
      } else break
    }

    expect(currentNode(campaign)?.type).toBe('end')
    expect(campaign.clearedStages).toEqual(['stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06'])
    expect(consumableCount(campaign.consumables, 'insu')).toBe(3)

    const levels = campaign.roster.map((r) => `${OFFICERS[r.officerId].name} Lv${r.level}`)
    const top = Math.max(...campaign.roster.map((r) => r.level))
    const promotable = campaign.roster.filter((r) => r.level >= PROMOTION_LEVEL).length
    console.log(
      [
        '[v0.8 레벨 커브 시뮬] 추격 루트 완주',
        `  전투 결과: ${results.join(' / ')}`,
        `  최종 로스터: ${levels.join(', ')}`,
        `  최고 레벨 ${top} / 승급 기준 Lv${PROMOTION_LEVEL} 도달 ${promotable}명 / 인수 ${consumableCount(campaign.consumables, 'insu')}개`,
        top >= PROMOTION_LEVEL
          ? '  → Lv15 도달: 승급이 캠페인 안에서 열린다'
          : `  → Lv15 미달(${PROMOTION_LEVEL - top} 부족): bonusExp 상향 등 커브 조정 필요`,
      ].join('\n'),
    )

    // 완주 자체가 성장으로 이어졌는지만 고정 검증한다 (레벨 도달 여부는 밸런스 리포트)
    expect(top).toBeGreaterThan(Math.max(...newCampaign().roster.map((r) => r.level)))
  })

  it('Lv15에 도달한 부대는 인수로 즉시 승급할 수 있다 (경로 확인)', () => {
    // 커브와 무관하게 "레벨 + 인수" 두 자원만 있으면 승급이 성립한다는 계약 확인
    const campaign = readyToPromote('dianwei')
    expect(canPromote(campaign, 'dianwei')).toBe(true)
    const after = promoteOfficer(campaign, 'dianwei')
    expect(classIdOf(entryOf(after, 'dianwei'))).toBe('guardInfantry')
    expect(CLASSES.guardInfantry.growth.def).toBe('S')
  })
})
