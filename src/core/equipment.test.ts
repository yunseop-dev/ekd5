// 장비/경제 코어 테스트 (v0.5~v0.6) — 장비 보정치·무구성장, 장착·상점 규칙, 열매, 전리품, 세이브 마이그레이션.
// 수치는 설계값이므로 절대값보다 "장비 보너스만큼 차이 난다"는 관계식으로 검증한다.

import { describe, expect, it } from 'vitest'
import { validateCampaign } from '../app/persistence'
import { EQUIPMENT } from '../data/equipment'
import { FRUIT_ON_SELL, FRUITS } from '../data/fruits'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import {
  applyAction,
  classOf,
  effectiveStats,
  equipInstanceBonus,
  expMultiplierOf,
  moveOf,
  movementRangeOf,
  startBattle,
} from './battle'
import type { CampaignState, RosterEntry } from './campaign'
import {
  applyVictory,
  avgRosterLevel,
  buyItem,
  canEquip,
  completeStory,
  equipItem,
  FRUIT_EXP_AMOUNT,
  FRUIT_STAT_BONUS,
  INITIAL_GOLD,
  newCampaign,
  sellItem,
  shopTierFor,
  toEquipInstance,
  toEquipmentMap,
  unequipItem,
  useFruit,
} from './campaign'
import { keyOf } from './movement'
import type {
  BattleState,
  EquipInstance,
  EquipmentInput,
  EquipmentMap,
  OfficerStats,
  StageDef,
  TerrainId,
  UnitState,
} from './types'
import {
  EQUIP_EXP_ON_HIT,
  EQUIP_EXP_PER_LEVEL,
  EQUIP_GROWTH_NORMAL,
  EQUIP_GROWTH_TREASURE,
  EQUIP_MAX_LEVEL_NORMAL,
  EQUIP_MAX_LEVEL_TREASURE,
} from './types'

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

/** 장비는 문자열 id로 간결히 쓰고(정의 표기) 인스턴스 정규화는 헬퍼가 맡는다 */
const entry = (officerId: string, level: number, equipment: EquipmentInput = {}): RosterEntry => ({
  officerId,
  level,
  exp: 0,
  equipment: toEquipmentMap(equipment),
  statBonus: {},
})

const unitOf = (state: BattleState, officerId: string): UnitState =>
  state.units.find((u) => u.officerId === officerId)!

/** 인스턴스 목록 → itemId 목록 (창고 비교용) */
const ids = (inventory: EquipInstance[]): string[] => inventory.map((i) => i.itemId)

/** 슬롯 맵 → 슬롯별 itemId (장착 비교용) */
const slotIds = (equipment: EquipmentMap): Record<string, string> =>
  Object.fromEntries(Object.entries(equipment).map(([slot, instance]) => [slot, instance!.itemId]))

/** 창고/군자금만 갈아끼운 캠페인 (노드는 서장 story 그대로).
 *  장착 로직 테스트의 전제를 단순하게 유지하려고 초기 장비(의천검 등)는 벗긴다. */
const withStock = (inventory: (string | EquipInstance)[], gold = INITIAL_GOLD): CampaignState => {
  const base = newCampaign()
  return {
    ...base,
    roster: base.roster.map((r) => ({ ...r, equipment: {} })),
    gold,
    inventory: inventory.map(toEquipInstance),
  }
}

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
    expect(Object.values(EQUIPMENT).filter((i) => i.isTreasure).length).toBe(5)
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
  const statsWith = (equipment: EquipmentInput) =>
    effectiveStats(unitOf(startBattle(mkStage(), 1, [entry('caocao', 3, equipment)]), 'caocao'))

  it('무기/방어구/보조구 보너스가 모두 합산된다', () => {
    const bare = statsWith({})
    const armed = statsWith({ weapon: 'woodSword', armor: 'leatherArmor', accessory: 'leatherShield' })
    expect(armed.atk).toBe(bare.atk + EQUIPMENT.woodSword.bonus.atk!)
    expect(armed.def).toBe(bare.def + EQUIPMENT.leatherArmor.bonus.def! + EQUIPMENT.leatherShield.bonus.def!)
    expect(armed.mind).toBe(bare.mind)
  })

  it('한 장비가 여러 능력치를 올릴 수 있다 (옷)', () => {
    const bare = statsWith({})
    const robed = statsWith({ armor: 'silkRobe' })
    expect(robed.def).toBe(bare.def + EQUIPMENT.silkRobe.bonus.def!)
    expect(robed.mind).toBe(bare.mind + EQUIPMENT.silkRobe.bonus.mind!)
  })

  it('미등록 장비 id는 조용히 무시된다 (데이터 개편 내성)', () => {
    expect(statsWith({ weapon: 'nonexistent' })).toEqual(statsWith({}))
  })

  // v0.6: 잡병도 병과 기본 무기를 지닌다 (원작 — 적 부대도 장비를 갖고 나온다)
  it('적 잡병은 기본 무기 1점만 지닌다 (방어구·보조구 없음)', () => {
    const state = startBattle(mkStage(), 1, [entry('caocao', 3, { weapon: 'ironSword' })])
    const enemy = unitOf(state, 'yellowInfantry')
    expect(slotIds(enemy.equipment)).toEqual({ weapon: 'woodSword' })
    expect(enemy.equipment.weapon).toEqual({ itemId: 'woodSword', level: 1, exp: 0 })
  })

  it('적 병과별 기본 무기가 착용 가능한 것으로 배정돼 있다', () => {
    const expected: Record<string, string> = {
      yellowInfantry: 'woodSword',
      yellowArcher: 'woodBow',
      yellowCavalry: 'woodSpear',
      yellowShaman: 'bambooFan',
    }
    for (const [officerId, itemId] of Object.entries(expected)) {
      expect(OFFICERS[officerId].initialEquipment?.weapon, officerId).toBe(itemId)
      expect(canEquip(officerId, itemId), officerId).toBe(true)
    }
  })

  it('적장도 장비를 지닌다 — 장각의 태평요술서는 격파 드랍(bossKill loot)과 일치', () => {
    const stage03 = STAGES.find((s) => s.id === 'stage03')!
    const state = startBattle(stage03, 1)
    const boss = state.units.find((u) => u.isBoss)!
    expect(boss.equipment.accessory?.itemId).toBe('taipingYaoshu')
    expect(stage03.loot).toEqual([{ trigger: 'bossKill', itemId: 'taipingYaoshu' }])
  })

  it('로스터 없는 전투(자유 전투)는 장수 initialEquipment을 쓴다', () => {
    const state = startBattle(mkStage(), 1)
    expect(slotIds(unitOf(state, 'caocao').equipment)).toEqual(OFFICERS.caocao.initialEquipment)
    // 정의는 문자열 id지만 전투 상태에서는 Lv1 인스턴스로 정규화된다
    expect(unitOf(state, 'caocao').equipment.weapon).toEqual({ itemId: 'yitianSword', level: 1, exp: 0 })
  })

  it('로스터의 장비 맵은 복사되어 전투 상태에 들어간다 (참조 공유 없음)', () => {
    const roster = [entry('caocao', 3, { weapon: 'woodSword' })]
    const state = startBattle(mkStage(), 1, roster)
    expect(slotIds(unitOf(state, 'caocao').equipment)).toEqual({ weapon: 'woodSword' })
    expect(unitOf(state, 'caocao').equipment).not.toBe(roster[0].equipment)
    expect(unitOf(state, 'caocao').equipment.weapon).not.toBe(roster[0].equipment.weapon)
  })
})

