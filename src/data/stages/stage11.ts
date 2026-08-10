// 스테이지 11 "하비 포위전" — 제2부 최종전 (원작 c14 하비, 난이도 보스)
// 검증 목표: 겨울 설원 + 북서→남동으로 흐르는 강을 다리 2개((3,5)·(11,7))로만 건너는 구조,
//            성문(7,3) 단일 돌파 → 성내에서 여포(Lv20)·진궁(책략)·고순(방어)의 3연전,
//            악천후(rain)로 화계 봉쇄 — 진궁의 화룡도, 아군의 화계도 통하지 않는다,
//            보스 전용 전리품(방천화극 — 여포를 직접 잡아야 나온다)
// 원작 충실: 수공·침수 연출은 원작에 없다. 원작 c14는 설원 + 강 + 다리 2개이고
//            악천후로 화계가, 성내전이라 지·풍계가 막힌다 (statuses.md §4).
//            weather 'rain'이 우리 시스템에서 그 화계 봉쇄에 대응한다.
//            (평지 타일은 눈에 덮인 들판으로 읽는다 — 전용 설원 지형은 v1.0 범위 밖)
// 지형 구성: 남쪽 설원(출진) → 대각선 강 + 다리 2개 → 성문 앞 광장 → (7,3) 성문 → 성내 + 성채 2
// 밸런스: 여포는 Lv20 + 방천화극·적토마다. 다리에서 맞으면 아군이 전개할 폭이 없으므로
//         강을 먼저 건너 광장에서 진형을 펴고 다수로 에워싸는 것이 정해.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_11: StageDef = {
  id: 'stage11',
  name: '하비 포위전',
  // 악천후 — 원작 c14의 "화계 불가"를 우리 날씨 시스템으로 재현한다
  weather: 'rain',
  map: parseMap([
    'CCCCCCCCCCCCCCCC',
    'CCCTCCCCCCCCTCCC', // (3,1)·(12,1) 성채 — 진궁·고순의 자리
    'CCCCCCCCCCCCCCCC',
    'XXXXXXXDXXXXXXXX', // (7,3) 성문 = 성으로 드는 유일한 길
    'PPPPPPPPPPPPPPPP', // 성문 앞 광장 (강 북안)
    'RRRBRRPPPPPPPPPP', // 강 — 북서에서 시작. (3,5) 다리
    'PPPPRRRRRRPPPPPP',
    'PPPPPPPPRRRBRRPP', // (11,7) 다리
    'PPPPPPPPPPPPRRRR', // 강 — 남동으로 빠져나간다
    'PPPPPPPPPPPPPPPP',
  ]),
  // 출진 슬롯 — 강 남안의 설원. 두 다리 접근로(x=3 서 / x=11 동)에 맞춰 선다
  playerSlots: [
    { x: 7, y: 9 }, // ① 강제출진: 조조
    { x: 6, y: 9 },
    { x: 8, y: 9 },
    { x: 5, y: 9 },
    { x: 9, y: 9 },
    { x: 3, y: 9 },
    { x: 11, y: 9 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 강 남안의 설원 (허저까지 합류한 7기 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 9 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 6, y: 9 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 9 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 9 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 9, y: 9 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 3, y: 9 } },
    { officerId: 'xuChu', faction: 'player', pos: { x: 11, y: 9 } },
    // 보스 — 여포. 성문이 열리는 순간 직접 나온다 (2부 최종 보스)
    // 최종 보스 — 성문 밖으로 나오면 스스로 포위당해 싱거워진다. 원작 하비처럼 농성한다
    { officerId: 'lüBu', faction: 'enemy', pos: { x: 7, y: 1 }, level: 20, isBoss: true, behavior: 'guard' },
    // 진궁 — 성채 위에서 책략만 던진다 (매턴 회복 + 화룡)
    { officerId: 'chenGong', faction: 'enemy', pos: { x: 3, y: 1 }, level: 19, behavior: 'guard' },
    // 고순 — 반대쪽 성채. 성문 안쪽을 막는 마지막 벽
    { officerId: 'gaoShun', faction: 'enemy', pos: { x: 12, y: 1 }, level: 18, behavior: 'guard' },
    // 성문 안쪽 수비 보병 — 문을 열어도 바로 들어갈 수 없다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 6, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 7, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 8, y: 2 }, level: 17, behavior: 'guard' },
    // 성벽 안 궁병 — 광장으로 올라오는 부대를 사거리로 때린다
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 5, y: 2 }, level: 17, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 9, y: 2 }, level: 17, behavior: 'guard' },
    // 광장에 나와 있는 기병 — 다리를 건너오는 부대를 정면으로 맞는다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 4, y: 4 }, level: 18, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 11, y: 4 }, level: 18, behavior: 'pursue' },
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
