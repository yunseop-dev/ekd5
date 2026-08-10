// validateStage 규칙 테스트 — 손상된 스테이지 JSON이 전투에 들어가지 못하게 막는다.
// 규칙을 지우거나 느슨하게 하면 여기서 걸린다.

import { describe, expect, it } from 'vitest'
import { STAGES } from './index'
import { mapToRows } from './parseMap'
import { stageToJson, validateStage, validateStageVerbose } from './validateStage'

/** 최소 유효 스테이지 — 각 테스트가 여기서 한 곳만 망가뜨려 거부를 확인한다 */
function baseStage(): Record<string, unknown> {
  return {
    id: 'custom-test',
    name: '검증용 스테이지',
    weather: 'clear',
    map: { rows: ['PPPP', 'PPPP', 'PPPP'] },
    units: [
      { officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true },
      { officerId: 'lüBu', faction: 'enemy', pos: { x: 3, y: 2 } },
      { officerId: 'westInfantry', faction: 'enemy', pos: { x: 2, y: 2 } },
      { officerId: 'westInfantry', faction: 'enemy', pos: { x: 1, y: 2 } },
    ],
    victory: [{ type: 'annihilation' }],
    reinforcements: [],
  }
}

/** 스테이지를 한 군데 망가뜨린 뒤 거부 여부와 오류 문구를 본다 */
function rejects(mutate: (stage: Record<string, unknown>) => void, messagePattern: RegExp) {
  const stage = baseStage()
  mutate(stage)
  const result = validateStageVerbose(stage)
  expect(result.stage, `거부되어야 한다: ${messagePattern}`).toBeNull()
  expect(result.errors.join('\n')).toMatch(messagePattern)
}

describe('validateStage — 기본 구조', () => {
  it('최소 유효 스테이지를 통과시키고 map.rows를 MapDef로 바꾼다', () => {
    const stage = validateStage(baseStage())!
    expect(stage).not.toBeNull()
    expect(stage.map).toEqual({ width: 4, height: 3, tiles: expect.any(Array) })
    expect(mapToRows(stage.map)).toEqual(['PPPP', 'PPPP', 'PPPP'])
    expect(stage.reinforcements).toEqual([])
    // 없는 옵션 필드는 키 자체를 만들지 않는다 (JSON 왕복 동일성)
    expect('loot' in stage).toBe(false)
    expect('events' in stage).toBe(false)
    expect('playerSlots' in stage).toBe(false)
  })

  it('객체가 아니거나 필수 필드가 없으면 거부한다', () => {
    for (const bad of [null, 42, 'stage', [], undefined]) {
      expect(validateStage(bad)).toBeNull()
    }
    rejects((s) => delete s.id, /id/)
    rejects((s) => (s.name = ''), /name/)
    rejects((s) => (s.weather = 'snow'), /weather/)
    rejects((s) => delete s.map, /map/)
    rejects((s) => delete s.units, /units/)
    rejects((s) => (s.units = []), /units.*최소 1기/)
    rejects((s) => delete s.victory, /victory/)
  })

  it('reinforcements는 생략 가능하지만(빈 배열 승계) 형이 틀리면 거부한다', () => {
    const stage = baseStage()
    delete stage.reinforcements
    expect(validateStage(stage)!.reinforcements).toEqual([])
    rejects((s) => (s.reinforcements = {}), /reinforcements/)
    rejects((s) => (s.reinforcements = [{ trigger: { type: 'turnStart' }, units: [] }]), /turn/)
    rejects((s) => (s.reinforcements = [{ trigger: { type: 'nope' }, units: [] }]), /turnStart\|unitDefeated/)
  })

  it('맵: 직사각형이 아니거나 모르는 문자면 거부한다 (parseMap throw를 흡수)', () => {
    rejects((s) => (s.map = { rows: ['PPP', 'PP'] }), /길이 불일치/)
    rejects((s) => (s.map = { rows: ['PZP'] }), /알 수 없는 지형 문자/)
    rejects((s) => (s.map = { rows: [] }), /map\.rows/)
    rejects((s) => (s.map = { rows: [1, 2] }), /문자열/)
  })

  it('맵: 이미 파싱된 tiles 형태(에디터 초안)도 받는다', () => {
    const stage = baseStage()
    stage.map = { width: 2, height: 2, tiles: [['plain', 'forest'], ['river', 'gate']] }
    stage.units = [{ officerId: 'caocao', faction: 'player', pos: { x: 0, y: 0 }, isLeader: true }]
    const parsed = validateStage(stage)!
    expect(mapToRows(parsed.map)).toEqual(['PF', 'RD'])
    rejects((s) => (s.map = { width: 9, height: 2, tiles: [['plain'], ['plain']] }), /map\.width/)
    rejects((s) => (s.map = { tiles: [['plain'], ['lava']] }), /지형 id/)
  })
})

