// v0.8 승급(클래스 체인지) — 인수 경제 · 2차 병과 · 계열(lineage) 착용 규칙.
// 근거: docs/research/caocao.md §2.1~2.2 (Lv15↑ 인수 → 2차, 클래스업 보너스)
// v0.9: 승급은 원작대로 **전투 중 인수 사용**으로만 일어난다 (promotion.md §4).
// 캠프(진영) 승급 경로(canPromote/promoteOfficer)는 deprecated — 이 파일도 전투 기반으로 재작성됐다.

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { CLASSES } from '../data/classes'
import { CONSUMABLES, shopConsumables } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { STRATEGIES } from '../data/strategies'
import { decideUnit, runAiPhase } from './ai'
import { autoResolveEvents } from './events'
import { applyAction, effectiveStats, knownStrategies, livingUnits, startBattle, unitAt } from './battle'
import type { CampaignState, RosterEntry } from './campaign'
import {
  applyVictory,
  CAMPAIGN_NODES,
  canEquip,
  canEquipClass,
  canPromoteUnit,
  classIdOf,
  completeChoice,
  consumableCount,
  completeStory,
  currentNode,
  equipItem,
  newCampaign,
  PROMOTION_LEVEL,
  stageForNode,
} from './campaign'
import { maxHp, maxMp } from './formulas'
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

/** Lv15 + 인수 1개를 갖춘 승급 직전 상태 (승급 자체는 전투 안에서 일어난다) */
function readyToPromote(officerId: string, level = PROMOTION_LEVEL): CampaignState {
  return { ...withRoster(newCampaign(), officerId, { level }), consumables: [{ itemId: 'insu', count: 1 }] }
}

/** 승급을 마친 로스터 상태 — 전투에서 인수를 쓰고 승리로 회수한 결과 */
function promotedInBattle(campaign: CampaignState, ...officerIds: string[]): CampaignState {
  // v1.1: 개전 대사 이벤트를 소화해야 useItem이 통과한다 (대기 큐가 남으면 전 액션 거부)
  let state = autoResolveEvents(startBattle(stage('stage01'), 1, campaign.roster, undefined, campaign.consumables))
  for (const officerId of officerIds) {
    const target = state.units.find((u) => u.officerId === officerId)!
    state = applyAction(state, { type: 'useItem', unitId: target.id, itemId: 'insu', target: target.pos })
  }
  return applyVictory({ ...campaign, nodeId: 'n01' }, state)
}

const entryOf = (campaign: CampaignState, officerId: string): RosterEntry =>
  campaign.roster.find((r) => r.officerId === officerId)!

const stage = (id: string): StageDef => STAGES.find((s) => s.id === id)!

/** 전투를 열고 지정 부대에 인수를 쓴다 (거부되면 before와 같은 참조가 돌아온다) */
function useInsu(
  campaign: CampaignState,
  officerId: string,
): { before: BattleState; after: BattleState } {
  const before = autoResolveEvents(startBattle(stage('stage01'), 1, campaign.roster, undefined, campaign.consumables))
  const target = before.units.find((u) => u.officerId === officerId)
  const after = target
    ? applyAction(before, { type: 'useItem', unitId: target.id, itemId: 'insu', target: target.pos })
    : before
  return { before, after }
}

const unitOf = (state: BattleState, officerId: string) => state.units.find((u) => u.officerId === officerId)!

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

