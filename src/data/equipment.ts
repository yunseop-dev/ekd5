// 장비/보물 정의 — 조조전 아이템 시스템 (docs/research/caocao.md §6)
// 슬롯 3개(무기/방어구/보조구) + 상점 3단계 해금(나무→구리→철) + 비매품 보물.
//
// 수치는 원작 조사(docs/research/equipment.md) 기반 보정 완료:
//   무기 곡선 1:3:5.5 (원작 10/45/80의 1:4.5:8을 무구성장 부재에 맞춰 완만화),
//   창 +5% / 활 -15% 계열 오프셋, 방어구 = 무기 동급, 옷 = -12% + 정신 혼합.
//   보물: 청강검 = tier2~3 사이(초반 강력, 최종 상점템에 소폭 밀림 — 원작 구도),
//   적로 = 전 지형 코스트 1, 태평요술서 = 매턴 MP 10 (둘 다 원작 확정 효과).
//
// v0.6: 무구성장 도입 — bonus는 Lv1 기준값이고, growthStat에 레벨당 +10(보물 +9)이 얹힌다.
//   성장 대상은 원작대로 무기/방어구뿐이다(보조구는 growthStat 없음 = 성장하지 않음).
//   3단계 일반 장비는 Lv3에 팔면 능력치 열매가 나온다 → data/fruits.ts FRUIT_ON_SELL.
//
// v1.2: 보조구 소품 4종(장갑·투구·구리방패) + **1부 보물 16종** 추가 — 아래 보물 블록 주석 참조.
//   보물의 tier는 상점 해금과 무관한 강도 등급 표기다(의천검 tier1 선례).

import type { EquipmentDef } from '../core/types'

