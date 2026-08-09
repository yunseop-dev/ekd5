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
}
