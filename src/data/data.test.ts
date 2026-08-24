// v1.2 원작 정합 데이터 확장의 정합성 테스트 — 지형 교정 / 1부 보물 16종 / 신규 장수 21명 /
// 광역 화계 화염 잔존. 코어 로직 테스트는 src/core/*.test.ts가 담당하고, 이 파일은 **데이터 단정**만 한다.

import { describe, expect, it } from 'vitest'
import { canEquipClass } from '../core/campaign'
import { CLASSES } from './classes'
import { EQUIPMENT } from './equipment'
import { OFFICERS } from './officers'
import { STRATEGIES } from './strategies'
import { TERRAIN } from './terrain'

// ---------- 지형 (원작 확정치 교정) ----------

describe('TERRAIN — 기병 지형 성능 (원작 확정)', () => {
  it('숲 90 / 마을(가옥) 90 / 여울 80', () => {
    expect(TERRAIN.forest.effect.horse).toBe(90)
    expect(TERRAIN.village.effect.horse).toBe(90)
    expect(TERRAIN.ford.effect.horse).toBe(80)
  })

  it('교정은 기병에만 적용된다 — 다른 이동 프로필과 회복은 그대로다', () => {
    expect(TERRAIN.forest.effect.foot).toBe(105)
    expect(TERRAIN.village.effect.foot).toBe(110)
    expect(TERRAIN.village.effect.wheel).toBe(110)
    expect(TERRAIN.village.healPerTurn).toBe(20) // 매턴 최대 HP 20% 회복 유지
    expect(TERRAIN.mountain.effect.horse).toBe(80) // 산지는 악지 그대로
    expect(TERRAIN.plain.effect.horse).toBe(110)
  })

  it('여울은 차량만 진입 불가하고 보행·기마는 소비 2다', () => {
    expect(TERRAIN.ford.cost).toEqual({ foot: 2, horse: 2, wheel: null, mage: 2 })
  })
})

// ---------- 장비 (v1.2 신규 20종) ----------

const NEW_SHOP_ACCESSORIES = ['namelessGauntlet', 'leatherHelm', 'bronzeHelm', 'bronzeShield'] as const

const NEW_TREASURES = [
  'blackRobe',
  'flyingDragonRobe',
  'phoenixRobe',
  'silverArmor',
  'chainArmor',
  'leatherHorseArmor',
  'goldenArmor',
  'holySword',
  'serpentSpear',
  'lüBuBow',
  'gudingDao',
  'bashoFan',
  'moYuJian',
  'fuJin',
  'jueYing',
  'windWheel',
] as const

/** 1차 병과 id 집합 — EQUIPMENT.classes는 반드시 계열 루트(lineage) id로 적혀야 한다 */
const LINEAGE_IDS = Object.values(CLASSES)
  .filter((c) => c.lineage === c.id)
  .map((c) => c.id)