export const EQUIPMENT: Record<string, EquipmentDef> = {
  // ---------- 무기: 검 (군주·보병 계열 범용) ----------
  woodSword: {
    id: 'woodSword',
    name: '목검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    bonus: { atk: 10 },
    price: 300,
    tier: 1,
    growthStat: 'atk',
    description: '수련용 나무 검. 없는 것보다는 낫다.',
  },
  bronzeSword: {
    id: 'bronzeSword',
    name: '동검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    bonus: { atk: 30 },
    price: 800,
    tier: 2,
    growthStat: 'atk',
    description: '청동을 벼려 만든 검. 관군의 표준 장비다.',
  },
  ironSword: {
    id: 'ironSword',
    name: '철검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    bonus: { atk: 55 },
    price: 2000,
    tier: 3,
    growthStat: 'atk',
    description: '단단한 철검. 명장의 손에서 위력을 발한다.',
  },

  // ---------- 무기: 창 (검보다 공격력 우위, 값이 비싸다) ----------
  woodSpear: {
    id: 'woodSpear',
    name: '목창',
    slot: 'weapon',
    classes: ['lightCavalry'],
    bonus: { atk: 11 },
    price: 350,
    tier: 1,
    growthStat: 'atk',
    description: '끝을 깎아 세운 나무 창. 길이가 곧 무기다.',
  },
  bronzeSpear: {
    id: 'bronzeSpear',
    name: '동창',
    slot: 'weapon',
    classes: ['lightCavalry'],
    bonus: { atk: 32 },
    price: 900,
    tier: 2,
    growthStat: 'atk',
    description: '청동 창날을 물린 장병기.',
  },
  ironSpear: {
    id: 'ironSpear',
    name: '철창',
    slot: 'weapon',
    classes: ['lightCavalry'],
    bonus: { atk: 58 },
    price: 2200,
    tier: 3,
    growthStat: 'atk',
    description: '철제 창날이 갑옷을 꿰뚫는다.',
  },

  // ---------- 무기: 활 (궁병 전용 성향 — 검과 창 사이) ----------
  woodBow: {
    id: 'woodBow',
    name: '목궁',
    slot: 'weapon',
    classes: ['archer'],
    bonus: { atk: 9 },
    price: 320,
    tier: 1,
    growthStat: 'atk',
    description: '나무를 휘어 만든 단궁.',
  },
  bronzeBow: {
    id: 'bronzeBow',
    name: '동궁',
    slot: 'weapon',
    classes: ['archer'],
    bonus: { atk: 26 },
    price: 850,
    tier: 2,
    growthStat: 'atk',
    description: '동으로 보강한 활. 시위가 묵직하다.',
  },
  ironBow: {
    id: 'ironBow',
    name: '철궁',
    slot: 'weapon',
    classes: ['archer'],
    bonus: { atk: 47 },
    price: 2100,
    tier: 3,
    growthStat: 'atk',
    description: '철궁. 화살이 방패를 뚫고 지나간다.',
  },

  // ---------- 무기: 부채 (책사·풍수사 — 공격력이 아니라 정신력) ----------
  bambooFan: {
    id: 'bambooFan',
    name: '죽선',
    slot: 'weapon',
    classes: ['strategist'],
    bonus: { mind: 10 },
    price: 400,
    tier: 1,
    growthStat: 'mind',
    description: '대나무 살로 엮은 부채. 책략의 기운을 모은다.',
  },
  whiteFeatherFan: {
    id: 'whiteFeatherFan',
    name: '백우선',
    slot: 'weapon',
    classes: ['strategist'],
    bonus: { mind: 28 },
    price: 1000,
    tier: 2,
    growthStat: 'mind',
    description: '흰 깃털 부채. 군사의 위엄이 서려 있다.',
  },
  ironFan: {
    id: 'ironFan',
    name: '철선',
    slot: 'weapon',
    classes: ['strategist'],
    bonus: { mind: 52 },
    price: 2200,
    tier: 3,
    growthStat: 'mind',
    description: '철살을 물린 부채. 부치면 바람이 칼처럼 인다.',
  },

  // ---------- 무기: 보검 (풍수사 — 원작은 도사·풍수사 전용, equipment.md §5) ----------
  stoneGemSword: {
    id: 'stoneGemSword',
    name: '돌보검',
    slot: 'weapon',
    classes: ['geomancer'],
    bonus: { mind: 10 },
    price: 400,
    tier: 1,
    growthStat: 'mind',
    description: '돌을 갈아 만든 의식용 보검. 기를 다스린다.',
  },
  bronzeGemSword: {
    id: 'bronzeGemSword',
    name: '구리보검',
    slot: 'weapon',
    classes: ['geomancer'],
    bonus: { mind: 26 },
    price: 950,
    tier: 2,
    growthStat: 'mind',
    description: '구리로 벼린 보검. 풍수의 힘이 깃든다.',
  },
  ironGemSword: {
    id: 'ironGemSword',
    name: '철보검',
    slot: 'weapon',
    classes: ['geomancer'],
    bonus: { mind: 47 },
    price: 2100,
    tier: 3,
    growthStat: 'mind',
    description: '철을 벼려 만든 보검. 기가 칼끝에 모인다.',
  },

  // ---------- 방어구: 갑옷 (무관계) ----------
  leatherArmor: {
    id: 'leatherArmor',
    name: '가죽 갑옷',
    slot: 'armor',
    classes: ['lord', 'heavyInfantry', 'lightCavalry', 'archer'],
    bonus: { def: 10 },
    price: 340,
    tier: 1,
    growthStat: 'def',
    description: '무두질한 가죽 갑옷. 가볍고 값이 싸다.',
  },
  bronzeArmor: {
    id: 'bronzeArmor',
    name: '동 갑옷',
    slot: 'armor',
    classes: ['lord', 'heavyInfantry', 'lightCavalry', 'archer'],
    bonus: { def: 30 },
    price: 880,
    tier: 2,
    growthStat: 'def',
    description: '청동 비늘을 덧댄 갑옷.',
  },
  ironArmor: {
    id: 'ironArmor',
    name: '철 갑옷',
    slot: 'armor',
    classes: ['lord', 'heavyInfantry', 'lightCavalry', 'archer'],
    bonus: { def: 55 },
    price: 2100,
    tier: 3,
    growthStat: 'def',
    description: '두꺼운 철 갑옷. 화살도 튕겨낸다.',
  },

  // ---------- 방어구: 옷 (회피형·문관계 — 방어는 낮고 정신력을 얹는다) ----------
  clothRobe: {
    id: 'clothRobe',
    name: '무명옷',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    bonus: { def: 5, mind: 6 },
    price: 300,
    tier: 1,
    growthStat: 'def',
    description: '거친 무명으로 지은 옷. 몸이 가볍다.',
  },
  silkRobe: {
    id: 'silkRobe',
    name: '비단옷',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    bonus: { def: 13, mind: 14 },
    price: 820,
    tier: 2,
    growthStat: 'def',
    description: '고운 비단옷. 마음을 다스리기에 좋다.',
  },
  battleRobe: {
    id: 'battleRobe',
    name: '전투복',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    bonus: { def: 24, mind: 25 },
    price: 2000,
    tier: 3,
    growthStat: 'def',
    description: '실전을 견디도록 지은 옷. 문관에게도 갑옷이 필요하다.',
  },

  // ---------- 보조구 ----------
  leatherShield: {
    id: 'leatherShield',
    name: '가죽 방패',
    slot: 'accessory',
    bonus: { def: 8 },
    price: 500,
    tier: 1,
    description: '가죽을 덧댄 작은 방패.',
  },
  swiftHorse: {
    id: 'swiftHorse',
    name: '준마',
    slot: 'accessory',
    bonus: {},
    moveBonus: 1,
    price: 1200,
    tier: 2,
    description: '잘 달리는 말. 한 걸음 더 나아간다.',
  },
  // v1.2: 보조구 소품 4종 — 원작 보조구는 방패·장갑·투구 같은 값싼 소품이 층층이 깔린다
  // (caocao.md §6 "보조구는 방패·장갑·기마갑옷·서적·보석·관 등"). 가격은 무기/방어구 동급보다
  // 싸게 잡았다 [설계값 — 원작 구매가 절대 수치는 전 언어권 미확보, equipment.md §1].
  namelessGauntlet: {
    id: 'namelessGauntlet',
    name: '무명장갑',
    slot: 'accessory',
    bonus: { atk: 3 }, // [설계값]
    price: 200,
    tier: 1,
    description: '이름 없는 장인이 지은 가죽 장갑. 손아귀에 힘이 들어간다.',
  },
  leatherHelm: {
    id: 'leatherHelm',
    name: '가죽투구',
    slot: 'accessory',
    bonus: { def: 3 }, // [설계값]
    price: 250,
    tier: 1,
    description: '가죽을 겹쳐 만든 투구. 머리부터 지키는 것이 병법이다.',
  },
  bronzeHelm: {
    id: 'bronzeHelm',
    name: '구리투구',
    slot: 'accessory',
    bonus: { def: 6 }, // [설계값]
    price: 500,
    tier: 2,
    description: '구리를 두드려 만든 투구. 화살을 비껴낸다.',
  },
  bronzeShield: {
    id: 'bronzeShield',
    name: '구리방패',
    slot: 'accessory',
    bonus: { def: 8 }, // [설계값]
    price: 600,
    tier: 2,
    description: '구리를 덧댄 방패. 한 몸을 가리기에 넉넉하다.',
  },

  // ---------- 보물 (비매품 · 판매 불가) ----------
  yitianSword: {
    id: 'yitianSword',
    name: '의천검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    // 원작: 공16(+9/Lv) + 물리 회피 +15% — 회피 시스템 미도입이라 공격 보정만 재현 (equipment.md §2)
    bonus: { atk: 16 },
    price: null,
    tier: 1,
    isTreasure: true,
    growthStat: 'atk',
    description: '조조가 처음부터 지닌 명검. 하늘에 의지한다는 이름을 가졌다.',
  },
  qinggangSword: {
    id: 'qinggangSword',
    name: '청강검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    bonus: { atk: 40 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    description: '조조가 아끼던 명검. 무엇이든 베어낸다.',
  },
  dilu: {
    id: 'dilu',
    name: '적로',
    slot: 'accessory',
    bonus: {},
    allTerrainCost1: true,
    price: null,
    tier: 3,
    isTreasure: true,
    description: '이마에 흰 점이 있는 명마. 어떤 지형도 평지처럼 달린다.',
  },
  mengdeXinshu: {
    id: 'mengdeXinshu',
    name: '맹덕신서',
    slot: 'accessory',
    bonus: {},
    expMultiplier: 1.5,
    price: null,
    tier: 3,
    isTreasure: true,
    description: '조조가 병법을 정리한 저술. 얻는 경험이 1.5배가 된다.',
  },
  fangtianHalberd: {
    id: 'fangtianHalberd',
    name: '방천화극',
    slot: 'weapon',
    classes: ['lightCavalry'],
    // 여포의 상징. 3단계 철창(58)에는 못 미치지만 순발력까지 얹는 기병 최강 보물 구도
    bonus: { atk: 34, agi: 10 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    description: '여포가 휘두르는 큰 극. 창날 옆으로 초승달 같은 가지가 뻗어 있다.',
  },
  chituma: {
    id: 'chituma',
    name: '적토마',
    slot: 'accessory',
    bonus: {},
    moveBonus: 2,
    price: null,
    tier: 3,
    isTreasure: true,
    description: '하루에 천 리를 달린다는 붉은 명마. 사람 중에 여포, 말 중에 적토라 했다.',
  },
  taipingYaoshu: {
    id: 'taipingYaoshu',
    name: '태평요술서',
    slot: 'accessory',
    bonus: {},
    mpRegenPerTurn: 10,
    price: null,
    tier: 3,
    isTreasure: true,
    description: '장각이 남긴 요술서. 매 턴 책략치가 10 회복된다.',
  },

  // ==========================================================================
  // v1.2: 1부 보물 16종 — 원작 보물 50종 중 제1부(c00~c15) 등장분 (caocao.md §6)
  // --------------------------------------------------------------------------
  // 밸런스 원칙: **같은 계열 3단계 상점템 기본치를 넘지 않는다** (원작 "초반 강력,
  // 만렙 상점템에 소폭 밀림" 구도 — equipment.md §2). 참고 상한: 검 55 / 창 58 /
  // 활 47 / 부채 52 / 갑옷 55 / 옷 24+정신25.
  //   ※ 알려진 계통 편차: 우리 무구성장은 보물이 Lv9(+9/Lv)까지 자라 만렙에서는
  //     상점템(Lv3, +10/Lv)을 앞선다. 이는 v0.6 성장 상수(core)의 기존 성질이고
  //     청강검에서도 이미 나타난다 — 데이터 쪽에서는 기본치만 억제했다.
  // 수치는 원작 절대치 미확보분이 많아 대부분 [설계값]이며, 특수효과만 원작 확정이다.
  //
  // 방어구: 도복·깃옷 계열(문관) / 갑옷 계열(무관) / 기마갑옷(기병 전용, 원작 §5
  //   "기병계 보조구는 사실상 기마갑옷 강제" — 우리는 방어구 슬롯으로 단순화)
  blackRobe: {
    id: 'blackRobe',
    name: '칠흑도복',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    // 원작 방어 12(+9) — 도복 3종 중 최하. 본체 효과는 **MP 최대치 +20**이나 우리 EquipmentDef에
    // 최대 MP 가산 필드가 없어 미반영이다 [알려진 갭 — kr-blog.md §R5]
    bonus: { def: 28 },
    price: null,
    tier: 2,
    isTreasure: true,
    growthStat: 'def',
    description: '먹을 들인 검은 도복. 문관의 몸을 화살로부터 가린다.',
  },
  flyingDragonRobe: {
    id: 'flyingDragonRobe',
    name: '비룡도복',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    // 원작 방어 14(+9) — 도복 3종 중 최상. 부가 효과는 정신이 아니라 **순발 +10**이다 (원작 확정)
    bonus: { def: 32, agi: 10 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'def',
    description: '나는 용을 수놓은 도복. 걸치면 기가 맑아진다.',
  },
  phoenixRobe: {
    id: 'phoenixRobe',
    name: '봉황깃옷',
    slot: 'armor',
    classes: ['strategist', 'geomancer'],
    // 원작 방어 12(+9) — 칠흑과 동급이고 비룡보다 낮다. 값이 아니라 **매 턴 최대 HP 20% 회복**이
    // 이 옷의 본체다(청낭서와 비중첩, 회복 지형과 중첩) — 우리는 hpRegen 필드가 없어 미반영
    // [알려진 갭 — kr-blog.md §R5]
    bonus: { def: 28 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'def',
    description: '봉황의 깃을 엮어 지은 옷. 문관이 걸치는 최상의 방어구다.',
  },
  silverArmor: {
    id: 'silverArmor',
    name: '백은갑옷',
    slot: 'armor',
    classes: ['lord', 'heavyInfantry'],
    bonus: { def: 42 }, // [설계값]
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'def',
    description: '흰 은으로 벼린 갑옷. 진중에서 멀리서도 눈에 띈다.',
  },
  chainArmor: {
    id: 'chainArmor',
    name: '연환갑옷',
    slot: 'armor',
    classes: ['lord', 'heavyInfantry'],
    // 원작 복양 3연전의 보물 3종 분기 중 하나 (statuses.md §복양 — 이광궁/연환갑/여포궁)
    bonus: { def: 46 }, // [설계값]
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'def',
    description: '고리를 이어 붙인 갑옷. 창날이 고리 사이에서 멎는다.',
  },
  leatherHorseArmor: {
    id: 'leatherHorseArmor',
    name: '가죽기마갑옷',
    slot: 'armor',
    classes: ['lightCavalry'],
    // 원작 기마갑옷은 간접 피해 -50%가 본질이나 우리에겐 해당 필드가 없어 방어치로 환산 [의도적 단순화]
    bonus: { def: 30 }, // [설계값]
    price: null,
    tier: 2,
    isTreasure: true,
    growthStat: 'def',
    description: '말까지 감싸는 가죽 갑옷. 화살이 말을 노려도 견딘다.',
  },
  goldenArmor: {
    id: 'goldenArmor',
    name: '황금갑옷',
    slot: 'armor',
    bonus: { def: 50 }, // [설계값] — 병과 무관 최상급 갑옷
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'def',
    description: '황금을 입힌 갑옷. 값으로 매길 수 없는 물건이다.',
  },

  // 무기
  holySword: {
    id: 'holySword',
    name: '성자보검',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    // 원작 확정: 공격력 + **정신 강화**를 함께 주는 보검
    bonus: { atk: 48, mind: 10 }, // atk [설계값] / mind 원작 확정
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    description: '성인의 손을 거쳤다는 보검. 쥔 자의 마음까지 벼려 준다.',
  },
  serpentSpear: {
    id: 'serpentSpear',
    name: '사모',
    slot: 'weapon',
    classes: ['lightCavalry'],
    bonus: { atk: 52 }, // [설계값]
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    // 원작 확정: 장팔사모 = "찔러 공격" — 대상 뒤편 1칸까지 관통한다 (caocao.md §6)
    pierceBack: true,
    description: '뱀처럼 굽은 창날의 장창. 찌르면 뒤에 선 자까지 꿰뚫는다.',
  },
  lüBuBow: {
    id: 'lüBuBow',
    name: '여포궁',
    slot: 'weapon',
    classes: ['archer'],
    // 원작 확정: 보물의 일반공격 부가 상태이상은 100% 발동 (statuses.md §5 — 목인·토우·여포궁·이광궁)
    // 부가효과가 강력해 기본치는 3단계 철궁(47)보다 낮게 잡았다 [설계값 — 하향 조정]
    bonus: { atk: 44 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    onHitStatus: 'immobile', // 포박(부동) 확정 부여 — 원작 확정
    description: '여포가 쓰던 활. 시위 소리에 사람이 못 박힌 듯 멈춘다.',
  },
  gudingDao: {
    id: 'gudingDao',
    name: '고정도',
    slot: 'weapon',
    classes: ['lord', 'heavyInfantry'],
    // 원작 확정: 공18(+9) · **순발 +10** (equipment.md §2). 공격치만 우리 곡선으로 환산 [설계값]
    bonus: { atk: 40, agi: 10 },
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'atk',
    description: '옛 주인의 이름이 새겨진 큰 칼. 무겁지만 손이 빠르게 움직인다.',
  },
  bashoFan: {
    id: 'bashoFan',
    name: '파초선',
    slot: 'weapon',
    classes: ['geomancer'],
    // 일본판은 풍계 +20%, **한국 정발판은 지계 +20%** — 로컬라이즈 차이로 확정 (kr-blog.md §R5).
    // 우리는 지계 책략이 없어 설명문만 원작을 인용하고 효과는 정신력으로 환산했다 [의도적 단순화]
    bonus: { mind: 45 }, // [설계값]
    price: null,
    tier: 3,
    isTreasure: true,
    growthStat: 'mind',
    description: '파초 잎을 본뜬 큰 부채. 부치면 바람의 기운이 거세진다.',
  },

  // 보조구
  moYuJian: {
    id: 'moYuJian',
    name: '몰우전',
    slot: 'accessory',
    bonus: {},
    price: null,
    tier: 2,
    isTreasure: true,
    // 원작 확정: 근접 병과에 원거리 공격을 부여한다.
    // ※ 엔진 미반영 — 현재 코어는 이 플래그를 읽지 않는다 (사거리 계산은 병과 기준, 후속 과제)
    rangedAttack: true,
    description: '깃 없이도 날아가는 화살. 창칼밖에 모르던 손이 멀리 닿는다.',
  },
  fuJin: {
    id: 'fuJin',
    name: '복건',
    slot: 'accessory',
    bonus: { mind: 8 }, // [설계값]
    price: null,
    tier: 2,
    isTreasure: true,
    description: '문사가 머리에 두르는 두건. 생각이 흐트러지지 않는다.',
  },
  jueYing: {
    id: 'jueYing',
    name: '절영',
    slot: 'accessory',
    bonus: {},
    // 원작 c03 전멸 클리어 보상이자 c10 전위 구출의 필수템 (battle-events.md §4).
    // **원작 확정 +1** — thewiki 「이동력 보조 +1」 / biglobe 「移動力＋１」 독립 2소스 일치.
    // v1.2 초안의 +2("전위 구출에 필요")는 반박됨: 절영 +1로도 원작 공략은 2턴에 서쪽 도달한다
    // (kr-blog.md §R5).
    moveBonus: 1,
    price: null,
    tier: 2,
    isTreasure: true,
    description: '조조가 아끼던 준마. 그림자조차 끊고 달린다.',
  },
  windWheel: {
    id: 'windWheel',
    name: '바람바퀴',
    slot: 'accessory',
    bonus: {},
    // **원작 확정 +2, 단 포차계 전용** (thewiki·biglobe 일치). 포차계가 미구현이라 병과 제약은
    // 계열 추가 시점까지 보류한다 — 지금 classes를 걸면 착용자가 아무도 없어진다 (kr-blog.md §R5)
    moveBonus: 2,
    price: null,
    tier: 2,
    isTreasure: true,
    description: '바람을 타고 도는 바퀴. 발걸음이 한결 가벼워진다.',
  },
}
