// 장수 정의 — 테스트 스테이지용.
// 능력치는 원작 관례(모두 짝수, 부대 초기치 = ÷2)를 따른 설계값.

import type { OfficerDef } from '../core/types'

export const OFFICERS: Record<string, OfficerDef> = {
  // ---- 아군 ----
  caocao: {
    id: 'caocao',
    name: '조조',
    stats: { str: 78, ldr: 96, int: 92, agi: 82, luck: 90 },
    classId: 'lord',
    initialEquipment: { weapon: 'yitianSword', armor: 'leatherArmor' },
    level: 3,
  },
  xiahoudun: {
    id: 'xiahoudun',
    name: '하후돈',
    stats: { str: 90, ldr: 78, int: 60, agi: 78, luck: 70 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'woodSpear', armor: 'leatherArmor' },
    level: 2,
  },
  dianwei: {
    id: 'dianwei',
    name: '전위',
    stats: { str: 94, ldr: 66, int: 32, agi: 70, luck: 82 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 2,
  },
  xiahouyuan: {
    id: 'xiahouyuan',
    name: '하후연',
    stats: { str: 86, ldr: 74, int: 58, agi: 88, luck: 66 },
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
  xuChu: {
    id: 'xuChu',
    name: '허저',
    // 조조 친위대장. 무력 최상위 · 지력 최하위의 순수 방벽형 (s23 서주 구원 요청에서 합류)
    stats: { str: 96, ldr: 72, int: 36, agi: 62, luck: 74 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'leatherArmor' },
    level: 14,
  },
  zhangLiao: {
    id: 'zhangLiao',
    name: '장료',
    // 원작 "기합류(=이미 승급된 채 합류) 장수는 클래스업 보너스가 없다"를 재현 —
    // 기본 병과 자체가 2차(중기병)라 인수를 써도 더 오를 곳이 없다 (promotion.md §3).
    stats: { str: 92, ldr: 90, int: 78, agi: 80, luck: 70 },
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
    stats: { str: 88, ldr: 74, int: 40, agi: 76, luck: 58 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'leatherArmor' },
    level: 7,
  },
  // 동탁의 사위이자 당대 최강 — 제1부에서 정면으로 이길 수 없게 설계된 벽
  lüBu: {
    id: 'lüBu',
    name: '여포',
    stats: { str: 98, ldr: 80, int: 30, agi: 94, luck: 70 },
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

  // ---- 적군 (제2부 · 황건 잔당 · 서주군 · 여포군) ----
  // 제2부 적은 아군 도달 예상(Lv13~20)에 러버밴딩된 레벨을 갖는다.
  // 잡병(yellow*/west*)은 기존 정의를 스테이지 level 오버라이드로 재사용한다.
  guanHai: {
    id: 'guanHai',
    name: '관해',
    // 청주 황건 잔당의 두목 — 물량을 이끄는 두목급이라 잡병보다 한 급 위다
    stats: { str: 80, ldr: 66, int: 30, agi: 56, luck: 48 },
    classId: 'heavyInfantry',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 12,
  },
  caoBao: {
    id: 'caoBao',
    name: '조표',
    // 도겸의 장수. 서주 수성전의 실질적인 지휘관
    stats: { str: 76, ldr: 64, int: 40, agi: 66, luck: 44 },
    classId: 'lightCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'leatherArmor' },
    level: 13,
  },
  taoQian: {
    id: 'taoQian',
    name: '도겸',
    // 서주목. 노쇠해 싸울 힘이 없다 — 통솔·지력만 남은 약체 보스급 비(非)보스
    stats: { str: 40, ldr: 70, int: 72, agi: 44, luck: 60 },
    classId: 'lord',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 14,
  },
  chenGong: {
    id: 'chenGong',
    name: '진궁',
    // 여포의 모사. 병과가 2차(참모)라 화룡을 포함한 책략 전부를 실제로 쓴다
    stats: { str: 30, ldr: 66, int: 94, agi: 62, luck: 66 },
    classId: 'counselor',
    initialEquipment: { weapon: 'whiteFeatherFan', armor: 'silkRobe' },
    level: 18,
  },
  gaoShun: {
    id: 'gaoShun',
    name: '고순',
    // 함진영(陷陣營)을 이끄는 여포군 최정예. 방어 특화 2차 병과(중보병)
    stats: { str: 86, ldr: 88, int: 56, agi: 60, luck: 58 },
    classId: 'guardInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'bronzeArmor' },
    level: 17,
  },

  // ---- 우군 (유비군 — stage10 서주 구원의 ally 진영) ----
  // 조작 대상이 아니라 AI로 움직인다. 원작 우군처럼 아군과 함께 싸우되 지휘를 받지 않는다.
  liuBei: {
    id: 'liuBei',
    name: '유비',
    stats: { str: 72, ldr: 88, int: 76, agi: 66, luck: 92 },
    classId: 'lord',
    initialEquipment: { weapon: 'woodSword', armor: 'leatherArmor' },
    level: 13,
  },
  guanYu: {
    id: 'guanYu',
    // 원작에서 "이미 승급 상태로 등장"하는 급 — 병과 자체가 2차다
    name: '관우',
    stats: { str: 96, ldr: 90, int: 70, agi: 74, luck: 74 },
    classId: 'guardInfantry',
    initialEquipment: { weapon: 'bronzeSword', armor: 'bronzeArmor' },
    level: 15,
  },
  zhangFei: {
    id: 'zhangFei',
    name: '장비',
    stats: { str: 98, ldr: 74, int: 42, agi: 78, luck: 62 },
    classId: 'heavyCavalry',
    initialEquipment: { weapon: 'bronzeSpear', armor: 'bronzeArmor' },
    level: 15,
  },
}
