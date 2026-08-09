// 스테이지 3 "황건 본진 소탕" — 서장 마지막 결전
// 검증 목표: 보스 격파 1차 승리 + 전멸 2차 조건, 협곡 병목(산지 이동 코스트), 성문 단일 진입로,
//            성채 위 보스(매턴 회복)와 요술사 사거리, 측면 증원 기병
// 지형 구성: 남쪽 진입로(초원/평지) → 중앙 산길 협곡(가운데 4칸 + 좌우 1칸 우회로) → 북쪽 성채 본진

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_03: StageDef = {
  id: 'stage03',
  name: '황건 본진 소탕',
  weather: 'clear',
  map: parseMap([
    'MMMXXXXXXXXXMMMM',
    'MMMXCCCTCCCXMMMM', // (7,1) 성채 = 장각
    'MMMXCCCCCCCXMMMM',
    'MMPPXXXDXXXPPPMM', // (7,3) 성문 = 유일한 진입로
    'PPPPPPPPPPPPPPPP',
    'PPFFMMPPPPMMFFPP',
    'PMMMMMPPPPMMMMMP', // 협곡: 가운데 x6~9, 좌우 끝 1칸이 측면 우회로
    'PPFFMMPPPPMMFFPP',
    'PPPPPPPPPPPPPPPP',
    'PPGGPPPPPPPPGGPP',
    'PGGVPPPPPPPPPGGP', // (3,10) 마을
    'GGPPPPPPPPPPPPGG',
    'GGGPPPPPPPPPPGGG',
  ]),
  // 출진 슬롯 — 인덱스 = 선택 순서 = 배치 위치. 남쪽 진입로에 5칸
  playerSlots: [
    { x: 7, y: 11 }, // ① 강제출진: 조조
    { x: 6, y: 11 },
    { x: 8, y: 11 },
    { x: 5, y: 11 },
    { x: 9, y: 11 },
  ],
  deployMin: 4,
  deployMax: 5,
  forcedOfficers: ['caocao'],
  units: [
    // 아군 — 남쪽 진입로 (출진 명단 없이 시작하는 자유 전투용 기본 배치)
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 11 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 6, y: 11 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 8, y: 11 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 5, y: 11 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 9, y: 11 } },
    // 적 — 협곡 전진 배치 (기병만 추격, 나머지는 진지 사수)
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 7, y: 6 }, level: 4, behavior: 'pursue' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 8, y: 6 }, level: 3, behavior: 'pursue' },
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 5 }, level: 3, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 9, y: 5 }, level: 3, behavior: 'guard' },
    // 적 — 성문 앞 방어선
    { officerId: 'zhangLiang', faction: 'enemy', pos: { x: 7, y: 4 }, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 6, y: 4 }, level: 4, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 4 }, level: 4, behavior: 'guard' },
    // 적 — 성내 수비대
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 5, y: 2 }, level: 4, behavior: 'guard' },
    { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 9, y: 2 }, level: 4, behavior: 'guard' },
    // 보스 — 성채 위 (매턴 회복). 격파하면 즉시 승리
    { officerId: 'zhangJiao', faction: 'enemy', pos: { x: 7, y: 1 }, isBoss: true, behavior: 'guard' },
  ],
  // 1차 = 전멸, 2차 = 장각 격파(협곡을 뚫는 정밀 타격 — 달성 시 보너스 경험치).
  // 순서 주의: 전멸은 보스 격파를 포함하므로 defeatBoss가 앞에 오면 2차 보너스가 영원히 안 뜬다.
  victory: [{ type: 'annihilation' }, { type: 'defeatBoss' }],
  bonusExp: 150,
  // 전리품 — 장각을 직접 잡아야 나오는 보물 ("특정 적 격파" 분류)
  loot: [{ trigger: 'bossKill', itemId: 'taipingYaoshu' }],
  reinforcements: [
    // 측면 산길로 돌아 나오는 기병 (좌우 끝 1칸 우회로)
    {
      trigger: { type: 'turnStart', turn: 4 },
      units: [
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 0, y: 6 }, level: 4, behavior: 'pursue' },
        { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 15, y: 6 }, level: 4, behavior: 'pursue' },
      ],
    },
  ],
}
