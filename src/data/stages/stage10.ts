// 스테이지 10 "서주 구원" — 제2부 네 번째 전투 (원작 1장 후반 유비 구원, 난이도 B)
// 검증 목표: 우군(ally) 진영 3기(유비·관우·장비)가 북쪽 마을에 고립된 구도 —
//            아군은 남쪽에서 진입해 고순의 함진영(Lv16~17 정예, 방어 특화 2차 병과)을 뚫는다.
//            우군은 조작 대상이 아니라 자기 페이즈에 AI로 움직인다.
// 지형 구성: 남쪽 개활지(출진) → 초원 덤불 → 중앙 숲 두 덩이 → 북쪽 마을 3칸(매턴 회복 = 우군 생존 장치)
// 밸런스: ally 생존은 우리 VictoryCondition에 없다 — 1차는 고순 격파, 2차는 전멸이고
//         유비군의 생존 자체는 연출이다. 마을 회복(20%/턴)이 우군을 오래 버티게 한다.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_10: StageDef = {
  id: 'stage10',
  name: '서주 구원',
  weather: 'clear',
  map: parseMap([
    'MMMPPPPPPPPPPMMM',
    'MMPPPPVVVPPPPPMM', // (6~8,1) 마을 — 고립된 유비군
    'MPPPPPVVVPPPPPPM',
    'PPPPPPPPPPPPPPPP',
    'PPPFFPPPPPPFFPPP',
    'PPPFFPPPPPPFFPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPGGPPPPPPGGPPP',
    'PPPPPPPPPPPPPPPP',
    'MPPPPPPPPPPPPPPM',
    'MMMPPPPPPPPPPMMM',
  ]),
  // 출진 슬롯 — 남쪽 개활지에서 마을을 향해 곧게 올라간다
  playerSlots: [
    { x: 7, y: 10 }, // ① 강제출진: 조조
    { x: 6, y: 10 },
    { x: 8, y: 10 },
    { x: 5, y: 10 },
    { x: 9, y: 10 },
    { x: 7, y: 11 },
    { x: 4, y: 10 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 남쪽 개활지 (허저 합류 후의 전투라 기본 배치도 7기)
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 10 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 6, y: 10 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 10 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 10 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 9, y: 10 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 7, y: 11 } },
    { officerId: 'xuChu', faction: 'player', pos: { x: 4, y: 10 } },
    // 우군 — 마을에 갇힌 유비군 3기. 아군과 함께 싸우되 지휘를 받지 않는다
    { officerId: 'liuBei', faction: 'ally', pos: { x: 7, y: 1 } },
    { officerId: 'guanYu', faction: 'ally', pos: { x: 6, y: 1 } },
    { officerId: 'zhangFei', faction: 'ally', pos: { x: 8, y: 1 } },
    // 보스 — 고순. 마을 남쪽을 정면으로 막아 유비군의 퇴로를 끊고 있다
    { officerId: 'gaoShun', faction: 'enemy', pos: { x: 7, y: 3 }, isBoss: true, behavior: 'guard' },
    // 함진영 본대 — 두꺼운 보병 방어선
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 6, y: 3 }, level: 16, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 3 }, level: 16, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 5, y: 2 }, level: 16, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 9, y: 2 }, level: 16, behavior: 'guard' },
    // 궁병 — 마을을 사거리에 두고 우군을 깎는다
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 4, y: 3 }, level: 16, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 10, y: 3 }, level: 16, behavior: 'guard' },
    // 유격 기병 — 남쪽에서 올라오는 아군을 먼저 맞는다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 3, y: 6 }, level: 17, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 12, y: 6 }, level: 17, behavior: 'pursue' },
  ],
  // 1차 = 고순 격파(포위가 풀린다), 2차 = 전멸 → 보너스 경험치
  victory: [{ type: 'defeatBoss' }, { type: 'annihilation' }],
  bonusExp: 150,
  reinforcements: [
    // 턴 3 — 북쪽 산길을 돌아 들어오는 여포군 기병
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 3, y: 0 }, level: 17, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 12, y: 0 }, level: 17, behavior: 'pursue' },
      ],
    },
  ],
}
