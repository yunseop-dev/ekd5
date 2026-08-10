// 스테이지 11 "하비 여포 포위전" — 제2부 최종전 (원작 1장 종반 하비, 난이도 보스)
// 검증 목표: 수공으로 침수된 전장 — 강(진입 불가)이 진입로를 3칸으로 졸라매는 구조,
//            성문(7,3) 단일 돌파 → 성내에서 여포(Lv20)·진궁(책략)·고순(방어)의 3연전,
//            보스 전용 전리품(방천화극 — 여포를 직접 잡아야 나온다)
// 지형 구성: 남쪽 개활지(출진) → 물길 사이 좁아지는 둑길(3~7칸) → (7,3) 성문 → 성내 + 성채 2
// 밸런스: 여포는 Lv20 + 방천화극·적토마다. 둑길에서 맞으면 아군이 전개할 폭이 없으므로
//         성문 앞까지 밀어붙여 진입 폭을 확보한 뒤 다수로 에워싸는 것이 정해.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_11: StageDef = {
  id: 'stage11',
  name: '하비 여포 포위전',
  weather: 'rain',
  map: parseMap([
    'CCCCCCCCCCCCCCCC',
    'CCCTCCCCCCCCTCCC', // (3,1)·(12,1) 성채 — 진궁·고순의 자리
    'CCCCCCCCCCCCCCCC',
    'XXXXXXXDXXXXXXXX', // (7,3) 성문 = 유일한 진입로
    'RRRRRRPPPRRRRRRR', // 침수 — 둑길 3칸
    'RRRRRPPPPPRRRRRR',
    'RRRRPPPPPPPRRRRR',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
  ]),
  // 출진 슬롯 — 물이 닿지 않은 남쪽 개활지. 둑길 입구를 향해 좁혀 선다
  playerSlots: [
    { x: 7, y: 8 }, // ① 강제출진: 조조
    { x: 6, y: 8 },
    { x: 8, y: 8 },
    { x: 5, y: 8 },
    { x: 9, y: 8 },
    { x: 7, y: 9 },
    { x: 4, y: 8 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 남쪽 개활지 (허저까지 합류한 7기 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 8 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 6, y: 8 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 8 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 8 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 9, y: 8 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 7, y: 9 } },
    { officerId: 'xuChu', faction: 'player', pos: { x: 4, y: 8 } },
    // 보스 — 여포. 성문이 열리는 순간 직접 나온다 (2부 최종 보스)
    { officerId: 'lüBu', faction: 'enemy', pos: { x: 7, y: 1 }, level: 20, isBoss: true, behavior: 'pursue' },
    // 진궁 — 성채 위에서 책략만 던진다 (매턴 회복 + 화룡)
    { officerId: 'chenGong', faction: 'enemy', pos: { x: 3, y: 1 }, level: 19, behavior: 'guard' },
    // 고순 — 반대쪽 성채. 성문 안쪽을 막는 마지막 벽
    { officerId: 'gaoShun', faction: 'enemy', pos: { x: 12, y: 1 }, level: 18, behavior: 'guard' },
    // 성문 안쪽 수비 보병 — 문을 열어도 바로 들어갈 수 없다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 6, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 7, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 2 }, level: 17, behavior: 'guard' },
    // 성벽 안 궁병 — 둑길로 올라오는 부대를 사거리로 때린다
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 5, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 9, y: 2 }, level: 17, behavior: 'guard' },
    // 둑길로 먼저 나와 있는 기병 — 좁은 길에서 정면으로 부딪친다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 6, y: 4 }, level: 18, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 8, y: 4 }, level: 18, behavior: 'pursue' },
  ],
  // 1차 = 여포 격파(하비 함락), 2차 = 전멸(진궁·고순까지) → 보너스 경험치
  victory: [{ type: 'defeatBoss' }, { type: 'annihilation' }],
  bonusExp: 200,
  // 전리품 — 방천화극은 여포를 직접 잡아야 나온다 (원작: 여포 사후에 극이 넘어온다)
  loot: [{ trigger: 'bossKill', itemId: 'fangtianHalberd' }],
  reinforcements: [
    // 턴 3 — 성 안쪽에서 성문으로 밀려나오는 마지막 예비대
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 6, y: 0 }, level: 17, behavior: 'pursue' },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 0 }, level: 17, behavior: 'pursue' },
      ],
    },
  ],
}
