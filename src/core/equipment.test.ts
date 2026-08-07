// 장비/경제 코어 테스트 (v0.5) — 장비 보정치, 장착·상점 규칙, 전리품, 세이브 마이그레이션.
// 수치는 설계값이므로 절대값보다 "장비 보너스만큼 차이 난다"는 관계식으로 검증한다.

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import { applyAction, classOf, effectiveStats, expMultiplierOf, moveOf, movementRangeOf, startBattle } from './battle'
import type { CampaignState, RosterEntry } from './campaign'
import {
  applyVictory,
  avgRosterLevel,
  buyItem,
  completeStory,
  equipItem,
  INITIAL_GOLD,
  newCampaign,
  sellItem,
  shopTierFor,
  unequipItem,
} from './campaign'
import { keyOf } from './movement'
import type { BattleState, EquipmentMap, StageDef, TerrainId, UnitState } from './types'

// ---------- 공용 픽스처 ----------

function mkStage(over: Partial<StageDef> = {}): StageDef {
  const tiles: TerrainId[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'plain' as TerrainId))
  return {
    id: 'stage01',
    name: '장비 시험 전투',
    map: { width: 8, height: 8, tiles },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 1 }, isLeader: true },
      // 인접 배치 = 이동 없이 바로 공격 가능. Lv5 중보병이라 한 턴에 죽지 않는다.
      { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 2, y: 1 }, level: 5, isBoss: true },
    ],
    victory: [{ type: 'defeatBoss' }],
    reinforcements: [],
    weather: 'clear',
    ...over,
  }
}

const entry = (officerId: string, level: number, equipment: EquipmentMap = {}): RosterEntry => ({
  officerId,
  level,
  exp: 0,
  equipment,
})

const unitOf = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

/** 창고/군자금만 갈아끼운 캠페인 (노드는 서장 story 그대로) */
const withStock = (inventory: string[], gold = INITIAL_GOLD): CampaignState => ({
  ...newCampaign(),
  gold,
  inventory,
})

// ---------- 데이터 정합성 ----------

describe('EQUIPMENT 데이터', () => {
  it('키와 id가 일치하고 설명이 비어 있지 않다', () => {
    for (const [key, item] of Object.entries(EQUIPMENT)) {
      expect(item.id, key).toBe(key)
      expect(item.description.length, key).toBeGreaterThan(0)
      expect(['weapon', 'armor', 'accessory']).toContain(item.slot)
    }
  })

  it('비매품(price null)과 보물(isTreasure)은 정확히 같은 집합이다', () => {
    for (const item of Object.values(EQUIPMENT)) {
      expect(item.price === null, item.id).toBe(item.isTreasure === true)
    }
    expect(Object.values(EQUIPMENT).filter((i) => i.isTreasure).length).toBe(4)
  })

  it('상점 장비 가격이 단계별 설계 구간 안에 있다', () => {
    const band: Record<1 | 2 | 3, [number, number]> = { 1: [300, 500], 2: [800, 1200], 3: [2000, 2600] }
    for (const item of Object.values(EQUIPMENT)) {
      if (item.price === null) continue
      const [lo, hi] = band[item.tier]
      expect(item.price, item.id).toBeGreaterThanOrEqual(lo)
      expect(item.price, item.id).toBeLessThanOrEqual(hi)
    }
  })

  it('슬롯 3종 모두 상점 장비가 존재한다', () => {
    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      expect(Object.values(EQUIPMENT).some((i) => i.slot === slot && i.price !== null), slot).toBe(true)
    }
  })

  it('스테이지 전리품 itemId는 모두 실제 장비를 가리킨다', () => {
    for (const stage of STAGES) {
      for (const loot of stage.loot ?? []) {
        expect(EQUIPMENT[loot.itemId], `${stage.id}: ${loot.itemId}`).toBeDefined()
      }
    }
    expect(STAGES.find((s) => s.id === 'stage02')!.loot).toEqual([
      { trigger: 'victory', itemId: 'leatherShield' },
    ])
    expect(STAGES.find((s) => s.id === 'stage03')!.loot).toEqual([
      { trigger: 'bossKill', itemId: 'taipingYaoshu' },
    ])
  })
})

