// 스테이지 8 "서주 침공" — 제2부 두 번째 전투 (원작 1장 후반 서주 침공, 난이도 B)
// 검증 목표: 강(진입 불가)으로 갈린 전장을 다리 2개로만 건너는 도하전, 병력 분할 판단,
//            1차 보스(도겸) 격파 / 2차 전멸, **턴 8 유비군 3기 적 원군**(배후 등장)
// 원작 충실: 원작 c05의 승리조건은 도겸 격파이고(조표는 원작 명부에 없는 인물이라 삭제),
//            8턴에 유비·관우·장비가 **적 원군**으로 들이닥친다 (statuses.md §4).
//            공략에서 "원군이 뜨면 순순히 물러나라"고 할 정도의 정예 —
//            즉 8턴 안에 도겸을 잡는 것이 정석이고, 전멸(2차 보너스)을 노리면 원군과 맞붙게 된다.
//            서주 수성의 실존 적장 조성(曹性)은 서쪽 다리 목 부장으로 배치했다.
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
    // 조성 — 서쪽 다리 북안을 막는 부장 (원작 궁기병 → 궁병 재편성)
    { officerId: 'caoXing', faction: 'enemy', pos: { x: 4, y: 4 }, behavior: 'guard' },
    // 서쪽 다리 목 수비
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 3, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 5, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 4, y: 3 }, level: 13, behavior: 'guard' },
    // 동쪽 다리 목 수비 — 이쪽이 더 두껍다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 12, y: 4 }, level: 13, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 11, y: 3 }, level: 13, behavior: 'guard' },
    // 유격 기병 — 다리를 건너온 부대를 먼저 덮친다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 7, y: 3 }, level: 13, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 8, y: 3 }, level: 13, behavior: 'pursue' },
    // 성채 위 궁병 — 매턴 회복하며 버틴다
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 6, y: 1 }, level: 14, behavior: 'guard' },
    // 보스 — 도겸. 성내 앞줄에서 움직이지 않는다 (원작 c05 승리조건 = 도겸 격파).
    // 성채(회복)가 아니라 성내에 두는 이유: 8턴 안에 닿을 수 있어야 유비군 원군이 압박으로 기능한다
    { officerId: 'taoQian', faction: 'enemy', pos: { x: 9, y: 2 }, isBoss: true, behavior: 'guard' },
  ],
  // 1차 = 도겸 격파(원작 승리조건), 2차 = 전멸 → 보너스.
  // 전멸을 노리면 턴 8 유비군까지 상대해야 하므로 보너스와 안전이 정면으로 충돌한다.
  victory: [{ type: 'defeatBoss' }, { type: 'annihilation' }],
  bonusExp: 150,
  reinforcements: [
    // 턴 3 — 성내에서 다리 쪽으로 내려오는 증원
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [{ officerId: 'westCavalry', faction: 'enemy', pos: { x: 8, y: 2 }, level: 13, behavior: 'pursue' }],
    },
    // 턴 8 — 도겸의 구원 요청에 응한 유비군이 **적 원군**으로 배후(남쪽)에 도착한다.
    // 레벨은 이 스테이지 적 평균(≈13.4) +2 = 16 — 3기뿐이지만 개별 전투력이 서주군과 다르다.
    {
      trigger: { type: 'turnStart', turn: 8 },
      units: [
        { officerId: 'liuBei', faction: 'enemy', pos: { x: 12, y: 11 }, level: 16, behavior: 'pursue' },
        { officerId: 'guanYu', faction: 'enemy', pos: { x: 11, y: 11 }, level: 16, behavior: 'pursue' },
        { officerId: 'zhangFei', faction: 'enemy', pos: { x: 13, y: 11 }, level: 16, behavior: 'pursue' },
      ],
    },
  ],
}
