// 스테이지 5 "호로관 전투" — 제1부 두 번째 전투 (원작 02 호로관, 난이도 B)
// 검증 목표: 협로(산지에 낀 2칸 목) 병목, 초반부터 돌진하는 최강 보스(여포),
//            보스 격파 단일 승리조건(= 원작 "여포 퇴각"), 보스 전용 전리품(적토마)
// 지형 구성: 남쪽 개활지(출진) → 숲을 낀 어귀 → 중앙 협로 2칸 → 북쪽 관내(이유 본진)

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_05: StageDef = {
  id: 'stage05',
  name: '호로관 전투',
  weather: 'clear',
  map: parseMap([
    'MMMMPPPPPPMMMM',
    'MMMMPPPPPPMMMM',
    'MMMMMPPPPMMMMM',
    'MMMMMMPPMMMMMM', // 협로 최협부 — 가로 2칸
    'MMMMMMPPMMMMMM',
    'MMMMMPPPPMMMMM',
    'MMMFFPPPPFFMMM',
    'MMPPPPPPPPPPMM',
    'MPPPPPPPPPPPPM',
    'PPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPP',
    'MPPPPPPPPPPPPM',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. 남쪽 개활지에 6칸
  playerSlots: [
    { x: 7, y: 10 }, // ① 강제출진: 조조
    { x: 6, y: 10 },
    { x: 8, y: 10 },
    { x: 5, y: 10 },
    { x: 9, y: 10 },
    { x: 7, y: 11 },
  ],
  // 여포를 상대하려면 머릿수가 필요하다 — 최소 출진이 다른 스테이지보다 한 명 많다
  deployMin: 5,
  deployMax: 6,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 남쪽 개활지 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 10 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 6, y: 10 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 10 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 10 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 9, y: 10 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 7, y: 11 } },
    // 보스 — 여포. 협로에 서서 기다리지 않고 첫 턴부터 밀고 내려온다
    { officerId: 'lüBu', faction: 'enemy', pos: { x: 7, y: 3 }, isBoss: true, behavior: 'pursue' },
    // 호위 정예 — 여포를 따라 함께 밀고 나온다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 6, y: 3 }, level: 5, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 6, y: 4 }, level: 5, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 7, y: 4 }, level: 5, behavior: 'pursue' },
    // 관내 수비 — 협로 뒤에서 진지를 지킨다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 5, y: 2 }, level: 5, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 2 }, level: 5, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 5, y: 1 }, level: 5, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 9, y: 1 }, level: 5, behavior: 'guard' },
    // 이유 — 관 안쪽 본진에서 책략만 던진다
    { officerId: 'liRu', faction: 'enemy', pos: { x: 7, y: 0 }, behavior: 'guard' },
  ],
  // 원작 "여포 퇴각" 재현 — 여포만 무너뜨리면 나머지 서량군은 관으로 물러난다
  victory: [{ type: 'defeatBoss' }],
  // 전리품 — 적토마는 여포를 직접 잡아야 나온다 (방천화극은 원작대로 여포의 것으로 남는다)
  loot: [{ trigger: 'bossKill', itemId: 'chituma' }],
  reinforcements: [],
}
