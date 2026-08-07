// 스테이지 2 "관문 방어전"
// 검증 목표: 증원 웨이브(턴 트리거), N턴 방어 승리, 보스 격파 2차 조건(보너스 경험치),
//            성벽/성문/성채 지형, guard AI

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_02: StageDef = {
  id: 'stage02',
  name: '관문 방어전',
  weather: 'clear',
  map: parseMap([
    'PPPPPPPPPPPPP',
    'PPPPPPPPPPPPP',
    'PPFFPPPPPFFPP',
    'PPPPPPPPPPPPP',
    'WPPPPPPPPPPPW',
    'WWPPPPPPPPPWW',
    'PPPPPPPPPPPPP',
    'PPPPPPPPPPPPP',
    'XXXXXXDXXXXXX',
    'PPPPPTPTPPPPP',
    'PPPPPPPPPPPPP',
    'PPPPPPPPPPPPP',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. ①조조 ②전위(성문 탱킹)가 강제출진
  playerSlots: [
    { x: 6, y: 10 }, // ① 조조
    { x: 6, y: 8 }, // ② 성문 — 전위 강제
    { x: 5, y: 9 }, // 성채 위
    { x: 7, y: 9 }, // 성채 위
    { x: 6, y: 9 },
    { x: 4, y: 10 }, // 기동 예비대
  ],
  deployMin: 4,
  deployMax: 6,
  forcedOfficers: ['caocao', 'dianwei'],
  units: [
    // 아군 — 성문 안쪽 방어선 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 6, y: 10 }, isLeader: true },
    { officerId: 'dianwei', faction: 'player', pos: { x: 6, y: 8 } }, // 성문 탱킹
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 9 } }, // 성채 위 궁병
    { officerId: 'guojia', faction: 'player', pos: { x: 7, y: 9 } }, // 성채 위 책사
    { officerId: 'xunyu', faction: 'player', pos: { x: 6, y: 9 } },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 4, y: 10 } }, // 기동 예비대
    // 적군 1파
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 5, y: 1 }, behavior: 'pursue' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 7, y: 1 }, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 6, y: 2 }, behavior: 'pursue' },
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 1 }, behavior: 'pursue' },
    // 보스 — 후방 대기 (잡으러 나가면 2차 승리 + 보너스, 버티면 1차 승리)
    { officerId: 'chengYuanzhi', faction: 'enemy', pos: { x: 6, y: 0 }, isBoss: true, behavior: 'guard' },
  ],
  victory: [
    { type: 'surviveTurns', turns: 8 },
    { type: 'defeatBoss' },
  ],
  bonusExp: 50,
  reinforcements: [
    {
      trigger: { type: 'turnStart', turn: 3 },
      units: [
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 0, y: 0 }, behavior: 'pursue' },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 12, y: 0 }, behavior: 'pursue' },
      ],
    },
    {
      trigger: { type: 'turnStart', turn: 5 },
      units: [
        { officerId: 'dengMao', faction: 'enemy', pos: { x: 5, y: 0 }, behavior: 'pursue' },
        { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 7, y: 0 }, behavior: 'pursue' },
      ],
    },
  ],
}