describe('EQUIPMENT — v1.2 신규 20종', () => {
  it('20종이 모두 정의돼 있고 상점템 4종 / 보물 16종으로 갈린다', () => {
    for (const id of [...NEW_SHOP_ACCESSORIES, ...NEW_TREASURES]) {
      expect(EQUIPMENT[id], id).toBeDefined()
    }
    for (const id of NEW_SHOP_ACCESSORIES) {
      expect(EQUIPMENT[id].isTreasure, id).toBeUndefined()
      expect(EQUIPMENT[id].price, id).not.toBeNull()
      expect(EQUIPMENT[id].slot, id).toBe('accessory')
    }
    for (const id of NEW_TREASURES) {
      expect(EQUIPMENT[id].isTreasure, id).toBe(true)
      expect(EQUIPMENT[id].price, id).toBeNull() // 보물은 판매 불가·비매품
    }
  })

  it('classes는 실제 계열(lineage) id만 쓴다', () => {
    for (const item of Object.values(EQUIPMENT)) {
      for (const classId of item.classes ?? []) {
        expect(LINEAGE_IDS, `${item.id}: ${classId}`).toContain(classId)
      }
    }
  })

  it('신규 장비도 착용 판정이 계열 단위로 통한다 (승급 후에도 유지)', () => {
    expect(canEquipClass('geomancer', 'bashoFan')).toBe(true)
    expect(canEquipClass('seniorGeomancer', 'bashoFan')).toBe(true)
    expect(canEquipClass('strategist', 'bashoFan')).toBe(false)
    expect(canEquipClass('archer', 'lüBuBow')).toBe(true)
    expect(canEquipClass('crossbowman', 'lüBuBow')).toBe(true)
    expect(canEquipClass('lightCavalry', 'serpentSpear')).toBe(true)
    expect(canEquipClass('heavyCavalry', 'leatherHorseArmor')).toBe(true)
    expect(canEquipClass('counselor', 'phoenixRobe')).toBe(true)
    // 병과 제한 없는 보물은 누구나 (황금갑옷)
    expect(EQUIPMENT.goldenArmor.classes).toBeUndefined()
    expect(canEquipClass('archer', 'goldenArmor')).toBe(true)
  })

  it('성장 규칙: 무기·방어구는 성장하고 보조구는 성장하지 않는다', () => {
    for (const id of NEW_TREASURES) {
      const item = EQUIPMENT[id]
      if (item.slot === 'accessory') expect(item.growthStat, id).toBeUndefined()
      else expect(item.growthStat, id).toBeDefined()
    }
    expect(EQUIPMENT.holySword.growthStat).toBe('atk')
    expect(EQUIPMENT.bashoFan.growthStat).toBe('mind')
    expect(EQUIPMENT.phoenixRobe.growthStat).toBe('def')
  })

  it('보물 기본치는 같은 계열 3단계 상점템을 넘지 않는다 (원작: 만렙 상점템에 소폭 밀림)', () => {
    const cap: [string, string, 'atk' | 'def' | 'mind'][] = [
      ['holySword', 'ironSword', 'atk'],
      ['gudingDao', 'ironSword', 'atk'],
      ['serpentSpear', 'ironSpear', 'atk'],
      ['lüBuBow', 'ironBow', 'atk'],
      ['bashoFan', 'ironFan', 'mind'],
      ['silverArmor', 'ironArmor', 'def'],
      ['chainArmor', 'ironArmor', 'def'],
      ['goldenArmor', 'ironArmor', 'def'],
      ['leatherHorseArmor', 'ironArmor', 'def'],
      ['phoenixRobe', 'ironArmor', 'def'],
    ]
    for (const [treasure, shopTop, stat] of cap) {
      expect(EQUIPMENT[treasure].bonus[stat] ?? 0, treasure).toBeLessThanOrEqual(
        EQUIPMENT[shopTop].bonus[stat] ?? 0,
      )
    }
  })

  it('특수 효과 4종 — 사모 관통 / 여포궁 포박 / 절영 이동 / 성자보검 정신 (원작 확정)', () => {
    expect(EQUIPMENT.serpentSpear.pierceBack).toBe(true)
    expect(EQUIPMENT.lüBuBow.onHitStatus).toBe('immobile')
    // 원작 확정: 절영 +1 / 바람바퀴 +2 (thewiki·biglobe 독립 2소스 일치 — kr-blog §R5)
    expect(EQUIPMENT.jueYing.moveBonus).toBe(1)
    expect(EQUIPMENT.windWheel.moveBonus).toBe(2)
    expect(EQUIPMENT.holySword.bonus.mind).toBe(10)
    // 몰우전 — 근접 병과에 원거리 공격 부여 (v1.3에서 엔진 반영 — effectiveAttackRanges)
    expect(EQUIPMENT.moYuJian.rangedAttack).toBe(true)
    // 특수 효과는 지정된 장비에만 붙는다
    expect(Object.values(EQUIPMENT).filter((i) => i.pierceBack).map((i) => i.id)).toEqual(['serpentSpear'])
    expect(Object.values(EQUIPMENT).filter((i) => i.onHitStatus).map((i) => i.id)).toEqual(['lüBuBow'])
    expect(Object.values(EQUIPMENT).filter((i) => i.rangedAttack).map((i) => i.id)).toEqual(['moYuJian'])
  })

  it('v1.3 특수효과 필드 — 최대 HP/MP·책략·원거리·회심·회피·명중 (kr-blog §R5 확정)', () => {
    // 최대 HP/MP 가산
    expect(EQUIPMENT.leatherHelm.maxHpBonus).toBe(15)
    expect(EQUIPMENT.bronzeHelm.maxHpBonus).toBe(30)
    expect(EQUIPMENT.fuJin.maxMpBonus).toBe(15)
    expect(EQUIPMENT.guanJin.maxMpBonus).toBe(30)
    expect(EQUIPMENT.blackRobe.maxMpBonus).toBe(20)
    // 매턴 회복
    expect(EQUIPMENT.phoenixRobe.hpRegenPercent).toBe(20)
    // 회심/연속공격 방어
    expect(EQUIPMENT.goldenArmor.critImmune).toBe(true)
    expect(EQUIPMENT.chainArmor.secondHitEvade).toBe(true)
    // 책략/원거리 피해 감소
    expect(EQUIPMENT.silverArmor.strategyDamageScale).toBe(0.5)
    expect(EQUIPMENT.leatherHorseArmor.rangedDamageScale).toBe(0.7)
    expect(EQUIPMENT.bronzeHorseArmor.rangedDamageScale).toBe(0.5)
    // 명중/회피 보정
    expect(EQUIPMENT.namelessGauntlet.hitBonus).toBe(10)
    expect(EQUIPMENT.leatherShield.evadeBonus).toBe(10)
    expect(EQUIPMENT.bronzeShield.evadeBonus).toBe(15)
    // 특정 필드는 해당 장비에만 붙는다
    expect(Object.values(EQUIPMENT).filter((i) => i.critImmune).map((i) => i.id)).toEqual(['goldenArmor'])
    expect(Object.values(EQUIPMENT).filter((i) => i.secondHitEvade).map((i) => i.id)).toEqual(['chainArmor'])
    expect(Object.values(EQUIPMENT).filter((i) => i.strategyDamageScale).map((i) => i.id)).toEqual(['silverArmor'])
  })
})