describe('2차 전용 책략 — 화룡 / 구원대 (원작 수치, items.md §3)', () => {
  it('화룡은 MP20 사거리3의 십자 화계(위력 70 / 한계명중 80 — チＢ)', () => {
    expect(STRATEGIES.hwaryong).toMatchObject({
      kind: 'damage',
      element: 'fire',
      mpCost: 20,
      range: 3,
      area: 'cross',
      power: 70,
      capHitRate: 80,
      targets: 'enemy',
    })
  })

  it('구원대는 MP12 사거리4의 십자 회복(40+정신/10 — ルＢ)', () => {
    expect(STRATEGIES.guwondae).toMatchObject({
      kind: 'heal',
      element: 'holy',
      mpCost: 12,
      range: 4,
      area: 'cross',
      heal: { base: 40, mindDiv: 10 },
      capHitRate: 100,
      targets: 'ally',
    })
  })

  it('2차 병과만 Lv15에 익힌다 (1차 목록에는 없다)', () => {
    expect(CLASSES.counselor.strategies).toContainEqual({ strategyId: 'hwaryong', learnLevel: 15 })
    expect(CLASSES.seniorGeomancer.strategies).toContainEqual({ strategyId: 'guwondae', learnLevel: 15 })
    expect(CLASSES.strategist.strategies.some((s) => s.strategyId === 'hwaryong')).toBe(false)
    expect(CLASSES.geomancer.strategies.some((s) => s.strategyId === 'guwondae')).toBe(false)
  })

  it('1차 책략도 원작 코드에 맞다 — 소보급 ルＡ / 연병·둔병·고양 ルＢ / 풍진 ルＣ', () => {
    expect(STRATEGIES.sobogeup).toMatchObject({
      mpCost: 6,
      range: 4,
      area: 'single',
      heal: { base: 40, mindDiv: 10 },
    })
    for (const id of ['yeonbyeong', 'dunbyeong', 'goyang']) {
      expect(STRATEGIES[id], id).toMatchObject({ mpCost: 6, range: 4, area: 'cross' })
    }
    expect(STRATEGIES.dunbyeong.capHitRate).toBe(90)
    expect(STRATEGIES.goyang.capHitRate).toBe(100)
    // 바람 계열만 ㅁ자(3×3)
    expect(STRATEGIES.pungjin).toMatchObject({
      element: 'wind',
      mpCost: 12,
      range: 4,
      area: 'square',
      power: 40,
      capHitRate: 100,
      targets: 'enemy',
    })
    // 이미 원작과 일치했던 항목 — 회귀 방지
    expect(STRATEGIES.choyeol).toMatchObject({ mpCost: 6, range: 4, area: 'single', power: 70, capHitRate: 100 })
    expect(STRATEGIES.eophwa).toMatchObject({ mpCost: 10, range: 3, area: 'single', power: 90, capHitRate: 90 })
    expect(STRATEGIES.hwajin).toMatchObject({ mpCost: 12, range: 4, area: 'cross', power: 50, capHitRate: 90 })
    expect(STRATEGIES.seonpung).toMatchObject({ mpCost: 6, range: 4, area: 'single', power: 50, capHitRate: 100 })
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

describe('canPromoteUnit — 승급 조건 매트릭스 (전투·UI 공용)', () => {
  it('상위 병과가 있고 Lv15 이상이면 true (인수 보유는 보지 않는다)', () => {
    expect(canPromoteUnit({ classId: 'lightCavalry', level: PROMOTION_LEVEL })).toBe(true)
  })

  it('레벨 경계 — Lv14 ✗ / Lv15 ✓ / Lv30 ✓', () => {
    expect(canPromoteUnit({ classId: 'lightCavalry', level: PROMOTION_LEVEL - 1 })).toBe(false)
    expect(canPromoteUnit({ classId: 'lightCavalry', level: PROMOTION_LEVEL })).toBe(true)
    expect(canPromoteUnit({ classId: 'lightCavalry', level: PROMOTION_LEVEL + 15 })).toBe(true)
  })

  it('이미 2차면 false — 인수를 낭비하지 않는다', () => {
    for (const cls of Object.values(CLASSES).filter((c) => c.tier === 2)) {
      expect(canPromoteUnit({ classId: cls.id, level: 50 }), cls.id).toBe(false)
    }
  })

  it('미등록 병과 id는 false (손상된 세이브 내성)', () => {
    expect(canPromoteUnit({ classId: 'nonexistent', level: 50 })).toBe(false)
    expect(canPromoteUnit({ classId: '', level: 50 })).toBe(false)
  })

  it('1차 6종은 전부 Lv15에 승급 가능하다', () => {
    for (const cls of Object.values(CLASSES).filter((c) => c.tier === 1)) {
      expect(canPromoteUnit({ classId: cls.id, level: PROMOTION_LEVEL }), cls.id).toBe(true)
    }
  })

  it('아군 6명 전원이 Lv15면 승급 대상이다 (로스터 병과 기준)', () => {
    for (const entry of newCampaign().roster) {
      expect(canPromoteUnit({ classId: classIdOf(entry), level: PROMOTION_LEVEL }), entry.officerId).toBe(true)
    }
  })
})

describe('전투 중 인수 사용 — 승급 (v0.9 정본 경로)', () => {
  it('인수 1개를 쓰고 병과를 상위로 바꾼다 + HP/MP 완전회복', () => {
    const campaign = readyToPromote('xiahoudun')
    const { before, after } = useInsu(campaign, 'xiahoudun')
    expect(after).not.toBe(before)

    const dun = unitOf(after, 'xiahoudun')
    expect(dun.classId).toBe('heavyCavalry')
    expect(dun.maxHp).toBe(maxHp(CLASSES.heavyCavalry, PROMOTION_LEVEL))
    expect(dun.maxMp).toBe(maxMp(CLASSES.heavyCavalry, PROMOTION_LEVEL))
    expect(dun.hp).toBe(dun.maxHp)
    expect(dun.mp).toBe(dun.maxMp)
    expect(consumableCount(after.consumables, 'insu')).toBe(0)
    // 원본 전투 상태는 불변
    expect(unitOf(before, 'xiahoudun').classId).toBe('lightCavalry')
  })

  it('승급 결과가 승리 결산에서 로스터로 이월된다', () => {
    const promoted = promotedInBattle(readyToPromote('xiahoudun'), 'xiahoudun')
    expect(entryOf(promoted, 'xiahoudun').classId).toBe('heavyCavalry')
    expect(classIdOf(entryOf(promoted, 'xiahoudun'))).toBe('heavyCavalry')
    expect(consumableCount(promoted.consumables, 'insu')).toBe(0)
  })

  it('레벨/경험치/장비/열매 보정은 그대로 유지된다', () => {
    const base = { ...readyToPromote('xiahoudun', 17), fruits: ['strFruit'] }
    const patched = withRoster(base, 'xiahoudun', { exp: 42, statBonus: { str: 4 } })
    const after = promotedInBattle(patched, 'xiahoudun')
    const entry = entryOf(after, 'xiahoudun')
    expect(entry.level).toBe(17)
    expect(entry.statBonus).toEqual({ str: 4 })
    expect(entry.equipment.weapon?.itemId).toBe('woodSpear')
    expect(after.fruits).toEqual(['strFruit'])
  })

  it('다른 부대는 승급하지 않는다 (classId 키 자체가 생기지 않는다)', () => {
    const after = promotedInBattle(readyToPromote('xiahoudun'), 'xiahoudun')
    for (const entry of after.roster) {
      if (entry.officerId === 'xiahoudun') continue
      expect(entry.classId, entry.officerId).toBeUndefined()
    }
  })

  it('조건 미충족이면 전투 상태를 그대로 돌려준다 (참조 동일)', () => {
    // Lv14
    const low = useInsu(readyToPromote('xiahoudun', 14), 'xiahoudun')
    expect(low.after).toBe(low.before)
    // 인수 미보유
    const noSeal = useInsu({ ...readyToPromote('xiahoudun'), consumables: [] }, 'xiahoudun')
    expect(noSeal.after).toBe(noSeal.before)
    // 이미 2차 — 인수가 남아 있어도 아무 일 없음
    const twice = withRoster(
      { ...readyToPromote('xiahoudun'), consumables: [{ itemId: 'insu', count: 3 }] },
      'xiahoudun',
      { classId: 'heavyCavalry' },
    )
    const again = useInsu(twice, 'xiahoudun')
    expect(again.after).toBe(again.before)
  })

  it('인수 2개면 한 전투에서 두 명을 각각 승급시킬 수 있다', () => {
    let campaign = { ...withRoster(newCampaign(), 'xiahoudun', { level: 15 }), consumables: [{ itemId: 'insu', count: 2 }] }
    campaign = withRoster(campaign, 'guojia', { level: 20 })
    const after = promotedInBattle(campaign, 'xiahoudun', 'guojia')
    expect(consumableCount(after.consumables, 'insu')).toBe(0)
    expect(entryOf(after, 'xiahoudun').classId).toBe('heavyCavalry')
    expect(entryOf(after, 'guojia').classId).toBe('counselor')
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
    const promoted = promotedInBattle(readyToPromote('xiahoudun'), 'xiahoudun')
    const campaign = { ...promoted, inventory: [{ itemId: 'ironSpear', level: 1, exp: 0 }] }
    const equipped = equipItem(campaign, 'xiahoudun', 0)
    expect(equipped).not.toBe(campaign)
    expect(entryOf(equipped, 'xiahoudun').equipment.weapon?.itemId).toBe('ironSpear')
    // 병과는 그대로 승급 상태
    expect(entryOf(equipped, 'xiahoudun').classId).toBe('heavyCavalry')
  })

  it('승급해도 계열 밖 무기는 여전히 거부된다', () => {
    const promoted = promotedInBattle(readyToPromote('xiahoudun'), 'xiahoudun')
    const campaign = { ...promoted, inventory: [{ itemId: 'ironSword', level: 1, exp: 0 }] }
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
  it('1부 n11/n12/n13 + 2부 최종전 n24에만 rewardSeal이 붙어 있다', () => {
    const battles = CAMPAIGN_NODES.filter((n) => n.type === 'battle')
    const sealed = battles.filter((n) => n.type === 'battle' && n.rewardSeal).map((n) => n.id)
    expect(sealed).toEqual(['n11', 'n12', 'n13', 'n24'])
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

  it('추격 루트를 끝까지 타면 전투 보상 인수 4개 (2부부터는 상점 구매도 열린다)', () => {
    const sealed = CAMPAIGN_NODES.filter((n) => n.type === 'battle' && n.rewardSeal)
    expect(sealed).toHaveLength(4)
    // 2부 진입 시점부터 인수가 상점에 오르므로 승급 자원은 보상 4개 + 군자금 구매분이다
    expect(shopConsumables({ nodeId: 's20' }).map((c) => c.id)).toContain('insu')
  })

  it('회군 루트(n13 스킵)에서는 전투 보상 인수가 3개뿐이다', () => {
    let campaign = newCampaign()
    let guard = 0
    while (currentNode(campaign)?.type !== 'end' && guard++ < 80) {
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
    expect(consumableCount(campaign.consumables, 'insu')).toBe(4) // n13 스킵으로 전투 보상 3 + 유비 생존 1
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
    const promoted = withRoster(readyToPromote('xiahoudun'), 'xiahoudun', { classId: 'heavyCavalry' })
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
    const promoted = promotedInBattle(readyToPromote('xiahoudun'), 'xiahoudun')
    const restored = validateCampaign(JSON.parse(JSON.stringify(promoted)))!
    expect(entryOf(restored, 'xiahoudun').equipment.weapon?.itemId).toBe('woodSpear')
    expect(restored.inventory).toEqual([])
  })
})

// ---------- 풀 캠페인 레벨 커브 시뮬레이션 ----------

/** 아군까지 AI로 굴려 전투를 끝까지 진행시킨다 (stages.test.ts와 같은 방식) */
function simulate(state: BattleState, maxRounds: number): BattleState {
  // v1.1: 모든 액션 뒤에 이벤트 대기 큐를 소화한다 (choice는 0번 = 밸런스 기준선)
  const go = (s: BattleState, action: Parameters<typeof applyAction>[1]) =>
    autoResolveEvents(applyAction(s, action))
  let current = autoResolveEvents(state)
  for (let i = 0; i < maxRounds && current.result === 'ongoing'; i++) {
    if (current.phase === 'player') {
      for (const u of livingUnits(current, 'player')) {
        if (current.result !== 'ongoing') break
        const plan = decideUnit(current, u)
        if (plan.moveTo && !unitAt(current, plan.moveTo)) {
          current = go(current, { type: 'move', unitId: u.id, to: plan.moveTo })
        }
        current = go(current, plan.act)
      }
      if (current.result === 'ongoing') current = go(current, { type: 'endPhase' })
    } else {
      current = autoResolveEvents(runAiPhase(current, current.phase))
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

describe('풀 캠페인 레벨 커브 (추격 루트 완주 — 1부 + 2부 + 3부 15전)', () => {
  it('전 노드를 AI로 완주하면 로스터가 이월되고 최고 레벨이 보고된다', () => {
    let campaign = newCampaign()
    const results: string[] = []
    // v1.2 계측 — 완성 야습(n31)에서 전위가 살아남는지, 인수가 어디서 들어오는지
    let dianweiFellAt: string | null = null
    // v0.9 AI 확장 계측 — 회복/강화 책략을 실제로 쓰는지 (풍수사 순욱은 stage02부터 출진)
    let healCasts = 0
    let buffCasts = 0
    let guard = 0
    // v1.0 2부 계측 — 인수 수급(전투 보상)과 상점 진열 시점
    let sealsFromBattle = 0
    let shopOpenedAt: string | null = null

    while (currentNode(campaign)?.type !== 'end' && guard++ < 100) {
      const node = currentNode(campaign)!
      if (shopOpenedAt === null && shopConsumables(campaign).some((c) => c.id === 'insu')) {
        shopOpenedAt = node.id
      }
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
        healCasts += state.log.filter((l) => l.type === 'heal').length
        buffCasts += state.log.filter((l) => l.type === 'buff' || l.type === 'debuff').length
        if (node.rewardSeal) sealsFromBattle += 1
        const corpse = state.units.some((u) => u.officerId === 'dianwei' && u.hp <= 0)
        if (corpse && dianweiFellAt === null) dianweiFellAt = `${node.id}(${stageDef.id})`
        results.push(`${node.id}(${stageDef.id}): ${state.result}${bonusFired ? '+보너스' : ''}`)
        campaign = applyVictory(campaign, state)
      } else break
    }

    expect(currentNode(campaign)?.type).toBe('end')
    // v1.2: 제3부 4전투(stage12~15)가 stage09 뒤 · stage10 앞에 삽입됐다
    expect(campaign.clearedStages).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06',
      'stage07', 'stage08', 'stage09',
      'stage12', 'stage13', 'stage14', 'stage15',
      'stage10', 'stage11',
    ])
    expect(campaign.clearedStages).toHaveLength(15)
    // 전투 보상 4(n11/n12/n13/n24) + 유비 생존(stage10 allySurvived — 원작 c13) 1 + stage15 보스 전멸 1
    expect(consumableCount(campaign.consumables, 'insu')).toBeGreaterThanOrEqual(5)
    // 2·3부 합류가 로스터에 얹힌다 (허저 s30 / 서황·만총 s31 / 장료 s25)
    for (const id of ['xuChu', 'xuHuang', 'manChong', 'zhangLiao']) {
      expect(campaign.roster.map((r) => r.officerId), id).toContain(id)
    }
    // 전위는 완성 야습(n31)에서만 이탈할 수 있다 — 그 밖의 전투에서 빠지면 leave 배선이 잘못된 것이다
    const dianweiSurvived = campaign.roster.some((r) => r.officerId === 'dianwei')
    if (!dianweiSurvived) expect(dianweiFellAt).toMatch(/^n31\(stage13\)$/)

    const levels = campaign.roster.map((r) => `${OFFICERS[r.officerId].name} Lv${r.level}`)
    const top = Math.max(...campaign.roster.map((r) => r.level))
    const promotable = campaign.roster.filter((r) => r.level >= PROMOTION_LEVEL).length
    const insuBuyable = Math.floor(campaign.gold / CONSUMABLES.insu.price!)
    console.log(
      [
        '[v1.2 레벨 커브 시뮬] 추격 루트 완주 15전 (1부 6전투 + 3부 4전투 + 2부 5전투)',
        `  전투 결과: ${results.join(' / ')}`,
        `  최종 로스터: ${levels.join(', ')}`,
        `  최고 레벨 ${top} / 승급 기준 Lv${PROMOTION_LEVEL} 도달 ${promotable}명 / 인수 ${consumableCount(campaign.consumables, 'insu')}개`,
        `  인수 수급: 전투 보상 ${sealsFromBattle}개 + 상점 해금 ${shopOpenedAt ?? '없음'}부터 (잔여 군자금 ${campaign.gold} → 추가 구매 가능 ${insuBuyable}개)`,
        `  전위: ${dianweiSurvived ? '생존 (로스터 유지)' : `완성에서 전사 — ${dianweiFellAt}에서 사체 확인 → leave ifDead 발동`}`,
        `  AI 지원 책략: 회복 ${healCasts}회 / 강화·방해 ${buffCasts}회`,
        top >= PROMOTION_LEVEL
          ? '  → Lv15 도달: 승급이 캠페인 안에서 열린다'
          : `  → Lv15 미달(${PROMOTION_LEVEL - top} 부족): bonusExp 상향 등 커브 조정 필요`,
      ].join('\n'),
    )

    // 완주 자체가 성장으로 이어졌는지만 고정 검증한다 (레벨 도달 여부는 밸런스 리포트)
    expect(top).toBeGreaterThan(Math.max(...newCampaign().roster.map((r) => r.level)))
    // v0.9 AI 확장 계약: 풍수사가 실제로 회복을 쓴다 (0회면 계수/게이트가 잘못된 것)
    expect(healCasts).toBeGreaterThan(0)
  })

  it('Lv15에 도달한 부대는 전투 중 인수로 즉시 승급할 수 있다 (경로 확인)', () => {
    // 커브와 무관하게 "레벨 + 인수" 두 자원만 있으면 승급이 성립한다는 계약 확인
    const campaign = readyToPromote('dianwei')
    expect(canPromoteUnit({ classId: classIdOf(entryOf(campaign, 'dianwei')), level: PROMOTION_LEVEL })).toBe(true)
    const after = promotedInBattle(campaign, 'dianwei')
    expect(classIdOf(entryOf(after, 'dianwei'))).toBe('guardInfantry')
    expect(CLASSES.guardInfantry.growth.def).toBe('S')
  })
})