describe('validateStage — 유닛/좌표/장수', () => {
  it('등록되지 않은 장수를 거부한다', () => {
    rejects((s) => ((s.units as Record<string, unknown>[])[0].officerId = 'nobody'), /등록되지 않은 장수/)
    rejects((s) => (s.forcedOfficers = ['nobody']), /등록되지 않은 장수/)
  })

  it('맵 밖 좌표를 거부한다', () => {
    rejects((s) => ((s.units as Record<string, unknown>[])[0].pos = { x: 4, y: 0 }), /맵\(4×3\) 밖/)
    rejects((s) => ((s.units as Record<string, unknown>[])[0].pos = { x: -1, y: 0 }), /밖/)
    rejects((s) => ((s.units as Record<string, unknown>[])[0].pos = { x: 0.5, y: 0 }), /정수/)
  })

  it('초기 배치가 겹치면 거부한다', () => {
    rejects((s) => ((s.units as Record<string, unknown>[])[1].pos = { x: 0, y: 0 }), /겹쳐 있다/)
  })

  it('faction/behavior/level/장비 형을 검사한다', () => {
    rejects((s) => ((s.units as Record<string, unknown>[])[1].faction = 'neutral'), /faction/)
    rejects((s) => ((s.units as Record<string, unknown>[])[1].behavior = 'flee'), /behavior/)
    rejects((s) => ((s.units as Record<string, unknown>[])[1].level = 0), /level/)
    rejects((s) => ((s.units as Record<string, unknown>[])[1].equipment = { hat: 'x' }), /슬롯/)
    const stage = baseStage()
    const units = stage.units as Record<string, unknown>[]
    units[1].equipment = { weapon: 'woodSword', armor: { itemId: 'clothArmor', level: 2, exp: 30 } }
    expect(validateStage(stage)).not.toBeNull()
  })
})

