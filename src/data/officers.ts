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
    level: 3,
  },
  xiahoudun: {
    id: 'xiahoudun',
    name: '하후돈',
    stats: { str: 90, ldr: 78, int: 60, agi: 78, luck: 70 },
    classId: 'lightCavalry',
    level: 2,
  },
  dianwei: {
    id: 'dianwei',
    name: '전위',
    stats: { str: 94, ldr: 66, int: 32, agi: 70, luck: 82 },
    classId: 'heavyInfantry',
    level: 2,
  },
  xiahouyuan: {
    id: 'xiahouyuan',
    name: '하후연',
    stats: { str: 86, ldr: 74, int: 58, agi: 88, luck: 66 },
    classId: 'archer',
    level: 2,
  },
  guojia: {
    id: 'guojia',
    name: '곽가',
    stats: { str: 30, ldr: 60, int: 96, agi: 74, luck: 60 },
    classId: 'strategist',
    level: 2,
  },
  xunyu: {
    id: 'xunyu',
    name: '순욱',
    stats: { str: 28, ldr: 68, int: 94, agi: 62, luck: 74 },
    classId: 'geomancer',
    level: 2,
  },

  // ---- 적군 (황건적) ----
  yellowInfantry: {
    id: 'yellowInfantry',
    name: '황건적병',
    stats: { str: 60, ldr: 50, int: 20, agi: 50, luck: 40 },
    classId: 'heavyInfantry',
    level: 1,
  },
  yellowArcher: {
    id: 'yellowArcher',
    name: '황건궁병',
    stats: { str: 58, ldr: 44, int: 24, agi: 56, luck: 40 },
    classId: 'archer',
    level: 1,
  },
  yellowCavalry: {
    id: 'yellowCavalry',
    name: '황건기병',
    stats: { str: 64, ldr: 48, int: 20, agi: 60, luck: 42 },
    classId: 'lightCavalry',
    level: 1,
  },
  yellowShaman: {
    id: 'yellowShaman',
    name: '황건요술사',
    stats: { str: 26, ldr: 40, int: 78, agi: 58, luck: 44 },
    classId: 'strategist',
    level: 2,
  },
  chengYuanzhi: {
    id: 'chengYuanzhi',
    name: '정원지',
    stats: { str: 82, ldr: 62, int: 38, agi: 64, luck: 50 },
    classId: 'lightCavalry',
    level: 4,
  },
  dengMao: {
    id: 'dengMao',
    name: '등무',
    stats: { str: 78, ldr: 58, int: 30, agi: 58, luck: 48 },
    classId: 'heavyInfantry',
    level: 3,
  },
}
