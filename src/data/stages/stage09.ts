// 스테이지 9 "복양 전투" — 제2부 세 번째 전투 (원작 1장 후반 복양, 난이도 A)
// 검증 목표: 성벽(진입 불가) 블록으로 갈린 시가전 — 기병이 달릴 직선이 없다,
//            보스 여포(Lv18 pursue) 조우 + 후방 진궁(참모 = 2차 병과)의 공격·방해 책략,
//            턴 3 좌우 골목 측면 증원. 1차 여포 격파 = 원작 "여포 퇴각" 재현
// 지형 구성: 남쪽 성밖 개활지(출진) → 성내 격자 시가지 (가로 골목 y=0/3/6/9, 세로 골목 x=0/4·5/10·11/15)
// 밸런스: 여포는 방천화극·적토마를 지닌 Lv18이라 정면 1:1은 불가 — 골목에 가두고 다수로 에워싸야 한다.
//         진궁이 화룡(2차 전용)을 쏘므로 뭉쳐 서면 광역으로 녹는다.
//         AI 자동 시뮬 5시드 기준 Lv16 로스터 승률 0% / Lv18 80% — 성장 없이는 넘을 수 없는 벽이다.

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_09: StageDef = {
  id: 'stage09',
  name: '복양 전투',
  weather: 'clear',
  map: parseMap([
    'CCCCCCCCCCCCCCCC',
    'CXXXCCXXXXCCXXXC',
    'CXXXCCXXXXCCXXXC',
    'CCCCCCCCCCCCCCCC',
    'CXXXCCXXXXCCXXXC',
    'CXXXCCXXXXCCXXXC',
    'CCCCCCCCCCCCCCCC',
    'CXXXCCXXXXCCXXXC',
    'CXXXCCXXXXCCXXXC',
    'CCCCCCCCCCCCCCCC',
    'PPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPP',
  ]),
  // 출진 슬롯 — 성 남쪽 개활지. 두 세로 골목(x=5 / x=10) 입구에 맞춰 선다
  playerSlots: [
    { x: 5, y: 11 }, // ① 강제출진: 조조
    { x: 4, y: 11 },
    { x: 6, y: 11 },
    { x: 10, y: 11 },
    { x: 11, y: 11 },
    { x: 5, y: 10 },
    { x: 10, y: 10 },
  ],
  deployMin: 5,
  deployMax: 7,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 성 남쪽 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 5, y: 11 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 4, y: 11 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 6, y: 11 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 10, y: 11 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 11, y: 11 } },
    { officerId: 'xunyu', faction: 'player', pos: { x: 5, y: 10 } },
    // 보스 — 여포. 시가지 중앙 교차로에서 첫 턴부터 밀고 내려온다
    { officerId: 'lüBu', faction: 'enemy', pos: { x: 5, y: 3 }, level: 18, isBoss: true, behavior: 'pursue' },
    // 호위 기병 — 한 기만 여포를 따라 나오고, 다른 한 기는 교차로를 지킨다
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 4, y: 3 }, level: 16, behavior: 'pursue' },
    { officerId: 'westCavalry', faction: 'enemy', pos: { x: 10, y: 3 }, level: 15, behavior: 'guard' },
    // 골목 수비 보병 — 교차로를 막고 버틴다
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 5, y: 6 }, level: 14, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 10, y: 6 }, level: 14, behavior: 'guard' },
    { officerId: 'westInfantry', faction: 'enemy', pos: { x: 0, y: 6 }, level: 14, behavior: 'guard' },
    // 성 북쪽 큰길의 궁병
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 4, y: 0 }, level: 14, behavior: 'guard' },
    { officerId: 'westArcher', faction: 'enemy', pos: { x: 11, y: 0 }, level: 14, behavior: 'guard' },
    // 진궁 — 최후방에서 책략만 던진다 (참모 = 화룡 사거리 3 십자)
    { officerId: 'chenGong', faction: 'enemy', pos: { x: 10, y: 0 }, behavior: 'guard' },
  ],
  // 1차 = 여포 격파(원작 "여포 퇴각"), 2차 = 전멸(진궁까지 정리) → 보너스 경험치
  victory: [{ type: 'defeatBoss' }, { type: 'annihilation' }],
  bonusExp: 150,
  reinforcements: [
    // 턴 3 — 좌우 끝 세로 골목에서 돌아 나오는 측면대
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 0, y: 9 }, level: 15, behavior: 'pursue' },
        { officerId: 'westCavalry', faction: 'enemy', pos: { x: 15, y: 9 }, level: 15, behavior: 'pursue' },
        { officerId: 'westInfantry', faction: 'enemy', pos: { x: 15, y: 6 }, level: 14, behavior: 'pursue' },
      ],
    },
  ],
}