describe('validateStage — 승리조건 / 출진 슬롯 / 전리품', () => {
  it('승리조건 유니온을 판별한다', () => {
    const stage = baseStage()
    stage.victory = [
      { type: 'defeatBoss' },
      { type: 'reachPoint', pos: { x: 1, y: 1 } },
      { type: 'surviveTurns', turns: 8 },
    ]
    expect(validateStage(stage)!.victory).toHaveLength(3)
    rejects((s) => (s.victory = []), /최소 1개/)
    rejects((s) => (s.victory = [{ type: 'killThemAll' }]), /알 수 없는 승리조건/)
    rejects((s) => (s.victory = [{ type: 'surviveTurns', turns: 0 }]), /turns/)
    rejects((s) => (s.victory = [{ type: 'reachPoint', pos: { x: 9, y: 9 } }]), /밖/)
  })

  it('출진 슬롯: 진입 가능·중복 없음·deployMin≤Max≤슬롯수', () => {
    const stage = baseStage()
    stage.playerSlots = [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    stage.deployMin = 1
    stage.deployMax = 2
    expect(validateStage(stage)).not.toBeNull()
    rejects(
      (s) => {
        s.playerSlots = [{ x: 0, y: 0 }, { x: 0, y: 0 }]
        s.deployMin = 1
        s.deployMax = 2
      },
      /좌표 중복/,
    )
    rejects(
      (s) => {
        s.map = { rows: ['PRPP', 'PPPP', 'PPPP'] }
        s.playerSlots = [{ x: 1, y: 0 }]
        s.deployMin = 1
        s.deployMax = 1
      },
      /진입 불가 지형/,
    )
    rejects(
      (s) => {
        s.playerSlots = [{ x: 0, y: 0 }]
        s.deployMin = 1
        s.deployMax = 3
      },
      /슬롯 수/,
    )
    rejects((s) => (s.playerSlots = [{ x: 0, y: 0 }]), /deployMin/)
    rejects((s) => (s.deployMin = 2), /playerSlots 없이는/)
  })

  it('전리품: 트리거 유니온 + allySurvived는 유일 우군 officerId 필수', () => {
    const stage = baseStage()
    stage.loot = [{ trigger: 'bossKill', itemId: 'fangtianHalberd' }]
    expect(validateStage(stage)!.loot).toEqual([{ trigger: 'bossKill', itemId: 'fangtianHalberd' }])

    const withAlly = baseStage()
    withAlly.loot = [{ trigger: 'allySurvived', itemId: 'insu', officerId: 'lüBu' }]
    expect(validateStage(withAlly)!.loot![0].officerId).toBe('lüBu')

    rejects((s) => (s.loot = [{ trigger: 'allySurvived', itemId: 'insu' }]), /allySurvived 필수/)
    rejects((s) => (s.loot = [{ trigger: 'allySurvived', itemId: 'insu', officerId: 'westInfantry' }]), /2기 배치/)
    rejects((s) => (s.loot = [{ trigger: 'someday', itemId: 'insu' }]), /trigger/)
    rejects((s) => (s.loot = [{ trigger: 'victory', itemId: 'insu', officerId: 'caocao' }]), /allySurvived 전용/)
  })
})

describe('validateStage — 이벤트 규칙 (v1.1)', () => {
  const withEvents = (events: unknown[]) => {
    const stage = baseStage()
    stage.events = events
    return stage
  }

  it('트리거 5종을 모두 받는다', () => {
    const stage = withEvents([
      { id: 'e1', trigger: { type: 'battleStart' }, actions: [{ type: 'dialogue', lines: [{ speaker: 'caocao', text: '가자' }] }] },
      { id: 'e2', trigger: { type: 'turnStart', turn: 3 }, actions: [{ type: 'dialogue', lines: [{ speaker: null, text: '적이 온다' }] }] },
      { id: 'e3', trigger: { type: 'unitDefeated', officerId: 'lüBu' }, actions: [{ type: 'dialogue', lines: [{ speaker: 'caocao', text: '끝났다' }] }] },
      { id: 'e4', trigger: { type: 'unitsMeet', a: 'caocao', b: 'lüBu' }, actions: [{ type: 'dialogue', lines: [{ speaker: 'lüBu', text: '조조!' }] }] },
      {
        id: 'e5',
        trigger: { type: 'reachArea', area: [{ x: 0, y: 2 }, { x: 1, y: 2 }], faction: 'player', count: 2 },
        actions: [{ type: 'dialogue', lines: [{ speaker: null, text: '도달' }] }],
      },
    ])
    expect(validateStage(stage)!.events).toHaveLength(5)
  })

  it('이벤트 id는 유일해야 한다', () => {
    const dup = { trigger: { type: 'battleStart' }, actions: [{ type: 'dialogue', lines: [{ speaker: null, text: 'x' }] }] }
    const result = validateStageVerbose(withEvents([{ id: 'same', ...dup }, { id: 'same', ...dup }]))
    expect(result.stage).toBeNull()
    expect(result.errors.join()).toMatch(/중복/)
  })

  it('choice 중첩을 금지한다', () => {
    const inner = { type: 'choice', prompt: '또?', speaker: null, options: [{ text: 'ㅇ', actions: [{ type: 'dialogue', lines: [{ speaker: null, text: 'x' }] }] }] }
    const outer = {
      id: 'nested',
      trigger: { type: 'battleStart' },
      actions: [{ type: 'choice', prompt: '어느 책을?', speaker: 'caocao', options: [{ text: '권항', actions: [inner] }] }],
    }
    const result = validateStageVerbose(withEvents([outer]))
    expect(result.stage).toBeNull()
    expect(result.errors.join()).toMatch(/choice는 중첩할 수 없다/)

    // 1단 choice + 옵션 안의 즉시형 액션은 정상
    const ok = {
      id: 'strategy',
      trigger: { type: 'battleStart' },
      actions: [
        {
          type: 'choice',
          prompt: '어느 책을 쓰시겠습니까?',
          speaker: 'caocao',
          options: [
            { text: '권항책', actions: [{ type: 'removeUnits', officerIds: ['westInfantry'] }] },
            { text: '강행책', actions: [{ type: 'levelUpEnemies', amount: 2 }] },
          ],
        },
      ],
    }
    expect(validateStage(withEvents([ok]))!.events).toHaveLength(1)
  })

  it('duel/unitsMeet/buff(개별 target)는 스테이지 내 유일 유닛만 참조할 수 있다', () => {
    const duel = (a: string, b: string) => ({
      id: 'duel',
      trigger: { type: 'battleStart' },
      actions: [{ type: 'duel', a, b, lines: [{ speaker: 'caocao', text: '받아라' }], outcome: { winner: 'a', loserFate: 'die' } }],
    })
    expect(validateStage(withEvents([duel('caocao', 'lüBu')]))).not.toBeNull()
    // westInfantry는 2기 배치 — 어느 개체인지 정할 수 없다
    expect(validateStageVerbose(withEvents([duel('caocao', 'westInfantry')])).errors.join()).toMatch(/2기 배치/)
    // 스테이지에 아예 없는 장수
    expect(validateStageVerbose(withEvents([duel('caocao', 'guanYu')])).errors.join()).toMatch(/배치돼 있지 않다/)
    // unitsMeet
    expect(
      validateStageVerbose(
        withEvents([{ id: 'm', trigger: { type: 'unitsMeet', a: 'caocao', b: 'westInfantry' }, actions: [{ type: 'dialogue', lines: [{ speaker: null, text: 'x' }] }] }]),
      ).errors.join(),
    ).toMatch(/2기 배치/)
    // buff: playerAll은 유일성 검사 대상이 아니다
    const buffAll = { id: 'b', trigger: { type: 'battleStart' }, actions: [{ type: 'buff', target: 'playerAll', stat: 'morale', amount: 10, duration: 2 }] }
    expect(validateStage(withEvents([buffAll]))).not.toBeNull()
    const buffMob = { id: 'b', trigger: { type: 'battleStart' }, actions: [{ type: 'buff', target: 'westInfantry', stat: 'atk', amount: 10, duration: 2 }] }
    expect(validateStageVerbose(withEvents([buffMob])).errors.join()).toMatch(/2기 배치/)
  })

  it('removeUnits/setBehavior는 몹 단위 참조를 허용한다 (청주 권항책 용례)', () => {
    const stage = withEvents([
      {
        id: 'surrender',
        trigger: { type: 'battleStart' },
        actions: [
          { type: 'removeUnits', officerIds: ['westInfantry'] },
          { type: 'setBehavior', officerIds: ['westInfantry'], behavior: 'pursue' },
        ],
      },
    ])
    expect(validateStage(stage)).not.toBeNull()
    rejects((s) => (s.events = [{ id: 'x', trigger: { type: 'battleStart' }, actions: [{ type: 'removeUnits', officerIds: [] }] }]), /최소 1명/)
  })

  it('inflictStatus: 상태 유니온만 받고 officerIds는 몹 일괄을 허용한다 (확정 부여 — W1 계약)', () => {
    const ok = {
      id: 'confuse',
      trigger: { type: 'unitDefeated', officerId: 'lüBu' },
      actions: [{ type: 'inflictStatus', officerIds: ['westInfantry'], status: 'confusion' }],
    }
    // westInfantry는 2기지만 상태 부여는 일괄이 정상 용례 — 유일성을 요구하지 않는다
    expect(validateStage(withEvents([ok]))).not.toBeNull()
    rejects(
      (s) => (s.events = [{ ...ok, actions: [{ type: 'inflictStatus', officerIds: ['lüBu'], status: 'charm' }] }]),
      /status/,
    )
    rejects(
      (s) => (s.events = [{ ...ok, actions: [{ type: 'inflictStatus', officerIds: ['nobody'], status: 'poison' }] }]),
      /등록되지 않은 장수/,
    )
    rejects((s) => (s.events = [{ ...ok, actions: [{ type: 'inflictStatus', officerIds: [], status: 'poison' }] }]), /최소 1명/)
  })

  it('spawnUnits로 들어오는 유닛도 유일성 판정 풀에 든다', () => {
    // guanYu는 초기 배치엔 없지만 spawnUnits로 1기 등장 → duel 참조 가능
    const stage = withEvents([
      { id: 'spawn', trigger: { type: 'turnStart', turn: 2 }, actions: [{ type: 'spawnUnits', units: [{ officerId: 'guanYu', faction: 'enemy', pos: { x: 0, y: 1 } }] }] },
      {
        id: 'meet',
        trigger: { type: 'unitsMeet', a: 'caocao', b: 'guanYu' },
        actions: [{ type: 'dialogue', lines: [{ speaker: 'guanYu', text: '오랜만이오' }] }],
      },
    ])
    expect(validateStage(stage)).not.toBeNull()
    // 좌표는 여전히 맵 안이어야 한다
    rejects(
      (s) => (s.events = [{ id: 'spawn', trigger: { type: 'battleStart' }, actions: [{ type: 'spawnUnits', units: [{ officerId: 'guanYu', faction: 'enemy', pos: { x: 99, y: 0 } }] }] }]),
      /밖/,
    )
  })

  it('setTile 좌표는 맵 안이고 지형 id가 유효해야 한다', () => {
    const ok = { id: 'gate', trigger: { type: 'battleStart' }, actions: [{ type: 'setTile', cells: [{ x: 1, y: 1 }], terrain: 'gate' }] }
    expect(validateStage(withEvents([ok]))).not.toBeNull()
    rejects((s) => (s.events = [{ id: 'g', trigger: { type: 'battleStart' }, actions: [{ type: 'setTile', cells: [{ x: 9, y: 9 }], terrain: 'gate' }] }]), /밖/)
    rejects((s) => (s.events = [{ id: 'g', trigger: { type: 'battleStart' }, actions: [{ type: 'setTile', cells: [{ x: 1, y: 1 }], terrain: 'lava' }] }]), /알 수 없는 지형/)
  })

  it('대사: 화자는 등록된 장수 또는 null(내레이션)이어야 한다', () => {
    rejects(
      (s) => (s.events = [{ id: 'd', trigger: { type: 'battleStart' }, actions: [{ type: 'dialogue', lines: [{ speaker: 'ghost', text: 'x' }] }] }]),
      /등록되지 않은 장수/,
    )
    rejects(
      (s) => (s.events = [{ id: 'd', trigger: { type: 'battleStart' }, actions: [{ type: 'dialogue', lines: [] }] }]),
      /최소 1줄/,
    )
    rejects(
      (s) => (s.events = [{ id: 'd', trigger: { type: 'battleStart' }, actions: [{ type: 'dialogue', lines: [{ speaker: null, text: '' }] }] }]),
      /text/,
    )
  })

  it('duel outcome / 나머지 액션 형을 검사한다', () => {
    const action = (a: unknown) => [{ id: 'x', trigger: { type: 'battleStart' }, actions: [a] }]
    const draw = { type: 'duel', a: 'caocao', b: 'lüBu', lines: [{ speaker: null, text: '무승부' }], outcome: { draw: true } }
    expect(validateStage(withEvents(action(draw)))).not.toBeNull()
    rejects((s) => (s.events = action({ ...draw, outcome: { winner: 'c', loserFate: 'die' } })), /winner/)
    rejects((s) => (s.events = action({ ...draw, outcome: { winner: 'a', loserFate: 'flee' } })), /loserFate/)
    rejects((s) => (s.events = action({ type: 'levelUpEnemies', amount: 0 })), /amount/)
    rejects((s) => (s.events = action({ type: 'giveItem', itemId: 'insu', kind: 'potion' })), /kind/)
    rejects((s) => (s.events = action({ type: 'giveExp', target: 'nobody', amount: 10 })), /등록되지 않은 장수/)
    rejects((s) => (s.events = action({ type: 'buff', target: 'caocao', stat: 'luck', amount: 1, duration: 1 })), /stat/)
    rejects((s) => (s.events = action({ type: 'nope' })), /알 수 없는 액션/)
    rejects((s) => (s.events = [{ id: 'x', trigger: { type: 'battleStart' }, actions: [] }]), /최소 1개의 액션/)
    rejects((s) => (s.events = [{ id: 'x', trigger: { type: 'nope' }, actions: action({})[0].actions }]), /알 수 없는 트리거/)
  })
})

describe('stageToJson — 왕복', () => {
  it('번들 스테이지 11개가 JSON → StageDef → JSON 왕복에서 변하지 않는다', () => {
    expect(STAGES).toHaveLength(11)
    for (const stage of STAGES) {
      const json = stageToJson(stage)
      const reparsed = validateStage(json)
      expect(reparsed, stage.id).toEqual(stage)
      expect(stageToJson(reparsed!), stage.id).toEqual(json)
    }
  })

  it('이벤트를 포함한 스테이지도 왕복한다 (notes는 로더가 무시하고 stageToJson이 되붙인다)', () => {
    const source = baseStage()
    source.events = [
      {
        id: 'gate-open',
        trigger: { type: 'reachArea', area: [{ x: 1, y: 1 }], faction: 'player' },
        actions: [
          { type: 'dialogue', lines: [{ speaker: 'caocao', text: '문을 열어라' }] },
          { type: 'setTile', cells: [{ x: 2, y: 1 }], terrain: 'gate' },
        ],
      },
    ]
    const stage = validateStage(source)!
    const json = stageToJson(stage, '설계 메모')
    expect(json.notes).toBe('설계 메모')
    const again = validateStage(json)!
    expect(again).toEqual(stage) // notes는 StageDef에 남지 않는다
    expect(again.events).toEqual(stage.events)
  })
})