// ---------- 전투 반영 ----------

describe('장비 → effectiveStats', () => {
  const statsWith = (equipment: EquipmentMap) =>
    effectiveStats(unitOf(startBattle(mkStage(), 1, [entry('caocao', 3, equipment)]), 'caocao'))

  it('무기/방어구/보조구 보너스가 모두 합산된다', () => {
    const bare = statsWith({})
    const armed = statsWith({ weapon: 'woodSword', armor: 'leatherArmor', accessory: 'leatherShield' })
    expect(armed.atk).toBe(bare.atk + 8) // 목검
    expect(armed.def).toBe(bare.def + 8 + 6) // 가죽 갑옷 + 가죽 방패
    expect(armed.mind).toBe(bare.mind)
  })

  it('한 장비가 여러 능력치를 올릴 수 있다 (옷·보물)', () => {
    const bare = statsWith({})
    const robed = statsWith({ armor: 'silkRobe', accessory: 'taipingYaoshu' })
    expect(robed.def).toBe(bare.def + 8)
    expect(robed.mind).toBe(bare.mind + 12 + 24)
    expect(robed.morale).toBe(bare.morale + 16)
  })

  it('미등록 장비 id는 조용히 무시된다 (데이터 개편 내성)', () => {
    expect(statsWith({ weapon: 'nonexistent' })).toEqual(statsWith({}))
  })

  it('적군은 장비를 갖지 않는다', () => {
    const state = startBattle(mkStage(), 1, [entry('caocao', 3, { weapon: 'ironSword' })])
    expect(unitOf(state, 'yellowInfantry').equipment).toEqual({})
  })

  it('로스터 없는 전투는 전원 맨몸이다', () => {
    const state = startBattle(mkStage(), 1)
    for (const u of state.units) expect(u.equipment).toEqual({})
  })

  it('로스터의 장비 맵은 복사되어 전투 상태에 들어간다 (참조 공유 없음)', () => {
    const roster = [entry('caocao', 3, { weapon: 'woodSword' })]
    const state = startBattle(mkStage(), 1, roster)
    expect(unitOf(state, 'caocao').equipment).toEqual({ weapon: 'woodSword' })
    expect(unitOf(state, 'caocao').equipment).not.toBe(roster[0].equipment)
  })
})

describe('moveOf', () => {
  const moveWith = (equipment: EquipmentMap) =>
    moveOf(unitOf(startBattle(mkStage(), 1, [entry('caocao', 3, equipment)]), 'caocao'))

  it('병과 이동력 + 장비 moveBonus', () => {
    const base = classOf(unitOf(startBattle(mkStage(), 1), 'caocao')).move
    expect(moveWith({})).toBe(base)
    expect(moveWith({ accessory: 'swiftHorse' })).toBe(base + 1) // 준마
    expect(moveWith({ accessory: 'dilu' })).toBe(base + 2) // 적로
  })

  it('이동범위 계산에 실제로 반영된다 (준마 = 한 칸 더)', () => {
    const rangeWith = (equipment: EquipmentMap) => {
      const state = startBattle(mkStage(), 1, [entry('caocao', 3, equipment)])
      return movementRangeOf(state, unitOf(state, 'caocao'))
    }
    // (1,1)에서 평지 6칸 거리 — 이동력 5로는 못 닿고 6이면 닿는다
    const far = keyOf({ x: 1, y: 7 })
    expect(rangeWith({}).has(far)).toBe(false)
    expect(rangeWith({ accessory: 'swiftHorse' }).has(far)).toBe(true)
  })
})

