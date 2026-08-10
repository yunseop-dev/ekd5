// 스테이지 7 "청주 평정" — 제2부 「연주에서 서주로」 첫 전투 (원작 1장 후반 청주 황건, 난이도 E)
// 검증 목표: 사방이 트인 개활지에서의 물량전(초기 9기 + 2단 증원 5기 = 총 14기),
//            구릉(산지)을 엄폐물로 쓰는 진형, 두목(관해) 격파로도 끝나는 승리조건
// 지형 구성: 남쪽 개활지(출진) → 중앙 초원 덤불 → 좌우 구릉 두 덩이 → 북쪽 황건 진채
// 밸런스: 적은 Lv12~13(2부 진입 시 아군 예상 Lv13~14에 러버밴딩)이지만 능력치가 낮고
//         유민 무리라 방어구가 없다 — 머릿수로 압박하고 개별 전투력으로는 밀리는 구도.
//         AI 자동 시뮬 5시드 기준 Lv13 로스터 승률 40% / Lv14 80%.

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
    // 두목 — 관해. 진채를 등지고 버틴다 (2차 승리조건 대상). 유일하게 방어구를 갖췄다
    { officerId: 'guanHai', faction: 'enemy', pos: { x: 6, y: 0 }, isBoss: true, behavior: 'guard' },
    // 황건 요술사 — 두목 옆에서 책략만 던진다
    { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 7, y: 0 }, level: 12, behavior: 'guard' },
    // 본진 보병 — 진채를 지킨다. 유민 무리라 방어구가 없다 (스테이지 장비 오버라이드)
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 5, y: 1 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 7, y: 1 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'guard' },
    // 궁병 — 진채 뒤에서 사거리로 견제
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 3, y: 0 }, level: 12, equipment: { weapon: 'woodBow' }, behavior: 'guard' },
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 9, y: 0 }, level: 12, equipment: { weapon: 'woodBow' }, behavior: 'guard' },
    // 기병 — 구릉을 돌아 먼저 달려나오는 선봉
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 2, y: 3 }, level: 13, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 6, y: 2 }, level: 13, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 11, y: 3 }, level: 13, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
  ],
  // 1차 = 전멸, 2차 = 관해 격파 (달성 시 보너스 경험치 — stage04와 같은 관례).
  // 승리조건은 OR이므로 두목만 베어도 전투가 끝난다 — 물량을 다 지울 필요는 없다.
  victory: [{ type: 'annihilation' }, { type: 'defeatBoss' }],
  bonusExp: 150,
  // 물량은 한꺼번에 오지 않는다 — 2단 증원으로 나눠 들어와 총 14기가 된다.
  // (한 덩이로 두면 개활지에서 아군이 전 병력에게 동시에 포위돼 난이도 E가 성립하지 않는다)
  reinforcements: [
    // 턴 3 — 진채 뒤에서 밀려나오는 본대
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 4, y: 2 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'pursue' },
        { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 2 }, level: 12, equipment: { weapon: 'woodSword' }, behavior: 'pursue' },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 0, y: 6 }, level: 13, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
      ],
    },
    // 턴 5 — 좌우에서 합류하는 후미대
    {
      trigger: { type: 'turnStart', turn: 5 },
      units: [
        { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 10, y: 1 }, level: 12, equipment: { weapon: 'woodBow' }, behavior: 'pursue' },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 13, y: 6 }, level: 13, equipment: { weapon: 'woodSpear' }, behavior: 'pursue' },
      ],
    },
  ],
}
