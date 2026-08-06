// 스테이지 1 "연습전 — 강가의 황건적"
// 검증 목표: 이동/지형 코스트(숲·산·강·다리), 상성, 책략, 마을 회복, 기본 AI(추격/경계)

import type { StageDef } from '../../core/types'
import { parseMap } from './parseMap'

export const STAGE_01: StageDef = {
  id: 'stage01',
  name: '연습전 — 강가의 황건적',
  weather: 'clear',
  map: parseMap([
    'GGPPPPPPPPPPFFM',
    'GPPPPPPPPPPPFFM',
    'PPPPPPPPPPPPFFM',
    'PPPPPPPPPPPPPFM',
    'RRRRRBBRRRRRRRR',
    'RRRRRBBRRRRRRRR',
    'PPPPPPPPPPPPWWW',
    'PPPPVPPPPPPPWWW',
    'PPPPPPPPPPPPPWW',
    'PPFFPPPPPPPPPPW',
    'PFFFPPPPPPPPPPP',
    'PFFPPPPPPPPPPPP',
  ]),
  units: [
    // 아군 — 강 남쪽에서 시작
    { officerId: 'caocao', faction: 'player', pos: { x: 7, y: 10 }, isLeader: true },
    { officerId: 'xiahoudun', faction: 'player', pos: { x: 5, y: 9 } },
    { officerId: 'dianwei', faction: 'player', pos: { x: 6, y: 9 } },
    { officerId: 'xiahouyuan', faction: 'player', pos: { x: 7, y: 9 } },
    { officerId: 'guojia', faction: 'player', pos: { x: 8, y: 9 } },
    // 적군 — 강 북쪽. 다리목 경계병 + 추격조
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 5, y: 3 }, behavior: 'guard' },
    { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 8, y: 2 }, behavior: 'pursue' },
    { officerId: 'yellowArcher', faction: 'enemy', pos: { x: 6, y: 1 }, behavior: 'guard' },
    { officerId: 'yellowCavalry', faction: 'enemy', pos: { x: 9, y: 2 }, behavior: 'pursue' },
    { officerId: 'yellowShaman', faction: 'enemy', pos: { x: 6, y: 0 }, behavior: 'guard' },
  ],
  victory: [{ type: 'annihilation' }],
  reinforcements: [],
}