describe('moveOf', () => {
  const moveWith = (equipment: EquipmentInput) =>
    moveOf(unitOf(startBattle(mkStage(), 1, [entry('caocao', 3, equipment)]), 'caocao'))

  it('병과 이동력 + 장비 moveBonus', () => {
    const base = classOf(unitOf(startBattle(mkStage(), 1), 'caocao')).move
    expect(moveWith({})).toBe(base)
    expect(moveWith({ accessory: 'swiftHorse' })).toBe(base + 1) // 준마
  })

  it('이동범위 계산에 실제로 반영된다 (준마 = 한 칸 더)', () => {
    const rangeWith = (equipment: EquipmentInput) => {
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
  const expAfterAttack = (equipment: EquipmentInput): number => {
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
    const next = equipItem(withStock(['woodSword']), 'caocao', 0)
    expect(equipmentOf(next)).toEqual({ weapon: { itemId: 'woodSword', level: 1, exp: 0 } })
    expect(next.inventory).toEqual([])
  })

  it('같은 슬롯을 갈아끼우면 기존 장비가 창고로 돌아온다', () => {
    const first = equipItem(withStock(['woodSword', 'bronzeSword']), 'caocao', 0)
    expect(ids(first.inventory)).toEqual(['bronzeSword'])
    const second = equipItem(first, 'caocao', 0)
    expect(slotIds(equipmentOf(second))).toEqual({ weapon: 'bronzeSword' })
    expect(ids(second.inventory)).toEqual(['woodSword'])
  })

  it('서로 다른 슬롯은 공존한다', () => {
    let campaign = withStock(['woodSword', 'leatherArmor', 'leatherShield'])
    // 장착할 때마다 창고가 한 칸 줄어드니 언제나 맨 앞(0번)을 집으면 세 점이 차례로 들어간다
    for (let i = 0; i < 3; i++) campaign = equipItem(campaign, 'caocao', 0)
    expect(slotIds(equipmentOf(campaign))).toEqual({
      weapon: 'woodSword',
      armor: 'leatherArmor',
      accessory: 'leatherShield',
    })
    expect(campaign.inventory).toEqual([])
  })

  it('같은 종류를 2개 갖고 있으면 지목한 1개만 소모된다', () => {
    const next = equipItem(withStock(['woodSword', 'woodSword']), 'caocao', 0)
    expect(ids(next.inventory)).toEqual(['woodSword'])
  })

  it('같은 itemId라도 레벨이 다른 인스턴스를 인덱스로 구분한다 (무구성장 전제)', () => {
    const stock = withStock([
      { itemId: 'woodSword', level: 1, exp: 0 },
      { itemId: 'woodSword', level: 3, exp: 0 },
    ])
    const equipped = equipItem(stock, 'caocao', 1) // Lv3 쪽을 집는다
    expect(equipmentOf(equipped).weapon).toEqual({ itemId: 'woodSword', level: 3, exp: 0 })
    expect(equipped.inventory).toEqual([{ itemId: 'woodSword', level: 1, exp: 0 }])
  })

  it('범위 밖 인덱스 / 미등록 id / 로스터 밖 장수는 원본을 그대로 반환한다', () => {
    const campaign = withStock(['woodSword'])
    expect(equipItem(campaign, 'caocao', 1)).toBe(campaign)
    expect(equipItem(campaign, 'caocao', -1)).toBe(campaign)
    expect(equipItem(campaign, 'caocao', 1.5)).toBe(campaign)
    const bogus = withStock(['nonexistent'])
    expect(equipItem(bogus, 'caocao', 0)).toBe(bogus) // 미등록 id는 슬롯을 알 수 없다
    expect(equipItem(campaign, 'liubei', 0)).toBe(campaign)
  })

  it('해제하면 슬롯 키가 사라지고 창고로 돌아간다 (성장분 유지)', () => {
    const equipped = equipItem(withStock([{ itemId: 'woodSword', level: 2, exp: 50 }]), 'caocao', 0)
    const bare = unequipItem(equipped, 'caocao', 'weapon')
    expect(equipmentOf(bare)).toEqual({})
    expect(bare.inventory).toEqual([{ itemId: 'woodSword', level: 2, exp: 50 }])
  })

  it('빈 슬롯 / 없는 장수를 해제하면 원본 그대로', () => {
    const campaign = withStock([])
    expect(unequipItem(campaign, 'caocao', 'weapon')).toBe(campaign)
    expect(unequipItem(campaign, 'liubei', 'weapon')).toBe(campaign)
  })

  it('입력 캠페인을 변형하지 않는다', () => {
    const campaign = withStock(['woodSword'])
    const snapshot = JSON.stringify(campaign)
    const equipped = equipItem(campaign, 'caocao', 0)
    unequipItem(equipped, 'caocao', 'weapon')
    expect(JSON.stringify(campaign)).toBe(snapshot)
    expect(equipped.roster[0]).not.toBe(campaign.roster[0])
  })

  it('장착한 장비는 다음 전투의 유닛 능력치에 그대로 이어진다', () => {
    const campaign = equipItem(withStock(['ironSword']), 'caocao', 0)
    const state = startBattle(mkStage(), 1, campaign.roster)
    const bare = startBattle(mkStage(), 1, [entry('caocao', OFFICERS.caocao.level)])
    expect(effectiveStats(unitOf(state, 'caocao')).atk).toBe(
      effectiveStats(unitOf(bare, 'caocao')).atk + EQUIPMENT.ironSword.bonus.atk!,
    )
  })
})

// ---------- 병과별 착용 제한 (원작 확정 — docs/research/equipment.md §5) ----------

describe('병과별 착용 제한', () => {
  it('무기 카테고리 = 병과 1:1 매트릭스', () => {
    // 검=군주·중보병 / 창=경기병 / 활=궁병 / 부채=책사 / 보검=풍수사
    expect(canEquip('caocao', 'woodSword')).toBe(true) // 군주 ← 검
    expect(canEquip('dianwei', 'woodSword')).toBe(true) // 중보병 ← 검
    expect(canEquip('guojia', 'woodSword')).toBe(false) // 책사 ← 검 ✗
    expect(canEquip('xiahoudun', 'woodSpear')).toBe(true) // 경기병 ← 창
    expect(canEquip('caocao', 'woodSpear')).toBe(false) // 군주 ← 창 ✗
    expect(canEquip('xiahouyuan', 'woodBow')).toBe(true) // 궁병 ← 활
    expect(canEquip('guojia', 'bambooFan')).toBe(true) // 책사 ← 부채
    expect(canEquip('xunyu', 'bambooFan')).toBe(false) // 풍수사 ← 부채 ✗ (보검 전용)
    expect(canEquip('xunyu', 'stoneGemSword')).toBe(true) // 풍수사 ← 보검
    // 방어구: 갑옷=무관계 / 옷=문관계
    expect(canEquip('xiahoudun', 'leatherArmor')).toBe(true)
    expect(canEquip('guojia', 'leatherArmor')).toBe(false)
    expect(canEquip('guojia', 'clothRobe')).toBe(true)
    expect(canEquip('dianwei', 'clothRobe')).toBe(false)
    // 보조구는 전 병과
    expect(canEquip('guojia', 'leatherShield')).toBe(true)
    expect(canEquip('caocao', 'dilu')).toBe(true)
  })

  it('equipItem은 착용 불가 병과에 장착을 거부한다 (원본 반환)', () => {
    const campaign = withStock(['woodSword'])
    expect(equipItem(campaign, 'guojia', 0)).toBe(campaign)
    // 착용 가능 장수에게는 정상 장착
    expect(equipItem(campaign, 'dianwei', 0)).not.toBe(campaign)
  })

  it('세이브 정화: 규칙 강화 이전 세이브의 위반 장비는 창고로 이동한다', () => {
    const raw = JSON.parse(JSON.stringify(newCampaign())) as Record<string, unknown>
    const roster = raw.roster as { officerId: string; equipment: Record<string, string> }[]
    roster.find((r) => r.officerId === 'guojia')!.equipment = { weapon: 'woodSword' } // 위반
    roster.find((r) => r.officerId === 'dianwei')!.equipment = { weapon: 'woodSword' } // 정상
    const restored = validateCampaign(raw)!
    expect(restored.roster.find((r) => r.officerId === 'guojia')!.equipment.weapon).toBeUndefined()
    expect(restored.roster.find((r) => r.officerId === 'dianwei')!.equipment.weapon?.itemId).toBe('woodSword')
    expect(ids(restored.inventory)).toContain('woodSword')
  })
})

describe('초기 장비 (원작: 조조 = 의천검)', () => {
  it('newCampaign 로스터가 초기 장비로 시작하고 전투 능력치에 반영된다', () => {
    const campaign = newCampaign()
    const state = startBattle(mkStage(), 1, campaign.roster)
    const bare = startBattle(mkStage(), 1, [entry('caocao', OFFICERS.caocao.level)])
    expect(unitOf(state, 'caocao').equipment.weapon?.itemId).toBe('yitianSword')
    expect(effectiveStats(unitOf(state, 'caocao')).atk).toBe(
      effectiveStats(unitOf(bare, 'caocao')).atk + EQUIPMENT.yitianSword.bonus.atk!,
    )
  })

  it('전 장수의 초기 장비는 자기 병과가 착용 가능한 것이어야 한다 (데이터 정합)', () => {
    for (const [id, officer] of Object.entries(OFFICERS)) {
      for (const itemId of Object.values(officer.initialEquipment ?? {})) {
        expect(canEquip(id, itemId), `${id}: ${itemId}`).toBe(true)
      }
    }
  })
})

// ---------- 보물 고유 효과 (원작 확정 — docs/research/equipment.md §2) ----------

describe('보물 고유 효과', () => {
  it('적로: 진입 가능한 모든 지형의 소비 이동력이 1이 된다', () => {
    // (1,1) 남쪽에 숲(보병 코스트 2)과 강(진입 불가)을 심어 직접 비용 비교
    const stage = mkStage()
    stage.map.tiles[2][1] = 'forest' // (1,2)
    stage.map.tiles[3][1] = 'forest' // (1,3)
    stage.map.tiles[5][1] = 'river' // (1,5)
    const rangeWith = (equipment: EquipmentInput) => {
      const state = startBattle(stage, 1, [entry('caocao', 3, equipment)])
      return movementRangeOf(state, unitOf(state, 'caocao'))
    }
    const forest2 = keyOf({ x: 1, y: 3 })
    expect(rangeWith({}).get(forest2)?.cost).toBe(4) // 숲 2칸 = 2+2
    expect(rangeWith({ accessory: 'dilu' }).get(forest2)?.cost).toBe(2) // 전 칸 코스트 1
    // 진입 불가 지형(강)은 적로로도 불가
    expect(rangeWith({ accessory: 'dilu' }).has(keyOf({ x: 1, y: 5 }))).toBe(false)
  })

  it('태평요술서: 페이즈 시작 시 MP 10 회복 (최대치 캡)', () => {
    let state = startBattle(mkStage(), 1, [entry('caocao', 3, { accessory: 'taipingYaoshu' })])
    const before = unitOf(state, 'caocao')
    before.mp = 0
    state = applyAction(state, { type: 'endPhase' }) // → 적 페이즈
    state = applyAction(state, { type: 'endPhase' }) // → 턴 2 아군 페이즈 시작
    expect(unitOf(state, 'caocao').mp).toBe(10)
    // 최대치 초과 회복 없음
    unitOf(state, 'caocao').mp = unitOf(state, 'caocao').maxMp
    state = applyAction(state, { type: 'endPhase' })
    state = applyAction(state, { type: 'endPhase' })
    expect(unitOf(state, 'caocao').mp).toBe(unitOf(state, 'caocao').maxMp)
  })
})

// ---------- 상점 ----------

describe('buyItem / sellItem', () => {
  it('구매하면 가격만큼 군자금이 줄고 창고에 들어온다', () => {
    const next = buyItem(withStock([], 500), 'woodSword') // 300
    expect(next.gold).toBe(200)
    // 새로 산 장비는 언제나 Lv1 인스턴스로 창고에 들어온다
    expect(next.inventory).toEqual([{ itemId: 'woodSword', level: 1, exp: 0 }])
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

  it('판매는 반값이고 창고에서 지목한 1개만 빠진다', () => {
    const next = sellItem(withStock(['woodSword', 'woodSword'], 100), 0)
    expect(next.gold).toBe(100 + 150) // 300의 반값
    expect(ids(next.inventory)).toEqual(['woodSword'])
  })

  it('홀수 가격은 내림으로 반값 계산한다', () => {
    // 현재 데이터는 전부 짝수 가격 — 공식(내림) 자체를 고정한다
    const price = EQUIPMENT.leatherShield.price!
    expect(sellItem(withStock(['leatherShield'], 0), 0).gold).toBe(Math.trunc(price / 2))
  })

  it('반값은 레벨과 무관하게 기본가 기준이다 (만렙 3단계만 열매로 예외)', () => {
    const grown = withStock([{ itemId: 'bronzeSword', level: 3, exp: 0 }], 0)
    expect(sellItem(grown, 0).gold).toBe(Math.trunc(EQUIPMENT.bronzeSword.price! / 2))
    expect(sellItem(grown, 0).fruits).toEqual([]) // 2단계는 만렙이어도 열매가 안 나온다
  })

  it('보물은 판매할 수 없다 (원작 규칙)', () => {
    const campaign = withStock(['taipingYaoshu'], 0)
    expect(sellItem(campaign, 0)).toBe(campaign)
  })

  it('범위 밖 인덱스 / 장착 중인 장비는 팔리지 않는다', () => {
    const campaign = withStock(['woodSword'], 0)
    expect(sellItem(campaign, 1)).toBe(campaign)
    const equipped = equipItem(campaign, 'caocao', 0)
    expect(equipped.inventory).toEqual([])
    expect(sellItem(equipped, 0)).toBe(equipped)
  })

  it('매매는 입력 캠페인을 변형하지 않는다', () => {
    const campaign = withStock(['woodSword'], 500)
    const snapshot = JSON.stringify(campaign)
    buyItem(campaign, 'leatherArmor')
    sellItem(campaign, 0)
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
    expect(ids(next.inventory)).toEqual(['leatherShield'])
  })

  it("loot trigger 'bossKill'은 보스를 실제로 격파해야 들어온다", () => {
    const campaign = atFirstBattle()
    const stage = mkStage({ loot: [{ trigger: 'bossKill', itemId: 'taipingYaoshu' }] })

    const alive = startBattle(stage, 1, campaign.roster)
    expect(applyVictory(campaign, alive).inventory).toEqual([])

    const killed = startBattle(stage, 1, campaign.roster)
    unitOf(killed, 'yellowInfantry').hp = 0
    expect(ids(applyVictory(campaign, killed).inventory)).toEqual(['taipingYaoshu'])
  })

  it('전리품은 기존 창고 뒤에 덧붙고 미등록 id는 무시된다', () => {
    const campaign = { ...atFirstBattle(), inventory: [toEquipInstance('woodSword')] }
    const stage = mkStage({
      loot: [
        { trigger: 'victory', itemId: 'leatherShield' },
        { trigger: 'victory', itemId: 'nonexistent' },
      ],
    })
    expect(ids(applyVictory(campaign, startBattle(stage, 1, campaign.roster)).inventory)).toEqual([
      'woodSword',
      'leatherShield',
    ])
  })

  it('장비는 승리 결산에서 유지되고 원본은 변형되지 않는다', () => {
    const campaign = equipItem({ ...atFirstBattle(), inventory: [toEquipInstance('woodSword')] }, 'caocao', 0)
    const snapshot = JSON.stringify(campaign)
    const next = applyVictory(campaign, startBattle(mkStage(), 1, campaign.roster))
    const equipped = next.roster.find((r) => r.officerId === 'caocao')!.equipment
    expect(equipped.weapon?.itemId).toBe('woodSword') // 교체한 무기 유지
    expect(equipped.armor?.itemId).toBe('leatherArmor') // 초기 방어구도 유지
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

describe('validateCampaign — v1/v2 → v3 승계', () => {
  const v1Save = {
    version: 1,
    nodeId: 'n02',
    roster: [
      { officerId: 'caocao', level: 7, exp: 35 },
      { officerId: 'xiahoudun', level: 6, exp: 0 },
    ],
    clearedStages: ['stage01'],
  }

  it('v1 세이브를 거부하지 않고 v3로 승계한다', () => {
    const restored = validateCampaign(JSON.parse(JSON.stringify(v1Save)))!
    expect(restored).not.toBeNull()
    expect(restored.version).toBe(3)
    expect(restored.nodeId).toBe('n02')
    expect(restored.clearedStages).toEqual(['stage01'])
    // 성장치는 그대로 살리고, 없던 필드만 초기값으로 채운다
    expect(restored.roster).toEqual([
      { officerId: 'caocao', level: 7, exp: 35, equipment: {}, statBonus: {} },
      { officerId: 'xiahoudun', level: 6, exp: 0, equipment: {}, statBonus: {} },
    ])
    expect(restored.gold).toBe(INITIAL_GOLD)
    expect(restored.inventory).toEqual([])
    expect(restored.fruits).toEqual([])
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

  it('v3 라운드트립은 장비 인스턴스/군자금/창고/열매를 보존한다', () => {
    const campaign = buyItem(equipItem(withStock(['ironSword']), 'caocao', 0), 'leatherArmor')
    const grown = {
      ...campaign,
      roster: campaign.roster.map((r) =>
        r.officerId === 'caocao'
          ? { ...r, equipment: { weapon: { itemId: 'ironSword', level: 3, exp: 0 } }, statBonus: { str: 4 } }
          : r,
      ),
      fruits: ['strFruit', 'expFruit'],
    }
    const restored = validateCampaign(JSON.parse(JSON.stringify(grown)))
    expect(restored).toEqual(grown)
  })

  it('v2 세이브의 문자열 장비/창고를 Lv1 인스턴스로 승계한다', () => {
    const v2Save = {
      version: 2,
      nodeId: 'n02',
      roster: [{ officerId: 'caocao', level: 7, exp: 35, equipment: { weapon: 'ironSword', armor: 'leatherArmor' } }],
      clearedStages: ['stage01'],
      gold: 1234,
      inventory: ['woodSword', 'leatherShield'],
    }
    const restored = validateCampaign(v2Save)!
    expect(restored.version).toBe(3)
    expect(restored.roster[0].equipment).toEqual({
      weapon: { itemId: 'ironSword', level: 1, exp: 0 },
      armor: { itemId: 'leatherArmor', level: 1, exp: 0 },
    })
    expect(restored.roster[0].statBonus).toEqual({})
    expect(restored.inventory).toEqual([
      { itemId: 'woodSword', level: 1, exp: 0 },
      { itemId: 'leatherShield', level: 1, exp: 0 },
    ])
    expect(restored.gold).toBe(1234)
    expect(restored.fruits).toEqual([])
  })

  it('v2 승계 장비도 전투에서 그대로 쓰인다', () => {
    const restored = validateCampaign({
      version: 2,
      nodeId: 'n01',
      roster: [{ officerId: 'caocao', level: 3, exp: 0, equipment: { weapon: 'ironSword' } }],
      clearedStages: [],
      gold: 0,
      inventory: [],
    })!
    const state = startBattle(mkStage(), 1, restored.roster)
    const bare = startBattle(mkStage(), 1, [entry('caocao', 3)])
    expect(effectiveStats(unitOf(state, 'caocao')).atk).toBe(
      effectiveStats(unitOf(bare, 'caocao')).atk + EQUIPMENT.ironSword.bonus.atk!,
    )
  })

  it('필수 필드가 깨지면 null', () => {
    const base = newCampaign()
    expect(validateCampaign({ ...base, gold: 'x' })).toBeNull()
    expect(validateCampaign({ ...base, gold: Number.NaN })).toBeNull()
    expect(validateCampaign({ ...base, inventory: 'x' })).toBeNull()
    expect(validateCampaign({ ...base, inventory: [1] })).toBeNull()
    expect(validateCampaign({ ...base, fruits: [1] })).toBeNull()
    expect(validateCampaign({ ...base, fruits: 'x' })).toBeNull()
    expect(validateCampaign({ ...base, version: 4 })).toBeNull()
  })

  it('망가진 장비 맵은 세이브를 버리지 않고 해당 슬롯만 떨어낸다', () => {
    const base = newCampaign()
    const restored = validateCampaign({
      ...base,
      roster: [{ officerId: 'caocao', level: 3, exp: 0, equipment: { weapon: 'ironSword', armor: 42, bogus: 'x' } }],
    })!
    expect(restored.roster[0].equipment).toEqual({ weapon: { itemId: 'ironSword', level: 1, exp: 0 } })
  })

  it('망가진 인스턴스 레벨/경험치는 유효 범위로 조인다', () => {
    const base = newCampaign()
    const restored = validateCampaign({
      ...base,
      roster: [
        {
          officerId: 'caocao',
          level: 3,
          exp: 0,
          // 일반 장비 상한(Lv3) 초과 + 경험치 음수 + 보물 상한(Lv9) 초과
          equipment: {
            weapon: { itemId: 'woodSword', level: 99, exp: -5 },
            accessory: { itemId: 'dilu', level: 99, exp: 999 },
          },
          statBonus: { str: 2, bogus: 'x' },
        },
      ],
    })!
    expect(restored.roster[0].equipment.weapon).toEqual({
      itemId: 'woodSword',
      level: EQUIP_MAX_LEVEL_NORMAL,
      exp: 0,
    })
    expect(restored.roster[0].equipment.accessory!.level).toBe(EQUIP_MAX_LEVEL_TREASURE)
    expect(restored.roster[0].equipment.accessory!.exp).toBe(EQUIP_EXP_PER_LEVEL - 1)
    expect(restored.roster[0].statBonus).toEqual({ str: 2 })
  })

  it('착용 불가 장비를 창고로 되돌릴 때 성장분을 잃지 않는다', () => {
    const base = newCampaign()
    const restored = validateCampaign({
      ...base,
      roster: [{ officerId: 'guojia', level: 2, exp: 0, equipment: { weapon: { itemId: 'woodSword', level: 3, exp: 0 } } }],
    })!
    expect(restored.roster[0].equipment).toEqual({})
    expect(restored.inventory).toEqual([{ itemId: 'woodSword', level: 3, exp: 0 }])
  })
})

// ---------- 무구성장 (v0.6 — equipment.md §1~2) ----------

describe('equipInstanceBonus — 레벨 보정치', () => {
  it('일반 장비는 레벨당 +10 (Lv1 = 기본값)', () => {
    const base = EQUIPMENT.woodSword.bonus.atk!
    expect(equipInstanceBonus({ itemId: 'woodSword', level: 1, exp: 0 })).toEqual({ atk: base })
    expect(equipInstanceBonus({ itemId: 'woodSword', level: 2, exp: 0 })).toEqual({
      atk: base + EQUIP_GROWTH_NORMAL,
    })
    expect(equipInstanceBonus({ itemId: 'woodSword', level: 3, exp: 0 })).toEqual({
      atk: base + 2 * EQUIP_GROWTH_NORMAL,
    })
  })

  it('보물은 레벨당 +9, 만렙 Lv9 (원작: 초반 강력 → 만렙 상점템에 소폭 밀림)', () => {
    const base = EQUIPMENT.yitianSword.bonus.atk!
    expect(equipInstanceBonus({ itemId: 'yitianSword', level: 9, exp: 0 })).toEqual({
      atk: base + (EQUIP_MAX_LEVEL_TREASURE - 1) * EQUIP_GROWTH_TREASURE,
    })
    // ⚠ 원작 의도는 "만렙 보물 < 만렙 3단계 상점템"(88 vs 100)이지만, 우리 무기 곡선은 3단계가 55라
    // 만렙 의천검(88)이 만렙 철검(75)을 앞선다. 밸런스 재조정 시 건드릴 지점을 여기서 못박아 둔다.
    const yitian = equipInstanceBonus({ itemId: 'yitianSword', level: EQUIP_MAX_LEVEL_TREASURE, exp: 0 }).atk!
    const iron = equipInstanceBonus({ itemId: 'ironSword', level: EQUIP_MAX_LEVEL_NORMAL, exp: 0 }).atk!
    expect(yitian).toBe(EQUIPMENT.yitianSword.bonus.atk! + 8 * EQUIP_GROWTH_TREASURE)
    expect(iron).toBe(EQUIPMENT.ironSword.bonus.atk! + 2 * EQUIP_GROWTH_NORMAL)
    expect(yitian).toBeGreaterThan(iron)
  })

  it('성장 대상 능력치만 오른다 (옷은 방어만, 정신은 그대로)', () => {
    const lv3 = equipInstanceBonus({ itemId: 'silkRobe', level: 3, exp: 0 })
    expect(lv3.def).toBe(EQUIPMENT.silkRobe.bonus.def! + 2 * EQUIP_GROWTH_NORMAL)
    expect(lv3.mind).toBe(EQUIPMENT.silkRobe.bonus.mind!)
  })

  it('growthStat 없는 장비(보조구)는 레벨이 올라도 보정치가 그대로다', () => {
    expect(equipInstanceBonus({ itemId: 'leatherShield', level: 3, exp: 0 })).toEqual(EQUIPMENT.leatherShield.bonus)
    expect(equipInstanceBonus({ itemId: 'dilu', level: 9, exp: 0 })).toEqual(EQUIPMENT.dilu.bonus)
  })

  it('미등록 id는 빈 보정치, 상한 초과 레벨은 만렙으로 잘린다', () => {
    expect(equipInstanceBonus({ itemId: 'nonexistent', level: 3, exp: 0 })).toEqual({})
    expect(equipInstanceBonus({ itemId: 'woodSword', level: 99, exp: 0 })).toEqual(
      equipInstanceBonus({ itemId: 'woodSword', level: EQUIP_MAX_LEVEL_NORMAL, exp: 0 }),
    )
    expect(equipInstanceBonus({ itemId: 'woodSword', level: 0, exp: 0 })).toEqual(
      equipInstanceBonus({ itemId: 'woodSword', level: 1, exp: 0 }),
    )
  })

  it('effectiveStats가 레벨 보정치를 그대로 반영한다', () => {
    const atkAt = (level: number) => {
      const roster = [entry('caocao', 3, { weapon: { itemId: 'woodSword', level, exp: 0 } })]
      return effectiveStats(unitOf(startBattle(mkStage(), 1, roster), 'caocao')).atk
    }
    expect(atkAt(3) - atkAt(1)).toBe(2 * EQUIP_GROWTH_NORMAL)
  })
})

describe('무구성장 — 전투 훅', () => {
  /** 인접한 두 부대가 1회 교전. 아군은 무기+갑옷, 적(중보병 Lv5)은 기본 목검을 든다 */
  const clash = (seed: number, equipment: EquipmentInput) => {
    const state = startBattle(mkStage(), seed, [entry('caocao', 3, equipment)])
    const attacker = unitOf(state, 'caocao')
    const defender = unitOf(state, 'yellowInfantry')
    return applyAction(state, { type: 'attack', unitId: attacker.id, targetId: defender.id })
  }
  const count = (state: BattleState, types: string[]) => state.log.filter((e) => types.includes(e.type)).length
  /** 누적 장비 경험치 = (레벨-1) × 레벨당 필요치 + 잔여 */
  const growth = (instance?: EquipInstance) =>
    instance ? (instance.level - 1) * EQUIP_EXP_PER_LEVEL + instance.exp : 0

  const gear: EquipmentInput = { weapon: 'woodSword', armor: 'leatherArmor' }
  // 명중/미스는 순발력만 좌우하므로(장비는 순발력을 건드리지 않는다) 시드로 두 경우를 모두 잡을 수 있다
  const seedWhere = (wantHit: boolean): number => {
    for (let seed = 1; seed < 500; seed++) {
      const next = clash(seed, gear)
      const hit = count(next, ['hit', 'crit']) > 0
      if (hit === wantHit) return seed
    }
    throw new Error('해당 조건의 시드를 찾지 못했다')
  }

  it('명중 횟수만큼 공격자 무기와 피격자 방어구에 경험치가 쌓인다', () => {
    const next = clash(seedWhere(true), gear)
    const player = unitOf(next, 'caocao')
    const enemy = unitOf(next, 'yellowInfantry')
    const myHits = count(next, ['hit', 'crit']) // 아군 → 적 (2회 공격 포함)
    const counterHits = count(next, ['counterHit', 'counterCrit']) // 적 반격

    expect(myHits).toBeGreaterThan(0)
    expect(growth(player.equipment.weapon)).toBe(myHits * EQUIP_EXP_ON_HIT)
    expect(growth(enemy.equipment.weapon)).toBe(counterHits * EQUIP_EXP_ON_HIT)
    // 방어구는 "맞은 횟수"로 자란다 — 적은 방어구가 없으니 아군 갑옷만 오른다
    expect(growth(player.equipment.armor)).toBe(counterHits * EQUIP_EXP_ON_HIT)
  })

  it('빗나가면 아무 장비도 자라지 않는다 (원작: 빗나가면 거의 못 얻는다)', () => {
    const next = clash(seedWhere(false), gear)
    const player = unitOf(next, 'caocao')
    expect(count(next, ['miss'])).toBeGreaterThan(0)
    expect(count(next, ['hit', 'crit'])).toBe(0)
    expect(growth(player.equipment.weapon)).toBe(0)
  })

  it('보조구는 전투로 자라지 않는다 (성장 대상은 무기/방어구뿐)', () => {
    const next = clash(seedWhere(true), { ...gear, accessory: 'leatherShield' })
    expect(unitOf(next, 'caocao').equipment.accessory).toEqual({ itemId: 'leatherShield', level: 1, exp: 0 })
  })

  it('필요 경험치를 채우면 레벨업하고 로그가 남는다', () => {
    const almost = EQUIP_EXP_PER_LEVEL - EQUIP_EXP_ON_HIT
    const next = clash(seedWhere(true), { weapon: { itemId: 'yitianSword', level: 1, exp: almost } })
    const weapon = unitOf(next, 'caocao').equipment.weapon!
    expect(weapon.level).toBe(2)
    expect(weapon.exp).toBe(0)
    const event = next.log.find((e) => e.type === 'equipLevelUp')!
    expect(event.message).toBe('조조의 의천검이 Lv2가 되었다!')
  })

  it('만렙 장비는 더 자라지 않는다 (일반 Lv3 / 보물 Lv9)', () => {
    const maxed = clash(seedWhere(true), {
      weapon: { itemId: 'woodSword', level: EQUIP_MAX_LEVEL_NORMAL, exp: 0 },
      armor: { itemId: 'leatherArmor', level: EQUIP_MAX_LEVEL_NORMAL, exp: 0 },
    })
    expect(maxed.log.some((e) => e.type === 'equipLevelUp')).toBe(false)
    expect(unitOf(maxed, 'caocao').equipment.weapon).toEqual({
      itemId: 'woodSword',
      level: EQUIP_MAX_LEVEL_NORMAL,
      exp: 0,
    })
    // 보물은 Lv3에서 멈추지 않고 Lv9까지 자란다
    const treasure = clash(seedWhere(true), {
      weapon: { itemId: 'yitianSword', level: EQUIP_MAX_LEVEL_NORMAL, exp: EQUIP_EXP_PER_LEVEL - EQUIP_EXP_ON_HIT },
    })
    expect(unitOf(treasure, 'caocao').equipment.weapon!.level).toBe(EQUIP_MAX_LEVEL_NORMAL + 1)
  })

  it('미등록 장비 id는 성장 처리에서 조용히 무시된다', () => {
    const next = clash(seedWhere(true), { weapon: 'nonexistent' })
    expect(unitOf(next, 'caocao').equipment.weapon).toEqual({ itemId: 'nonexistent', level: 1, exp: 0 })
  })
})

describe('applyVictory — 무구성장 회수', () => {
  const atFirstBattle = () => completeStory(newCampaign())

  it('전투에서 오른 장비 레벨/경험치가 로스터로 돌아온다', () => {
    const campaign = atFirstBattle()
    const state = startBattle(mkStage(), 1, campaign.roster)
    const unit = unitOf(state, 'caocao')
    unit.equipment.weapon = { itemId: 'yitianSword', level: 4, exp: 50 }
    const next = applyVictory(campaign, state)
    expect(next.roster.find((r) => r.officerId === 'caocao')!.equipment.weapon).toEqual({
      itemId: 'yitianSword',
      level: 4,
      exp: 50,
    })
  })

  it('퇴각(hp 0)한 부대의 장비 성장도 회수한다 (퇴각은 사망이 아니다)', () => {
    const campaign = atFirstBattle()
    const state = startBattle(mkStage(), 1, campaign.roster)
    const unit = unitOf(state, 'caocao')
    unit.hp = 0
    unit.equipment.armor = { itemId: 'leatherArmor', level: 3, exp: 0 }
    const next = applyVictory(campaign, state)
    expect(next.roster.find((r) => r.officerId === 'caocao')!.equipment.armor).toEqual({
      itemId: 'leatherArmor',
      level: 3,
      exp: 0,
    })
  })

  it('출진하지 않은 부대의 장비는 손대지 않고, 로스터와 참조도 공유하지 않는다', () => {
    const campaign = atFirstBattle()
    const state = startBattle(mkStage(), 1, campaign.roster) // 조조만 출진하는 시험 스테이지
    const next = applyVictory(campaign, state)
    const before = campaign.roster.find((r) => r.officerId === 'dianwei')!.equipment
    const after = next.roster.find((r) => r.officerId === 'dianwei')!.equipment
    expect(after).toEqual(before)
    expect(after.weapon).not.toBe(before.weapon)
  })
})

// ---------- 능력치 열매 (원작 확정 규칙 — equipment.md §1) ----------

describe('FRUITS 데이터', () => {
  it('키와 id가 일치하고 설명이 비어 있지 않다', () => {
    for (const [key, fruit] of Object.entries(FRUITS)) {
      expect(fruit.id, key).toBe(key)
      expect(fruit.description.length, key).toBeGreaterThan(0)
    }
    expect(Object.keys(FRUITS).length).toBe(6) // 능력치 5종 + 경험
  })

  it('3단계 일반 장비는 전부 판매 열매가 정해져 있다', () => {
    for (const item of Object.values(EQUIPMENT)) {
      if (item.tier !== 3 || item.isTreasure) continue
      expect(FRUIT_ON_SELL[item.id], item.id).toBeDefined()
      expect(FRUITS[FRUIT_ON_SELL[item.id]], item.id).toBeDefined()
    }
  })

  it('성장 대상 능력치는 무기/방어구에만 붙어 있다', () => {
    for (const item of Object.values(EQUIPMENT)) {
      if (item.slot === 'accessory') expect(item.growthStat, item.id).toBeUndefined()
      else expect(item.growthStat, item.id).toBeDefined()
    }
  })
})

describe('sellItem — 만렙 3단계 장비는 열매가 나온다', () => {
  it('카테고리별 열매 매트릭스 (검→경험 / 창→무력 / 활→운 / 부채·보검→지력 / 갑옷→통솔 / 옷→민첩)', () => {
    const matrix: [string, string][] = [
      ['ironSword', 'expFruit'],
      ['ironSpear', 'strFruit'],
      ['ironBow', 'luckFruit'],
      ['ironFan', 'intFruit'],
      ['ironGemSword', 'intFruit'],
      ['ironArmor', 'ldrFruit'],
      ['battleRobe', 'agiFruit'],
    ]
    for (const [itemId, fruitId] of matrix) {
      const campaign = withStock([{ itemId, level: EQUIP_MAX_LEVEL_NORMAL, exp: 0 }], 0)
      const next = sellItem(campaign, 0)
      expect(next.fruits, itemId).toEqual([fruitId])
      expect(next.gold, itemId).toBe(0) // 열매가 나오면 골드는 안 준다
      expect(next.inventory, itemId).toEqual([])
    }
  })

  it('만렙이 아니면 3단계 장비도 반값 골드로 팔린다', () => {
    for (const level of [1, 2]) {
      const next = sellItem(withStock([{ itemId: 'ironSword', level, exp: 0 }], 0), 0)
      expect(next.fruits).toEqual([])
      expect(next.gold).toBe(Math.trunc(EQUIPMENT.ironSword.price! / 2))
    }
  })

  it('열매는 기존 보유분 뒤에 덧붙는다', () => {
    const campaign = { ...withStock([{ itemId: 'ironArmor', level: 3, exp: 0 }], 0), fruits: ['strFruit'] }
    expect(sellItem(campaign, 0).fruits).toEqual(['strFruit', 'ldrFruit'])
  })
})

describe('useFruit', () => {
  const withFruits = (fruits: string[]): CampaignState => ({ ...newCampaign(), fruits })
  const rosterOf = (campaign: CampaignState, officerId = 'caocao') =>
    campaign.roster.find((r) => r.officerId === officerId)!

  it('능력치 열매는 장수 능력치를 +2 올리고 소모된다', () => {
    const next = useFruit(withFruits(['strFruit']), 'caocao', 0)
    expect(rosterOf(next).statBonus).toEqual({ str: FRUIT_STAT_BONUS })
    expect(next.fruits).toEqual([])
  })

  it('같은 열매를 여러 개 먹으면 누적된다', () => {
    let campaign = withFruits(['strFruit', 'strFruit', 'agiFruit'])
    campaign = useFruit(campaign, 'caocao', 0)
    campaign = useFruit(campaign, 'caocao', 0)
    campaign = useFruit(campaign, 'caocao', 0)
    expect(rosterOf(campaign).statBonus).toEqual({ str: 2 * FRUIT_STAT_BONUS, agi: FRUIT_STAT_BONUS })
    expect(campaign.fruits).toEqual([])
  })

  it('열매 5종이 각자 다른 능력치를 올린다', () => {
    const pairs: [string, keyof OfficerStats][] = [
      ['strFruit', 'str'],
      ['ldrFruit', 'ldr'],
      ['intFruit', 'int'],
      ['agiFruit', 'agi'],
      ['luckFruit', 'luck'],
    ]
    for (const [fruitId, stat] of pairs) {
      const next = useFruit(withFruits([fruitId]), 'caocao', 0)
      expect(rosterOf(next).statBonus, fruitId).toEqual({ [stat]: FRUIT_STAT_BONUS })
    }
  })

  it('능력치 +2는 부대 능력치 +1로 반영된다 (원작: 부대 초기치 = 장수 능력치 ÷ 2)', () => {
    const before = effectiveStats(unitOf(startBattle(mkStage(), 1, [entry('caocao', 3)]), 'caocao'))
    const boosted = useFruit(withFruits(['strFruit']), 'caocao', 0)
    const grownEntry = { ...rosterOf(boosted), equipment: {} }
    const after = effectiveStats(unitOf(startBattle(mkStage(), 1, [grownEntry]), 'caocao'))
    expect(after.atk).toBe(before.atk + 1)
    expect(after.def).toBe(before.def)
  })

  it('경험의 열매는 경험치 +50 (레벨업 포함)', () => {
    const base = withFruits(['expFruit', 'expFruit'])
    const once = useFruit(base, 'caocao', 0)
    expect(rosterOf(once).exp).toBe(FRUIT_EXP_AMOUNT)
    expect(rosterOf(once).level).toBe(rosterOf(base).level)
    // 두 번째 열매로 100을 넘겨 레벨업
    const twice = useFruit(once, 'caocao', 0)
    expect(rosterOf(twice).level).toBe(rosterOf(base).level + 1)
    expect(rosterOf(twice).exp).toBe(0)
    expect(rosterOf(twice).statBonus).toEqual({})
  })

  it('인덱스로 지목한 열매만 소모된다', () => {
    const next = useFruit(withFruits(['strFruit', 'intFruit', 'luckFruit']), 'caocao', 1)
    expect(next.fruits).toEqual(['strFruit', 'luckFruit'])
    expect(rosterOf(next).statBonus).toEqual({ int: FRUIT_STAT_BONUS })
  })

  it('범위 밖 인덱스 / 미등록 열매 / 로스터 밖 장수는 원본 그대로', () => {
    const campaign = withFruits(['strFruit'])
    expect(useFruit(campaign, 'caocao', 1)).toBe(campaign)
    expect(useFruit(campaign, 'caocao', -1)).toBe(campaign)
    expect(useFruit(campaign, 'liubei', 0)).toBe(campaign)
    expect(useFruit(withFruits(['nonexistent']), 'caocao', 0).fruits).toEqual(['nonexistent'])
  })

  it('다른 장수의 보정치는 건드리지 않고 입력도 변형하지 않는다', () => {
    const campaign = withFruits(['strFruit'])
    const snapshot = JSON.stringify(campaign)
    const next = useFruit(campaign, 'caocao', 0)
    expect(rosterOf(next, 'dianwei').statBonus).toEqual({})
    expect(JSON.stringify(campaign)).toBe(snapshot)
  })

  it('열매 보정은 세이브를 통과해 살아남는다', () => {
    const campaign = useFruit(withFruits(['luckFruit']), 'dianwei', 0)
    const restored = validateCampaign(JSON.parse(JSON.stringify(campaign)))!
    expect(rosterOf(restored, 'dianwei').statBonus).toEqual({ luck: FRUIT_STAT_BONUS })
  })
})
