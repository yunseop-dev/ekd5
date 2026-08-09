// 스테이지 6 "동탁 추격전" — 제1부 선택지 분기 전투 (원작 03 동탁 추격전, 난이도 A · 스킵 가능)
// 검증 목표: 미끼 소부대를 쫓다 숲에 걸리는 매복 구조, 턴 2 측면 + 턴 3 후방의 2단 증원,
//            전멸 단일 승리조건(도망칠 곳이 없다), 제1부 최고 난이도
// 지형 구성: 사방이 트인 개활지 + 남북/좌우 숲 덤불 — 시야는 좋으나 측면이 전부 열려 있다
// 밸런스: 미끼는 Lv8이지만 매복 본대는 Lv10이다(원작 러버밴딩 — 종반 적은 아군 평균에 연동).
//         기본 장비 시뮬 20판 기준 Lv12 로스터 승률 45%지만 무구성장을 거친 캠페인 로스터는 뚫는다.
//         선택지에서 "그만둔다"로 통째로 건너뛸 수 있는 전투라 의도적으로 벽을 높게 뒀다.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_06: StageDef = {
  id: 'stage06',
  name: '동탁 추격전',
  weather: 'clear',
  map: parseMap([
    'GGPPPPPPPPPPPPGG',
    'GPPPFFPPPPFFPPPG',
    'PPPFFPPPPPPFFPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PFFPPPPPPPPPPFFP',
    'PFFPPPPPPPPPPFFP',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
    'PPPFFPPPPPPFFPPP',
    'GPPPFFPPPPFFPPPG',
    'GGPPPPPPPPPPPPGG',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. 서쪽 개활지에 6칸
  playerSlots: [
    { x: 1, y: 4 }, // ① 강제출진: 조조
    { x: 1, y: 3 },
    { x: 1, y: 7 },
    { x: 1, y: 8 },
    { x: 0, y: 4 },
    { x: 0, y: 7 },
  ],
  deployMin: 4,
  deployMax: 6,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 서쪽에서 동쪽 낙양 방면으로 추격 (자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 1, y: 4 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 1, y: 3 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 1, y: 7 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 1, y: 8 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 0, y: 4 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 0, y: 7 } },
    // 적 — 미끼 후미대. 수가 적어 쫓아붙기 쉽다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 9, y: 5 }, level: 8, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 9, y: 6 }, level: 8, behavior: 'pursue' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 4 }, level: 8, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 11, y: 5 }, level: 8, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 10, y: 7 }, level: 8, behavior: 'guard' },
  ],
  // 매복이 드러나면 물러설 길이 없다 — 전멸만이 승리
  victory: [{ type: 'annihilation' }],
  reinforcements: [
    // 턴 2 — 남북 숲에서 튀어나오는 측면 기병
    {
      trigger: { type: 'turnStart', turn: 2 },
      units: [
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 4, y: 0 }, level: 10, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 12, y: 0 }, level: 10, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 4, y: 11 }, level: 10, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 12, y: 11 }, level: 10, behavior: 'pursue' },
      ],
    },
    // 턴 3 — 동쪽 후방에서 이유가 직접 이끌고 나타나는 본대
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'liRu', faction: 'enemy', pos: { x: 15, y: 5 }, behavior: 'guard' },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 15, y: 4 }, level: 10, behavior: 'pursue' },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 15, y: 6 }, level: 10, behavior: 'pursue' },
        { officerId: 'westArcher', faction: 'enemy', pos: { x: 15, y: 7 }, level: 10, behavior: 'pursue' },
      ],
    },
  ],
}