// ---------- 장수 (v1.2 신규 21명) ----------

const NEW_OFFICERS = [
  'xianDi',
  'liJue',
  'guoSi',
  'xuRong',
  'xuHuang',
  'manChong',
  'zhangXiu',
  'jiaXu',
  'huCheEr',
  'yuanShu',
  'sunJian',
  'sunCe',
  'caoAnMin',
  'zouShi',
  'fuHao',
  'weiInfantry',
  'weiCavalry',
  'huaiInfantry',
  'huaiArcher',
  'jingInfantry',
  'jingCavalry',
] as const

describe('OFFICERS — v1.2 신규 21명', () => {
  it('전원 정의돼 있고 키와 id가 일치한다', () => {
    for (const id of NEW_OFFICERS) {
      expect(OFFICERS[id], id).toBeDefined()
      expect(OFFICERS[id].id, id).toBe(id)
      expect(OFFICERS[id].name.length, id).toBeGreaterThan(0)
    }
    expect(new Set(NEW_OFFICERS).size).toBe(21)
  })

  it('전 장수의 능력치는 짝수다 (원작 관례: 부대치 × 2)', () => {
    for (const [id, officer] of Object.entries(OFFICERS)) {
      for (const [stat, value] of Object.entries(officer.stats)) {
        expect(value % 2, `${id}.${stat} = ${value}`).toBe(0)
      }
    }
  })

  it('전 장수의 병과와 레벨이 유효하다', () => {
    for (const [id, officer] of Object.entries(OFFICERS)) {
      expect(CLASSES[officer.classId], `${id}: ${officer.classId}`).toBeDefined()
      expect(officer.level, id).toBeGreaterThanOrEqual(1)
    }
  })

  it('헌제는 비무장이고, 대사 전용 2인도 장비를 들지 않는다', () => {
    for (const id of ['xianDi', 'zouShi', 'fuHao'] as const) {
      expect(OFFICERS[id].initialEquipment, id).toBeUndefined()
    }
    // 원작 확정: 무력 36(전 장수 최하급) · 운 100(전 장수 최고) — 싸우지 않고 살아남는 천자
    expect(OFFICERS.xianDi.stats).toEqual({ str: 36, ldr: 64, int: 76, agi: 58, luck: 100 })
  })

  it('원작 확정 능력치 — 주력 5인 + v1.2 신규 (kr-blog §R2)', () => {
    expect(OFFICERS.caocao.stats).toEqual({ str: 82, ldr: 98, int: 92, agi: 80, luck: 84 })
    expect(OFFICERS.dianwei.stats).toEqual({ str: 100, ldr: 76, int: 52, agi: 98, luck: 68 })
    expect(OFFICERS.xiahoudun.stats).toEqual({ str: 98, ldr: 82, int: 64, agi: 90, luck: 66 })
    expect(OFFICERS.xiahouyuan.stats).toEqual({ str: 92, ldr: 80, int: 62, agi: 66, luck: 78 })
    expect(OFFICERS.huaXiong.stats).toEqual({ str: 90, ldr: 82, int: 38, agi: 56, luck: 54 })
    expect(OFFICERS.xuHuang.stats).toEqual({ str: 92, ldr: 90, int: 56, agi: 78, luck: 96 })
    expect(OFFICERS.jiaXu.stats.int).toBe(96)
    expect(OFFICERS.jiaXu.classId).toBe('counselor') // 원작 도사계 미구현 — 방해 책략 실사용을 택했다
    // 호거아는 무력형이 아니라 **순발 92 · 지력 26**의 극단형이다 (전위의 무기를 훔쳐낸 인물)
    expect(OFFICERS.huCheEr.stats.agi).toBe(92)
    expect(OFFICERS.huCheEr.stats.int).toBe(26)
    expect(OFFICERS.sunJian.stats.str).toBe(92)
    expect(OFFICERS.sunCe.classId).toBe('lord') // 원작 군주계
    expect(OFFICERS.yuanShu.classId).toBe('lightCavalry') // 원작 기병계 — 군주계가 아니다
    // 원술은 "그릇이 안 되는 군주" — 로스터 군주들보다 통솔이 낮다
    expect(OFFICERS.yuanShu.stats.ldr).toBeLessThan(OFFICERS.liuBei.stats.ldr)
    expect(OFFICERS.yuanShu.stats.ldr).toBeLessThan(OFFICERS.caocao.stats.ldr)
  })

  it('제네릭 잡병 6종은 낮은 레벨로 정의된다 (스테이지에서 level 오버라이드)', () => {
    const mobs = ['weiInfantry', 'weiCavalry', 'huaiInfantry', 'huaiArcher', 'jingInfantry', 'jingCavalry'] as const
    for (const id of mobs) {
      expect(OFFICERS[id].level, id).toBeLessThanOrEqual(4)
      expect(OFFICERS[id].initialEquipment?.weapon, id).toBeDefined() // 잡병도 병과 기본 무기를 지닌다
    }
  })
})

// ---------- 책략 (광역 화계 화염 잔존) ----------

describe('STRATEGIES — 화계 화염 잔존 (v1.2)', () => {
  it('화진·화룡만 화염 잔불(2턴)을 남긴다', () => {
    expect(STRATEGIES.hwajin.hazard).toEqual({ duration: 2 })
    expect(STRATEGIES.hwaryong.hazard).toEqual({ duration: 2 })
    // 단일 화계는 잔존 없음
    expect(STRATEGIES.choyeol.hazard).toBeUndefined()
    expect(STRATEGIES.eophwa.hazard).toBeUndefined()
    expect(Object.values(STRATEGIES).filter((s) => s.hazard).map((s) => s.id).sort()).toEqual([
      'hwajin',
      'hwaryong',
    ])
  })

  it('hazard는 광역(십자) 화계에만 붙는다', () => {
    for (const s of Object.values(STRATEGIES)) {
      if (!s.hazard) continue
      expect(s.element, s.id).toBe('fire')
      expect(s.area, s.id).toBe('cross')
    }
  })
})