describe('expMultiplier (맹덕신서)', () => {
  // 맹덕신서는 능력치를 건드리지 않으므로 같은 시드에서 RNG 전개가 완전히 동일하다
  // → 획득 경험치 차이만 남고, 그 비율이 정확히 1.5배여야 한다.
  const expAfterAttack = (equipment: EquipmentMap): number => {
    const state = startBattle(mkStage(), 7, [entry('caocao', 1, equipment)])
    const attacker = unitOf(state, 'caocao')
    const defender = unitOf(state, 'yellowInfantry')
    const next = applyAction(state, { type: 'attack', unitId: attacker.id, targetId: defender.id })
    return unitOf(next, 'caocao').exp
  }

  it('배율 없는 유닛의 배수는 1이다', () => {
    const state = startBattle(mkStage(), 7, [entry('caocao', 1)])
    expect(expMultiplierOf(unitOf(state, 'caocao'))).toBe(1)
    expect(expMultiplierOf(unitOf(state, 'yellowInfantry'))).toBe(1)
  })

  it('전투에서 실제로 경험치가 1.5배 들어온다', () => {
    const plain = expAfterAttack({})
    const boosted = expAfterAttack({ accessory: 'mengdeXinshu' })
    expect(plain).toBeGreaterThan(0)
    expect(boosted).toBe(Math.trunc(plain * 1.5))
  })
})

// ---------- 장착 / 해제 ----------

describe('equipItem / unequipItem', () => {
  const equipmentOf = (campaign: CampaignState, officerId = 'caocao'): EquipmentMap =>
    campaign.roster.find((r) => r.officerId === officerId)!.equipment

  it('창고의 장비가 슬롯으로 들어가고 창고에서 빠진다', () => {
    const next = equipItem(withStock(['woodSword']), 'caocao', 'woodSword')
    expect(equipmentOf(next)).toEqual({ weapon: 'woodSword' })
    expect(next.inventory).toEqual([])
  })

  it('같은 슬롯을 갈아끼우면 기존 장비가 창고로 돌아온다', () => {
    const first = equipItem(withStock(['woodSword', 'bronzeSword']), 'caocao', 'woodSword')
    expect(first.inventory).toEqual(['bronzeSword'])
    const second = equipItem(first, 'caocao', 'bronzeSword')
    expect(equipmentOf(second)).toEqual({ weapon: 'bronzeSword' })
    expect(second.inventory).toEqual(['woodSword'])
  })

  it('서로 다른 슬롯은 공존한다', () => {
    let campaign = withStock(['woodSword', 'leatherArmor', 'leatherShield'])
    for (const id of ['woodSword', 'leatherArmor', 'leatherShield']) {
      campaign = equipItem(campaign, 'caocao', id)
    }
    expect(equipmentOf(campaign)).toEqual({
      weapon: 'woodSword',
      armor: 'leatherArmor',
      accessory: 'leatherShield',
    })
    expect(campaign.inventory).toEqual([])
  })

  it('같은 장비를 2개 갖고 있으면 1개만 소모된다', () => {
    const next = equipItem(withStock(['woodSword', 'woodSword']), 'caocao', 'woodSword')
    expect(next.inventory).toEqual(['woodSword'])
  })

  it('창고에 없는 장비 / 미등록 id / 로스터 밖 장수는 원본을 그대로 반환한다', () => {
    const campaign = withStock(['woodSword'])
    expect(equipItem(campaign, 'caocao', 'bronzeSword')).toBe(campaign)
    expect(equipItem(campaign, 'caocao', 'nonexistent')).toBe(campaign)
    expect(equipItem(campaign, 'liubei', 'woodSword')).toBe(campaign)
  })

  it('해제하면 슬롯 키가 사라지고 창고로 돌아간다', () => {
    const equipped = equipItem(withStock(['woodSword']), 'caocao', 'woodSword')
    const bare = unequipItem(equipped, 'caocao', 'weapon')
    expect(equipmentOf(bare)).toEqual({})
    expect(bare.inventory).toEqual(['woodSword'])
  })

  it('빈 슬롯 / 없는 장수를 해제하면 원본 그대로', () => {
    const campaign = withStock([])
    expect(unequipItem(campaign, 'caocao', 'weapon')).toBe(campaign)
    expect(unequipItem(campaign, 'liubei', 'weapon')).toBe(campaign)
  })

  it('입력 캠페인을 변형하지 않는다', () => {
    const campaign = withStock(['woodSword'])
    const snapshot = JSON.stringify(campaign)
    const equipped = equipItem(campaign, 'caocao', 'woodSword')
    unequipItem(equipped, 'caocao', 'weapon')
    expect(JSON.stringify(campaign)).toBe(snapshot)
    expect(equipped.roster[0]).not.toBe(campaign.roster[0])
  })

  it('장착한 장비는 다음 전투의 유닛 능력치에 그대로 이어진다', () => {
    const campaign = equipItem(withStock(['ironSword']), 'caocao', 'ironSword')
    const state = startBattle(mkStage(), 1, campaign.roster)
    const bare = startBattle(mkStage(), 1, [entry('caocao', OFFICERS.caocao.level)])
    expect(effectiveStats(unitOf(state, 'caocao')).atk).toBe(effectiveStats(unitOf(bare, 'caocao')).atk + 26)
  })
})

