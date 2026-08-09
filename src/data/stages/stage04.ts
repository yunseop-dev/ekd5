// 스테이지 4 "사수관 전투" — 제1부 「패왕 탄생」 첫 전투 (원작 01 사수관, 난이도 C)
// 검증 목표: 서→동 진격, 관문(성벽+성문 단일 진입로) 돌파, 성문 뒤 보스(화웅) 방어,
//            정규군(서량병 Lv4, 방어구 보유) 다수 + 턴 3 관문 안쪽 증원
// 지형 구성: 서쪽 개활지(출진) → 숲 두 곳을 낀 접근로 → x=11 관문 벽 + (11,5) 성문 → 동쪽 관내(성채 2)

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_04: StageDef = {
  id: 'stage04',
  name: '사수관 전투',
  weather: 'clear',
  map: parseMap([
    'MMMMMMMMMMMXCCCM',
    'MMPPPPPPPPMXCTCM', // (13,1) 성채
    'PPPPPFFPPPPXCCCM',
    'PPPPPPPPPPPXCCCM',
    'PPPPPPPPPPPXCTCM', // (13,4) 성채
    'PPPPPPPPPPPDCCCM', // (11,5) 성문 = 관문의 유일한 진입로
    'PPPPPPPPPPPXCCCM',
    'PPPPPFFPPPPXCCCM',
    'MMPPPPPPPPMXCCCM',
    'MMMMMMMMMMMXXXXM',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. 서쪽 개활지에 6칸
  playerSlots: [
    { x: 0, y: 4 }, // ① 강제출진: 조조
    { x: 0, y: 5 },
    { x: 1, y: 3 },
    { x: 1, y: 6 },
    { x: 0, y: 3 },
    { x: 0, y: 6 },
  ],
  deployMin: 4,
  deployMax: 6,
  // 원작 사수관 강제출진: ①조조 ②하후돈 (campaign-ux.md 1부 §7.1 표)
  forcedOfficers: ['caocao', 'xiahoudun'],
  units: [
    // 아군 — 서쪽 개활지 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 4 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 0, y: 5 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 1, y: 3 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 1, y: 6 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 0, y: 3 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 0, y: 6 } },
    // 적 — 관문 앞 야전 방어선. 기병만 마중 나오고 나머지는 관을 등지고 버틴다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 9, y: 3 }, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 9, y: 7 }, behavior: 'pursue' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 4 }, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 6 }, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 9, y: 5 }, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 10, y: 3 }, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 10, y: 7 }, behavior: 'guard' },
    // 적 — 관내 수비 (성채 위 궁병)
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 13, y: 1 }, behavior: 'guard' },
    // 보스 — 성문 바로 뒤. 문을 열지 않으면 닿을 수 없다
    { officerId: 'huaXiong', faction: 'enemy', pos: { x: 12, y: 5 }, isBoss: true, behavior: 'guard' },
  ],
  // 1차 = 전멸, 2차 = 화웅 격파(관문 돌파 정밀 타격 — 달성 시 보너스 경험치)
  victory: [{ type: 'annihilation' }, { type: 'defeatBoss' }],
  bonusExp: 150,
  reinforcements: [
    // 관 안쪽에서 성문으로 밀려나오는 증원 (성채 회복을 낀 지구전 압박)
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 13, y: 4 }, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 13, y: 6 }, behavior: 'pursue' },
      ],
    },
  ],
}
