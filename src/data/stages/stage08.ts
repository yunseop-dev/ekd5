// 스테이지 8 "서주 침공" — 제2부 두 번째 전투 (원작 1장 후반 서주 침공, 난이도 B)
// 검증 목표: 강(진입 불가)으로 갈린 전장을 다리 2개로만 건너는 도하전, 병력 분할 판단,
//            1차 보스(조표) 격파 / 2차 전멸 — 본진의 도겸은 비(非)보스라 잡지 않아도 이긴다
// 지형 구성: 남쪽 개활지(출진) → 숲 두 덤불 → y=5 강 + (4,5)·(11,5) 다리 → 북쪽 서주성(성내 + 성채 2)
// 밸런스: 서주군은 Lv13~14 정규군(방어구 보유). 다리 목을 지키는 방어측이 유리하므로
//         한쪽 다리에 병력을 모아 돌파하는 것이 정해다.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_08: StageDef = {
  id: 'stage08',
  name: '서주 침공',
  weather: 'clear',
  map: parseMap([
    'MPPPCCCCCCCCPPPM',
    'PPPPCCTCCTCCPPPP', // (6,1)·(9,1) 성채 — 도겸 본진
    'PPPPCCCCCCCCPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'RRRRBRRRRRRBRRRR', // (4,5)·(11,5) 다리 = 유일한 도하 지점
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPFFPPPPPPFFPPP',
    'PPPPPPPPPPPPPPPP',
    'MPPPPPPPPPPPPPPM',
    'MMPPPPPPPPPPPPMM',
  ]),
  // 출진 슬롯 — 두 다리 앞으로 나뉘어 선다 (①~③ 서쪽 다리 / ④~⑥ 동쪽 다리)
  playerSlots: [
    { x: 4, y: 9 }, // ① 강제출진: 조조
    { x: 3, y: 9 },
    { x: 5, y: 9 },
    { x: 11, y: 9 },
    { x: 10, y: 9 },
    { x: 12, y: 9 },
    { x: 4, y: 10 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 강 남안 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 4, y: 9 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 3, y: 9 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 5, y: 9 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 11, y: 9 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 10, y: 9 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 12, y: 9 } },
    // 보스 — 조표. 서쪽 다리 북안을 직접 막는다
    { officerId: 'caoBao', faction: 'enemy', pos: { x: 4, y: 4 }, isBoss: true, behavior: 'guard' },
    // 서쪽 다리 목 수비
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 3, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 5, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 4, y: 3 }, level: 13, behavior: 'guard' },
    // 동쪽 다리 목 수비 — 이쪽이 더 두껍다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 11, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 12, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 11, y: 3 }, level: 13, behavior: 'guard' },
    // 유격 기병 — 다리를 건너온 부대를 먼저 덮친다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 7, y: 3 }, level: 14, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 8, y: 3 }, level: 14, behavior: 'pursue' },
    // 성채 위 궁병 — 매턴 회복하며 버틴다
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 6, y: 1 }, level: 14, behavior: 'guard' },
    // 도겸 — 본진 성채에서 움직이지 않는다. 보스가 아니므로 격파는 승리 조건이 아니다
    { officerId: 'taoQian', faction: 'enemy', pos: { x: 9, y: 1 }, behavior: 'guard' },
  ],
  // 1차 = 조표 격파(수성 지휘가 무너지면 성문이 열린다), 2차 = 전멸(도겸까지 정리) → 보너스
  victory: [{ type: 'defeatBoss' }, { type: 'annihilation' }],
  bonusExp: 150,
  reinforcements: [
    // 턴 3 — 성내에서 다리 쪽으로 내려오는 증원
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 7, y: 2 }, level: 13, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 8, y: 2 }, level: 14, behavior: 'pursue' },
      ],
    },
  ],
}