// ---------- 상점 ----------

describe('buyItem / sellItem', () => {
  it('구매하면 가격만큼 군자금이 줄고 창고에 들어온다', () => {
    const next = buyItem(withStock([], 500), 'woodSword') // 300
    expect(next.gold).toBe(200)
    expect(next.inventory).toEqual(['woodSword'])
  })

  it('군자금이 부족하면 원본을 그대로 반환한다', () => {
    const campaign = withStock([], 500)
    expect(buyItem(campaign, 'ironSword')).toBe(campaign) // 2000
    // 가격과 정확히 같은 금액은 살 수 있다 (경계)
    expect(buyItem(withStock([], 300), 'woodSword').gold).toBe(0)
  })

  it('비매품(보물)과 미등록 id는 살 수 없다', () => {
    const campaign = withStock([], 99999)
    expect(buyItem(campaign, 'qinggangSword')).toBe(campaign)
    expect(buyItem(campaign, 'nonexistent')).toBe(campaign)
  })

  it('판매는 반값이고 창고에서 1개만 빠진다', () => {
    const next = sellItem(withStock(['woodSword', 'woodSword'], 100), 'woodSword')
    expect(next.gold).toBe(100 + 150) // 300의 반값
    expect(next.inventory).toEqual(['woodSword'])
  })

  it('홀수 가격은 내림으로 반값 계산한다', () => {
    // 현재 데이터는 전부 짝수 가격 — 공식(내림) 자체를 고정한다
    const price = EQUIPMENT.leatherShield.price!
    expect(sellItem(withStock(['leatherShield'], 0), 'leatherShield').gold).toBe(Math.trunc(price / 2))
  })

  it('보물은 판매할 수 없다 (원작 규칙)', () => {
    const campaign = withStock(['taipingYaoshu'], 0)
    expect(sellItem(campaign, 'taipingYaoshu')).toBe(campaign)
  })

  it('창고에 없는 장비 / 장착 중인 장비는 팔리지 않는다', () => {
    const campaign = withStock(['woodSword'], 0)
    expect(sellItem(campaign, 'bronzeSword')).toBe(campaign)
    const equipped = equipItem(campaign, 'caocao', 'woodSword')
    expect(sellItem(equipped, 'woodSword')).toBe(equipped)
  })

  it('매매는 입력 캠페인을 변형하지 않는다', () => {
    const campaign = withStock(['woodSword'], 500)
    const snapshot = JSON.stringify(campaign)
    buyItem(campaign, 'leatherArmor')
    sellItem(campaign, 'woodSword')
    expect(JSON.stringify(campaign)).toBe(snapshot)
  })
})

