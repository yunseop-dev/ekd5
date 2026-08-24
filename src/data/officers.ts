// 장수 정의 — 테스트 스테이지용.
// 능력치는 원작 관례(모두 짝수, 부대 초기치 = ÷2)를 따른 설계값.

import type { OfficerDef } from '../core/types'

export const OFFICERS: Record<string, OfficerDef> = {
  // ---- 아군 ----
  caocao: {
    id: 'caocao',
    name: '조조',
    stats: { str: 82, ldr: 98, int: 92, agi: 80, luck: 84 }, // 원작 확정 (kr-blog §R2)
    classId: 'lord',
    initialEquipment: { weapon: 'yitianSword', armor: 'leatherArmor' },
    level: 3,
  },
  xiahoudun: {
    id: 'xiahoudun',
    name: '하후돈',
    stats: { str: 98, ldr: 82, int: 64, agi: 90, luck: 66 }, // 원작 확정 (kr-blog §R2)
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 2,
  },
  dianwei: {
    id: 'dianwei',
    name: '전위',
    stats: { str: 100, ldr: 76, int: 52, agi: 98, luck: 68 }, // 원작 확정 — 무력 100·순발 98 (kr-blog §R2)
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 2,
  },
  xiahouyuan: {
    id: 'xiahouyuan',
    name: '하후연',
    stats: { str: 92, ldr: 80, int: 62, agi: 66, luck: 78 }, // 원작 확정 (kr-blog §R2)
    classId: 'archer',
    initialEquipment: { weapon: 'woodBow', armor: 'leatherArmor' },
    level: 2,
  },
  guojia: {
    id: 'guojia',
    name: '곽가',
    stats: { str: 30, ldr: 60, int: 96, agi: 74, luck: 60 },
    classId: 'strategist',
    initialEquipment: { weapon: 'bambooFan', armor: 'clothRobe' },
    level: 2,
  },
  xunyu: {
    id: 'xunyu',
    name: '순욱',
    stats: { str: 28, ldr: 68, int: 94, agi: 62, luck: 74 },
    classId: 'geomancer',
    initialEquipment: { weapon: 'stoneGemSword', armor: 'clothRobe' },
    level: 2,
  },

  // ---- 아군 (제2부 합류) ----
  // 원작은 합류 시점의 로스터 평균에 맞춘 레벨과 병과 기본 장비를 들고 온다 (campaign-ux.md §7.2).
  // 무기는 계열이 강제된다 — 경보병 계열은 검(woodSword/bronzeSword…), 기병 계열은 창이다.
  // 능력치는 원작 Data.e5 실측(부대치×2 = 장수치, 전부 짝수) — statuses.md §4
  xuChu: {
    id: 'xuChu',
    name: '허저',
    // 조조 친위대장. 무력·운 최상위 · 지력 최하위의 순수 방벽형 (원작 c08 합류)
    stats: { str: 98, ldr: 90, int: 36, agi: 68, luck: 98 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 14,
  },
  zhangLiao: {
    id: 'zhangLiao',
    name: '장료',
    // 원작 "기합류(=이미 승급된 채 합류) 장수는 클래스업 보너스가 없다"를 재현 —
    // 기본 병과 자체가 2차(중기병)라 인수를 써도 더 오를 곳이 없다 (promotion.md §3).
    // 원작 c15(여포 격파 후) 합류이며 기병 계열, 레벨은 아군 평균 연동이다.
    stats: { str: 92, ldr: 84, int: 86, agi: 78, luck: 94 },
    classId: 'heavyCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 18,
  },

  // ---- 적군 (황건적) ----
  // 잡병도 1단계 무기를 지닌다 (원작: 적 부대도 병과 기본 장비를 갖고 나온다).
  // 방어구는 주지 않는다 — 황건적은 오합지졸이라는 원작 묘사 + 초반 난이도 조정.
  yellowInfantry: {
    id: 'yellowInfantry',
    name: '황건적병',
    stats: { str: 60, ldr: 50, int: 20, agi: 50, luck: 40 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 1,
  },
  yellowArcher: {
    id: 'yellowArcher',
    name: '황건궁병',
    stats: { str: 58, ldr: 44, int: 24, agi: 56, luck: 40 },
    classId: 'archer',
    initialEquipment: { weapon: 'woodBow', armor: 'leatherArmor' },
    level: 1,
  },
  yellowCavalry: {
    id: 'yellowCavalry',
    name: '황건기병',
    stats: { str: 64, ldr: 48, int: 20, agi: 60, luck: 42 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 1,
  },
  yellowShaman: {
    id: 'yellowShaman',
    name: '황건요술사',
    stats: { str: 26, ldr: 40, int: 78, agi: 58, luck: 44 },
    classId: 'strategist',
    initialEquipment: { weapon: 'bambooFan', armor: 'clothRobe' },
    level: 2,
  },
  chengYuanzhi: {
    id: 'chengYuanzhi',
    name: '정원지',
    stats: { str: 82, ldr: 62, int: 38, agi: 64, luck: 50 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 4,
  },
  dengMao: {
    id: 'dengMao',
    name: '등무',
    stats: { str: 78, ldr: 58, int: 30, agi: 58, luck: 48 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 3,
  },
  // 황건 본진 부장 — 정원지급 정예 보병
  zhangLiang: {
    id: 'zhangLiang',
    name: '장량',
    stats: { str: 84, ldr: 72, int: 54, agi: 60, luck: 56 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 5,
  },
  // 대현량사 — 최종 보스. 요술(책략) 특화라 지력만 아군 책사급
  zhangJiao: {
    id: 'zhangJiao',
    name: '장각',
    stats: { str: 34, ldr: 72, int: 98, agi: 64, luck: 78 },
    classId: 'strategist',
    initialEquipment: { accessory: 'taipingYaoshu' },
    level: 6,
  },

  // ---- 적군 (동탁군 · 서량병) ----
  // 황건적과 달리 정규군이다 — 잡병도 레벨 4에 방어구를 갖추고, 부장급은 2단계 무기를 든다.
  westInfantry: {
    id: 'westInfantry',
    name: '서량보병',
    stats: { str: 66, ldr: 56, int: 22, agi: 52, luck: 44 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 4,
  },
  westCavalry: {
    id: 'westCavalry',
    name: '서량기병',
    stats: { str: 70, ldr: 54, int: 22, agi: 64, luck: 46 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 4,
  },
  westArcher: {
    id: 'westArcher',
    name: '서량궁병',
    stats: { str: 64, ldr: 48, int: 26, agi: 60, luck: 44 },
    classId: 'archer',
    initialEquipment: { weapon: 'woodBow', armor: 'leatherArmor' },
    level: 4,
  },
  // 사수관 수문장 — 관 앞에서 제후의 장수들을 연달아 벤 보스급 무장
  huaXiong: {
    id: 'huaXiong',
    name: '화웅',
    stats: { str: 90, ldr: 82, int: 38, agi: 56, luck: 54 }, // 원작 확정 (kr-blog §R2)
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'leatherArmor' },
    level: 7,
  },
  // 동탁의 사위이자 당대 최강 — 제1부에서 정면으로 이길 수 없게 설계된 벽
  // 원작 Data.e5 실측: 무력·통솔 만점에 지력 12 (전 장수 최하위권) — 책략에 극도로 약하다
  lüBu: {
    id: 'lüBu',
    name: '여포',
    stats: { str: 100, ldr: 100, int: 12, agi: 94, luck: 84 },
    classId: 'lightCavalry',
    // 방천화극과 적토마를 함께 지닌다. 적토마만 전리품으로 떨어진다(극은 원작처럼 끝까지 여포의 것).
    initialEquipment: { weapon: 'fangtianHalberd', armor: 'bronzeArmor', accessory: 'chituma' },
    level: 10,
  },
  // 동탁의 모사 — 낙양 방화와 천도를 진언한 책사
  liRu: {
    id: 'liRu',
    name: '이유',
    stats: { str: 26, ldr: 60, int: 92, agi: 62, luck: 56 },
    classId: 'strategist',
    initialEquipment: { weapon: 'bambooFan', armor: 'clothRobe' },
    level: 7,
  },

  // ---- 적군 (제2부 · 서주군 · 여포군) ----
  // 능력치는 원작 Data.e5 실측 (statuses.md §4). 제2부 적 레벨만 아군 도달 예상(Lv13~20)에 러버밴딩한다.
  // 잡병(yellow*/west*)은 기존 정의를 스테이지 level 오버라이드로 재사용한다.
  // ※ 관해(管亥)·조표(曹豹)는 원작 512인 명부에 없어 정의하지 않는다 —
  //   청주(c04)는 적장 없는 황건 익명 부대뿐이고, 서주 수성의 실존 적장은 조성(曹性)이다.
  caoXing: {
    id: 'caoXing',
    name: '조성',
    // 원작 궁기병 — 우리 병과 목록에 궁기병이 없어 궁병(archer)으로 재편성했다 [의도적 이탈]
    stats: { str: 72, ldr: 74, int: 50, agi: 64, luck: 76 },
    classId: 'archer',
    initialEquipment: { weapon: 'bronzeBow', armor: 'leatherArmor' },
    level: 13,
  },
  taoQian: {
    id: 'taoQian',
    name: '도겸',
    // 서주목. 원작 c05 B선택 승리조건이 "도겸 격파"라 이쪽이 보스다
    stats: { str: 74, ldr: 64, int: 72, agi: 58, luck: 56 },
    classId: 'lord',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 14,
  },
  chenGong: {
    id: 'chenGong',
    name: '진궁',
    // 여포의 모사. 원작은 화·수·지계+소보급만 쓰는 책사지만, 우리는 도사 병과가 없어
    // 참모(2차)로 정의해 방해 책략의 적측 실사용을 확보했다 (statuses.md §3 [의도적 이탈])
    stats: { str: 68, ldr: 76, int: 90, agi: 62, luck: 52 },
    classId: 'counselor',
    initialEquipment: { weapon: 'whiteFeatherFan', armor: 'silkRobe' },
    level: 18,
  },
  gaoShun: {
    id: 'gaoShun',
    name: '고순',
    // 원작 병과는 서량기병이나, 함진영(陷陣營) 컨셉을 살려 방어 특화 2차(중보병)로 재편성 [의도적 이탈]
    stats: { str: 88, ldr: 90, int: 48, agi: 62, luck: 38 },
    classId: 'guardInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'bronzeArmor' },
    level: 17,
  },

  // 여포의 양녀 — 하비(c14)에서 조조와 일기토를 벌이고 무승부로 끝난다 (battle-events.md §2)
  diaochan: {
    id: 'diaochan',
    name: '초선',
    // 원작 Data.e5 실측치. 원작 병과는 무희(舞姫)지만 우리 병과 목록에 없어
    // 풍수사(geomancer)로 재편성했다 — 보급·고양으로 성 안을 지탱하는 역할 [의도적 이탈]
    stats: { str: 76, ldr: 64, int: 68, agi: 100, luck: 82 },
    classId: 'geomancer',
    initialEquipment: { weapon: 'bronzeGemSword', armor: 'silkRobe' },
    level: 16,
  },
  // 하비의 여포 부장 3인 — 원작 c14에서 아군과의 일기토에 지고 전사한다.
  // ※ 사서의 투항(배반) 전개는 원작 조조전이 채택하지 않았다 — 여기서도 그냥 죽는다
  //   (battle-events.md §2 "배반 일기토는 원작에 없다")
  houCheng: {
    id: 'houCheng',
    name: '후성',
    stats: { str: 76, ldr: 70, int: 54, agi: 52, luck: 54 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 18,
  },
  weiXu: {
    id: 'weiXu',
    name: '위속',
    stats: { str: 78, ldr: 76, int: 42, agi: 58, luck: 44 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 18,
  },
  songXian: {
    id: 'songXian',
    name: '송헌',
    stats: { str: 74, ldr: 74, int: 52, agi: 56, luck: 60 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 17,
  },

  // ---- 유비군 (stage08 = 적 원군 / stage10 = 우군) ----
  // 원작 인과 재현: c05에서는 적 원군으로 등장하고, c13(구원 선택)에서 우군이 된다.
  liuBei: {
    id: 'liuBei',
    name: '유비',
    stats: { str: 78, ldr: 72, int: 76, agi: 74, luck: 100 },
    classId: 'lord',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 13,
  },
  guanYu: {
    id: 'guanYu',
    // 원작에서 "이미 승급 상태로 등장"하는 급 — 병과 자체가 2차다
    name: '관우',
    stats: { str: 96, ldr: 98, int: 90, agi: 68, luck: 62 },
    classId: 'guardInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'bronzeArmor' },
    level: 15,
  },
  zhangFei: {
    id: 'zhangFei',
    name: '장비',
    stats: { str: 100, ldr: 74, int: 46, agi: 72, luck: 76 },
    classId: 'heavyCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 15,
  },

  // ==========================================================================
  // v1.2: 1부 서사 인물 확장 — 정의만 하고 배치는 스테이지 쪽(Wave 2) 소유다.
  // 능력치는 **원작 확정값**(biglobe 스탯표 + thewiki, kr-blog.md §R2)으로 교정 완료.
  // --------------------------------------------------------------------------
  // [병과 배치 — v1.3-classes에서 13계열 전무 구조 확보]
  //   원작 아군 13계열이 모두 CLASSES에 있고, 장수는 어떤 병과든 classId로 올리면 된다(능력치는 장수 귀속).
  //   현재 대체 배치: 전위(무도가→martialArtist로 이동 가능) · 허저(적병→bandit) ·
  //   하후연(궁기병→mountedArcher) · 가후(도사→taoist). 필요 시 classId만 바꿔 적용한다.
  //   헌제는 원작 그대로 **공격 불가 호위 유닛** — emperor(classId, v1.3-tier3에서 배치).
  // --------------------------------------------------------------------------

  // ---- 한 황실 ----
  xianDi: {
    id: 'xianDi',
    name: '헌제',
    // 비무장 천자 — 공격 불가(emperor: 범위 0·0)·승급 없음. 원작 헌제는 싸우는 인물이 아니다.
    stats: { str: 36, ldr: 64, int: 76, agi: 58, luck: 100 }, // 원작 확정 — 운 100(전 장수 최고) (kr-blog §R2)
    classId: 'emperor',
    level: 6,
  },

  // ---- 동탁 잔당 (이각·곽사·서영) ----
  liJue: {
    id: 'liJue',
    name: '이각',
    // 동탁 사후 장안을 장악한 서량 무장. 원작 병과는 **보병계** (kr-blog §R2)
    stats: { str: 76, ldr: 76, int: 60, agi: 62, luck: 52 }, // 원작 확정. 지력은 thewiki 60 채택 (bg 70과 충돌 — kr-blog §R2)
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 9,
  },
  guoSi: {
    id: 'guoSi',
    name: '곽사',
    // 이각과 한 쌍. 원작 병과는 **보병계** — 통솔은 이각보다 위다 (kr-blog §R2)
    stats: { str: 74, ldr: 78, int: 62, agi: 58, luck: 64 }, // 원작 확정 (kr-blog §R2)
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 9,
  },
  xuRong: {
    id: 'xuRong',
    name: '서영',
    // 동탁군 부장 — 조조를 한 번 패퇴시킨 실적이 있어 화웅 바로 아래로 잡았다 [설계값]
    stats: { str: 84, ldr: 74, int: 50, agi: 52, luck: 56 }, // 원작 확정 (kr-blog §R2)
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'leatherArmor' },
    level: 8,
  },

  // ---- 조조군 (후에 합류하거나 이미 막하에 있는 인물) ----
  xuHuang: {
    id: 'xuHuang',
    name: '서황',
    // 원작 궁병 에이스 — 무력 90급 [설계값]. 1부에서는 적으로 나오고 뒤에 아군이 된다
    stats: { str: 92, ldr: 90, int: 56, agi: 78, luck: 96 }, // 원작 확정 — 운 96 (kr-blog §R2)
    classId: 'archer',
    initialEquipment: { weapon: 'bronzeBow', armor: 'bronzeArmor' },
    level: 12,
  },
  manChong: {
    id: 'manChong',
    name: '만총',
    // 원작 병과는 **풍수사계** — 회복·지원형 문관이다 (kr-blog §R2)
    stats: { str: 54, ldr: 68, int: 90, agi: 78, luck: 84 }, // 원작 확정 (kr-blog §R2)
    classId: 'geomancer',
    initialEquipment: { weapon: 'stoneGemSword', armor: 'clothRobe' },
    level: 11,
  },

  // ---- 장수(張繡)군 — 완성 전투 ----
  zhangXiu: {
    id: 'zhangXiu',
    name: '장수',
    // 완성의 주인. 보스급 기병 [설계값]
    stats: { str: 80, ldr: 76, int: 62, agi: 58, luck: 56 }, // 원작 확정 (kr-blog §R2)
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 12,
  },
  jiaXu: {
    id: 'jiaXu',
    name: '가후',
    // 지력 96급의 독사 [설계값]. 진궁과 같은 이유로 **참모(2차)** — 방해 책략(허보·봉책)의
    // 적측 실사용을 확보한다 (statuses.md §3 [의도적 이탈]).
    // ※ 독연은 방술사 계열 책략이라 이 병과로는 쓰지 못한다 — 허보·봉책으로 대체된다
    stats: { str: 52, ldr: 68, int: 96, agi: 80, luck: 78 }, // 원작 확정 (kr-blog §R2)
    classId: 'counselor',
    initialEquipment: { weapon: 'whiteFeatherFan', armor: 'silkRobe' },
    level: 12,
  },
  huCheEr: {
    id: 'huCheEr',
    name: '호거아',
    // 장수의 호위. 원작에서 전위의 무기를 훔쳐낸 괴력·민첩형 — 전위의 일기토 상대 [설계값]
    stats: { str: 82, ldr: 72, int: 26, agi: 92, luck: 58 }, // 원작 확정 — 순발 92·지력 26 (kr-blog §R2)
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 11,
  },

  // ---- 원술군 (회남) ----
  yuanShu: {
    id: 'yuanShu',
    name: '원술',
    // 참칭 황제. 원작 병과는 **기병계**(군주계 아님) — 통솔이 낮은 "그릇이 안 되는" 보스 (kr-blog §R2)
    stats: { str: 64, ldr: 58, int: 62, agi: 60, luck: 52 }, // 원작 확정 (kr-blog §R2)
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 13,
  },

  // ---- 손씨 (우군) ----
  sunJian: {
    id: 'sunJian',
    name: '손견',
    // 사수관에서 함께 싸우는 우군 군주 — 생존 시 보물 보상 분기의 주인공 [설계값]
    stats: { str: 92, ldr: 80, int: 72, agi: 76, luck: 84 }, // 원작 확정 (kr-blog §R2)
    classId: 'lord',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 10,
  },
  sunCe: {
    id: 'sunCe',
    name: '손책',
    // 소패왕. 원작 병과는 **군주계** — 무력 94는 1부 우군 최고치다 (kr-blog §R2)
    stats: { str: 94, ldr: 86, int: 54, agi: 78, luck: 52 }, // 원작 확정 (kr-blog §R2)
    classId: 'lord',
    initialEquipment: { weapon: 'bronzeSword', armor: 'bronzeArmor' },
    level: 14,
  },

  // ---- 대사 전용 (화자로만 쓰인다 — 스테이지 배치 대상이 아니다) ----
  // 전투 능력치는 의미가 없어 최소치로 둔다. 초기 장비도 주지 않는다.
  caoAnMin: {
    id: 'caoAnMin',
    name: '조안민',
    stats: { str: 76, ldr: 62, int: 64, agi: 54, luck: 84 }, // 원작 확정 — 원작에서는 궁기병 유닛으로 나온다 (kr-blog §R2)
    classId: 'heavyInfantry',
    level: 1,
  },
  zouShi: {
    id: 'zouShi',
    name: '추씨',
    stats: { str: 20, ldr: 20, int: 46, agi: 40, luck: 44 }, // 대사 전용 — 최소 스탯 [설계값]
    classId: 'geomancer',
    level: 1,
  },
  fuHao: {
    id: 'fuHao',
    name: '부호',
    stats: { str: 24, ldr: 30, int: 52, agi: 36, luck: 38 }, // 대사 전용 — 최소 스탯 [설계값]
    classId: 'strategist',
    level: 1,
  },

  // ---- 제네릭 잡병 (스테이지에서 level 오버라이드해 재사용 — west*·yellow* 패턴) ----
  // 조조군 구원대: 아군 진영 잡병이라 서량병과 같은 정규군 수준
  weiInfantry: {
    id: 'weiInfantry',
    name: '조조군보병',
    stats: { str: 66, ldr: 58, int: 26, agi: 52, luck: 46 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 4,
  },
  weiCavalry: {
    id: 'weiCavalry',
    name: '조조군기병',
    stats: { str: 70, ldr: 56, int: 26, agi: 64, luck: 48 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 4,
  },
  // 회남군(원술) — 오합지졸에 가까워 서량병보다 반 급 아래
  huaiInfantry: {
    id: 'huaiInfantry',
    name: '회남보병',
    stats: { str: 62, ldr: 52, int: 24, agi: 50, luck: 42 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 4,
  },
  huaiArcher: {
    id: 'huaiArcher',
    name: '회남궁병',
    stats: { str: 60, ldr: 46, int: 26, agi: 58, luck: 42 },
    classId: 'archer',
    initialEquipment: { weapon: 'woodBow', armor: 'leatherArmor' },
    level: 4,
  },
  // 형주군(장수·유표) — 정규군 수준
  jingInfantry: {
    id: 'jingInfantry',
    name: '형주보병',
    stats: { str: 64, ldr: 56, int: 24, agi: 52, luck: 44 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 4,
  },
  jingCavalry: {
    id: 'jingCavalry',
    name: '형주기병',
    stats: { str: 68, ldr: 54, int: 24, agi: 62, luck: 46 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 4,
  },
}
