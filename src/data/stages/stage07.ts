// 스테이지 7 "청주 평정" — 제2부 「연주에서 서주로」 첫 전투 (원작 1장 후반 청주 황건, 난이도 E)
// 검증 목표: 사방이 트인 개활지에서의 물량전(초기 9기 + 턴3 증원 3기 = 총 12기),
//            구릉(산지)을 엄폐물로 쓰는 진형, **적장 없는 전멸 단일 승리조건**
// 원작 충실: 원작 c04 청주는 적장이 한 명도 없고 황건 익명 부대만 나온다 (statuses.md §4).
//            관해(管亥)는 원작 512인 명부에 없는 영걸전 인물이라 두목 유닛을 두지 않았고,
//            그래서 defeatBoss 2차 조건도 bonusExp도 없다 — 물량을 끝까지 지워야 이긴다.
// 지형 구성: 남쪽 개활지(출진) → 중앙 초원 덤불 → 좌우 구릉 두 덩이 → 북쪽 황건 진채
// 밸런스: 적은 Lv12~13(2부 진입 시 아군 예상 Lv13~14에 러버밴딩)이지만 능력치가 낮고
//         유민 무리라 방어구가 없다 — 머릿수로 압박하고 개별 전투력으로는 밀리는 구도.
//         보스 격파 지름길이 사라진 대신 총량을 14 → 12기로 줄여 난이도 E를 유지했다.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_07: StageDef = {
  id: 'stage07',
  name: '청주 평정',
  weather: 'clear',
  map: parseMap([
    'PPPPPPPPPPPPPP',
    'PPPGGPPPPGGPPP',
    'PPPGGPPPPGGPPP',
    'PPPPPPPPPPPPPP',
    'PPMMPPPPPPMMPP', // 좌우 구릉 — 기병의 발을 묶는 두 덩이
    'PPMMPPPPPPMMPP',
    'PPPPPPPPPPPPPP',
    'PPPPPGGPPPPPPP',
    'PPPPPGGPPPPPPP',
    'PPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPP',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. 남쪽 개활지에 7칸 (2부부터 출진 상한 7)
  playerSlots: [
    { x: 6, y: 10 }, // ① 강제출진: 조조
    { x: 5, y: 10 },
    { x: 7, y: 10 },
    { x: 4, y: 10 },
    { x: 8, y: 10 },
    { x: 6, y: 11 },
    { x: 9, y: 10 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 남쪽 개활지 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 6, y: 10 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 5, y: 10 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 7, y: 10 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 4, y: 10 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 8, y: 10 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 6, y: 11 } },
    // 황건 요술사 — 진채에서 책략만 던진다. 적장이 없는 전장의 유일한 책략 위협
    { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 6, y: 0 }, level: 12, behavior: 'guard' },
    // 본진 보병 — 진채를 지킨다. 유민 무리라 방어구가 없다 (스테이지 장비 오버라이드)
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 7, y: 0 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 5, y: 1 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 7, y: 1 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'guard' },
    // 궁병 — 진채 뒤에서 사거리로 견제
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 0 }, level: 12, equipment: { weapon: 'woodBow' }, behavior: 'guard' },
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 9, y: 0 }, level: 12, equipment: { weapon: 'woodBow' }, behavior: 'guard' },
    // 기병 — 구릉을 돌아 먼저 달려나오는 선봉. 보스 격파 지름길이 없는 전멸전이라 Lv12로 맞췄다
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 2, y: 3 }, level: 12, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 6, y: 2 }, level: 12, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 11, y: 3 }, level: 12, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
  ],
  // 전멸 단일 — 적장이 없으므로 2차 조건도 보너스 경험치도 없다 (원작 c04 충실)
  victory: [{ type: 'annihilation' }],
  // 물량은 한꺼번에 오지 않는다 — 턴 3 증원으로 나눠 들어와 총 12기가 된다.
  // (한 덩이로 두면 개활지에서 아군이 전 병력에게 동시에 포위돼 난이도 E가 성립하지 않는다)
  reinforcements: [
    // 턴 3 — 진채 뒤에서 밀려나오는 본대
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 2 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'pursue' },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 2 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'pursue' },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 0, y: 6 }, level: 12, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
      ],
    },
  ],
}