describe('avgRosterLevel / shopTierFor', () => {
  it('평균 레벨은 내림, 빈 로스터는 0', () => {
    const campaign = (levels: number[]): CampaignState => ({
      ...newCampaign(),
      roster: levels.map((level, i) => entry(`o${i}`, level)),
    })
    expect(avgRosterLevel(campaign([1, 2, 3, 4]))).toBe(2) // 10/4 = 2.5 → 2
    expect(avgRosterLevel(campaign([8, 8, 8]))).toBe(8)
    expect(avgRosterLevel(campaign([]))).toBe(0)
  })

  it('해금 경계: <8 → 1단계, <16 → 2단계, 그 이상 → 3단계', () => {
    expect(shopTierFor(0)).toBe(1)
    expect(shopTierFor(7)).toBe(1)
    expect(shopTierFor(8)).toBe(2)
    expect(shopTierFor(15)).toBe(2)
    expect(shopTierFor(16)).toBe(3)
    expect(shopTierFor(50)).toBe(3)
  })

  it('새 캠페인은 1단계 상점에서 출발한다', () => {
    expect(shopTierFor(avgRosterLevel(newCampaign()))).toBe(1)
  })
})

// ---------- 승리 보상 ----------

describe('applyVictory — 보상금과 전리품', () => {
  // 서장 story(s00)를 소화해 첫 전투 노드(n01, rewardGold 300)에 선 상태
  const atFirstBattle = () => completeStory(newCampaign())

  it('battle 노드의 rewardGold가 군자금에 가산된다', () => {
    const campaign = atFirstBattle()
    const next = applyVictory(campaign, startBattle(mkStage(), 1, campaign.roster))
    expect(next.gold).toBe(INITIAL_GOLD + 300)
  })

  it("loot trigger 'victory'는 승리하면 무조건 들어온다", () => {
    const campaign = atFirstBattle()
    const stage = mkStage({ loot: [{ trigger: 'victory', itemId: 'leatherShield' }] })
    const next = applyVictory(campaign, startBattle(stage, 1, campaign.roster))
    expect(next.inventory).toEqual(['leatherShield'])
  })

  it("loot trigger 'bossKill'은 보스를 실제로 격파해야 들어온다", () => {
    const campaign = atFirstBattle()
    const stage = mkStage({ loot: [{ trigger: 'bossKill', itemId: 'taipingYaoshu' }] })

    const alive = startBattle(stage, 1, campaign.roster)
    expect(applyVictory(campaign, alive).inventory).toEqual([])

    const killed = startBattle(stage, 1, campaign.roster)
    unitOf(killed, 'yellowInfantry').hp = 0
    expect(applyVictory(campaign, killed).inventory).toEqual(['taipingYaoshu'])
  })

  it('전리품은 기존 창고 뒤에 덧붙고 미등록 id는 무시된다', () => {
    const campaign = { ...atFirstBattle(), inventory: ['woodSword'] }
    const stage = mkStage({
      loot: [
        { trigger: 'victory', itemId: 'leatherShield' },
        { trigger: 'victory', itemId: 'nonexistent' },
      ],
    })
    expect(applyVictory(campaign, startBattle(stage, 1, campaign.roster)).inventory).toEqual([
      'woodSword',
      'leatherShield',
    ])
  })

  it('장비는 승리 결산에서 유지되고 원본은 변형되지 않는다', () => {
    const campaign = equipItem({ ...atFirstBattle(), inventory: ['woodSword'] }, 'caocao', 'woodSword')
    const snapshot = JSON.stringify(campaign)
    const next = applyVictory(campaign, startBattle(mkStage(), 1, campaign.roster))
    expect(next.roster.find((r) => r.officerId === 'caocao')!.equipment).toEqual({ weapon: 'woodSword' })
    expect(JSON.stringify(campaign)).toBe(snapshot)
  })

  it('보상금은 실제 캠페인 노드 데이터(300/400/600)를 따른다', () => {
    let campaign = atFirstBattle()
    const gains: number[] = []
    for (const stageId of ['stage01', 'stage02', 'stage03']) {
      const before = campaign.gold
      campaign = applyVictory(campaign, startBattle(mkStage({ id: stageId }), 1, campaign.roster))
      gains.push(campaign.gold - before)
      campaign = completeStory(campaign)
    }
    expect(gains).toEqual([300, 400, 600])
  })
})

// ---------- 세이브 마이그레이션 ----------

describe('validateCampaign — v1 → v2 승계', () => {
  const v1Save = {
    version: 1,
    nodeId: 'n02',
    roster: [
      { officerId: 'caocao', level: 7, exp: 35 },
      { officerId: 'xiahoudun', level: 6, exp: 0 },
    ],
    clearedStages: ['stage01'],
  }

  it('v1 세이브를 거부하지 않고 v2로 승계한다', () => {
    const restored = validateCampaign(JSON.parse(JSON.stringify(v1Save)))!
    expect(restored).not.toBeNull()
    expect(restored.version).toBe(2)
    expect(restored.nodeId).toBe('n02')
    expect(restored.clearedStages).toEqual(['stage01'])
    // 성장치는 그대로 살리고, 없던 필드만 초기값으로 채운다
    expect(restored.roster).toEqual([
      { officerId: 'caocao', level: 7, exp: 35, equipment: {} },
      { officerId: 'xiahoudun', level: 6, exp: 0, equipment: {} },
    ])
    expect(restored.gold).toBe(INITIAL_GOLD)
    expect(restored.inventory).toEqual([])
  })

  it('v1 세이브는 gold/inventory가 없어도(있어도 무시하고) 통과한다', () => {
    const restored = validateCampaign({ ...v1Save, gold: 'garbage', inventory: 7 })!
    expect(restored.gold).toBe(INITIAL_GOLD)
    expect(restored.inventory).toEqual([])
  })

  it('승계된 캠페인은 그대로 전투에 투입할 수 있다', () => {
    const restored = validateCampaign(JSON.parse(JSON.stringify(v1Save)))!
    const state = startBattle(mkStage(), 1, restored.roster)
    expect(unitOf(state, 'caocao').level).toBe(7)
    expect(unitOf(state, 'caocao').equipment).toEqual({})
  })

  it('v2 라운드트립은 장비/군자금/창고를 보존한다', () => {
    const campaign = buyItem(equipItem(withStock(['ironSword']), 'caocao', 'ironSword'), 'leatherArmor')
    const restored = validateCampaign(JSON.parse(JSON.stringify(campaign)))
    expect(restored).toEqual(campaign)
  })

  it('v2 필수 필드가 깨지면 null', () => {
    const base = newCampaign()
    expect(validateCampaign({ ...base, gold: 'x' })).toBeNull()
    expect(validateCampaign({ ...base, gold: Number.NaN })).toBeNull()
    expect(validateCampaign({ ...base, inventory: 'x' })).toBeNull()
    expect(validateCampaign({ ...base, inventory: [1] })).toBeNull()
    expect(validateCampaign({ ...base, version: 3 })).toBeNull()
  })

  it('망가진 장비 맵은 세이브를 버리지 않고 해당 슬롯만 떨어낸다', () => {
    const base = newCampaign()
    const restored = validateCampaign({
      ...base,
      roster: [{ officerId: 'caocao', level: 3, exp: 0, equipment: { weapon: 'ironSword', armor: 42, bogus: 'x' } }],
    })!
    expect(restored.roster[0].equipment).toEqual({ weapon: 'ironSword' })
  })
})
