// 스테이지 데이터 무결성 + AI 자동 시뮬레이션 통합 테스트

import { describe, expect, it } from 'vitest'
import { decideUnit, runAiPhase } from '../../core/ai'
import { applyAction, livingUnits, movementRangeOf, startBattle, unitAt } from '../../core/battle'
import { toEquipmentMap } from '../../core/campaign'
import { autoResolveEvents } from '../../core/events'
import type { BattleAction, BattleState } from '../../core/types'
import { CLASSES } from '../classes'
import { OFFICERS } from '../officers'
import { STRATEGIES } from '../strategies'
import { TERRAIN } from '../terrain'
import { STAGES, stageById } from './index'

// v1.1: 스테이지 정의가 json/*.json으로 이관되어 named import가 사라졌다.
// 로더(validateStage)를 통과한 것만 여기 잡히므로 이 상수 자체가 이관 검증기다 — 아래 단정은 무수정.
const STAGE_01 = stageById('stage01')!
const STAGE_02 = stageById('stage02')!
const STAGE_03 = stageById('stage03')!
const STAGE_04 = stageById('stage04')!
const STAGE_05 = stageById('stage05')!
const STAGE_06 = stageById('stage06')!
const STAGE_07 = stageById('stage07')!
const STAGE_08 = stageById('stage08')!
const STAGE_09 = stageById('stage09')!
const STAGE_10 = stageById('stage10')!
const STAGE_11 = stageById('stage11')!

/**
 * 아군도 AI로 조작해 전투를 완주시키는 헬퍼.
 * v1.1: 모든 액션 뒤에 autoResolveEvents를 물려 이벤트가 시뮬을 막지 않게 한다
 * (표시 대기 이벤트가 남아 있으면 리듀서가 eventContinue 외 전 액션을 거부한다).
 * choice는 pick(기본 0 = 밸런스 기준선)을 고른다 — 3책 분기 테스트가 이 인자를 쓴다.
 */
function simulate(
  state: BattleState,
  maxRounds: number,
  onTurnStart?: (s: BattleState) => void,
  pick = 0,
): BattleState {
  const go = (s: BattleState, action: BattleAction) => autoResolveEvents(applyAction(s, action), pick)
  let current = autoResolveEvents(state, pick) // battleStart 이벤트(전략 선택 등) 소화
  let lastTurn = 0
  for (let i = 0; i < maxRounds && current.result === 'ongoing'; i++) {
    if (current.turn !== lastTurn) {
      lastTurn = current.turn
      onTurnStart?.(current)
    }
    if (current.phase === 'player') {
      for (const u of livingUnits(current, 'player')) {
        if (current.result !== 'ongoing') break
        const plan = decideUnit(current, u)
        if (plan.moveTo && !unitAt(current, plan.moveTo)) {
          current = go(current, { type: 'move', unitId: u.id, to: plan.moveTo })
        }
        current = go(current, plan.act)
      }
      if (current.result === 'ongoing') current = go(current, { type: 'endPhase' })
    } else {
      current = autoResolveEvents(runAiPhase(current, current.phase), pick)
    }
  }
  return current
}

/**
 * 전술 상황을 손으로 만들어 이벤트 발동을 확정 검증하는 헬퍼.
 * 좌표·HP만 옮겨 놓고 상태 전이는 전부 리듀서에 맡긴다 (이벤트 발동 자체를 위조하지 않는다).
 */
function situate(state: BattleState, edit: (s: BattleState) => void): BattleState {
  const stage = state.__stage
  const next: BattleState = structuredClone({ ...state, __stage: undefined })
  next.__stage = stage
  edit(next)
  return next
}

const unitOf = (state: BattleState, officerId: string) =>
  state.units.find((u) => u.officerId === officerId && u.hp > 0)!

const tileAt = (state: BattleState, x: number, y: number) => state.map.tiles[y][x]

describe('스테이지 데이터 무결성', () => {
  it('모든 스테이지: 장수/병과/책략 참조가 유효하다', () => {
    for (const stage of STAGES) {
      const all = [...stage.units, ...stage.reinforcements.flatMap((r) => r.units)]
      for (const u of all) {
        const officer = OFFICERS[u.officerId]
        expect(officer, `${stage.id}: 장수 ${u.officerId}`).toBeDefined()
        const cls = CLASSES[officer.classId]
        expect(cls, `${stage.id}: 병과 ${officer.classId}`).toBeDefined()
        for (const s of cls.strategies) {
          expect(STRATEGIES[s.strategyId], `${stage.id}: 책략 ${s.strategyId}`).toBeDefined()
        }
      }
    }
  })

  it('모든 스테이지: 유닛 배치가 맵 안이고 진입 가능한 지형이며 겹치지 않는다', () => {
    for (const stage of STAGES) {
      const seen = new Set<string>()
      for (const u of stage.units) {
        expect(u.pos.x, `${stage.id}: ${u.officerId} x`).toBeLessThan(stage.map.width)
        expect(u.pos.y, `${stage.id}: ${u.officerId} y`).toBeLessThan(stage.map.height)
        const key = `${u.pos.x},${u.pos.y}`
        expect(seen.has(key), `${stage.id}: ${u.officerId} 위치 중복 ${key}`).toBe(false)
        seen.add(key)
      }
      // 시작 상태가 정상 생성되는지 (진입 불가 지형 배치 등은 startBattle 후 이동 계산에서 드러남)
      const state = startBattle(stage, 1)
      expect(state.units.length).toBe(stage.units.length)
    }
  })

  it('모든 스테이지: 아군 리더가 정확히 1명', () => {
    for (const stage of STAGES) {
      const leaders = stage.units.filter((u) => u.faction === 'player' && u.isLeader)
      expect(leaders.length, stage.id).toBe(1)
    }
  })

  it('출진 슬롯이 있는 스테이지: min/max·강제출진이 슬롯 테이블과 맞물린다', () => {
    for (const stage of STAGES) {
      if (!stage.playerSlots) continue
      const slots = stage.playerSlots
      const min = stage.deployMin!
      const max = stage.deployMax!
      expect(min, `${stage.id} deployMin`).toBeGreaterThan(0)
      expect(min, `${stage.id} deployMin≤Max`).toBeLessThanOrEqual(max)
      expect(max, `${stage.id} deployMax≤슬롯수`).toBeLessThanOrEqual(slots.length)

      // 조조는 전 전투 강제출진 (퇴각 = 게임오버)
      expect(stage.forcedOfficers, stage.id).toContain('caocao')
      expect(stage.forcedOfficers![0], `${stage.id}: ①번 슬롯`).toBe('caocao')
      expect(stage.forcedOfficers!.length, `${stage.id} 강제출진≤min`).toBeLessThanOrEqual(min)
      for (const id of stage.forcedOfficers!) expect(OFFICERS[id], `${stage.id}: ${id}`).toBeDefined()

      // 슬롯 좌표: 맵 안 + 보행 진입 가능 + 중복 없음
      const seen = new Set<string>()
      for (const slot of slots) {
        const where = `${stage.id} (${slot.x},${slot.y})`
        expect(slot.x, where).toBeLessThan(stage.map.width)
        expect(slot.y, where).toBeLessThan(stage.map.height)
        expect(TERRAIN[stage.map.tiles[slot.y][slot.x]].cost.foot, where).not.toBeNull()
        expect(seen.has(`${slot.x},${slot.y}`), where).toBe(false)
        seen.add(`${slot.x},${slot.y}`)
      }
    }
  })
})

describe('스테이지 1 — 연습전', () => {
  it('AI vs AI 자동 시뮬레이션이 승패를 낸다', () => {
    const result = simulate(startBattle(STAGE_01, 42), 120)
    expect(['victory', 'defeat']).toContain(result.result)
  })
})

describe('스테이지 2 — 관문 방어전', () => {
  it('턴 3/5에 증원 웨이브가 등장한다', () => {
    const spawnsAtTurn: Record<number, number> = {}
    simulate(startBattle(STAGE_02, 42), 200, (s) => {
      spawnsAtTurn[s.turn] = s.units.length
    })
    // 턴 3에 +2 (기병 2), 턴 5에 +2 (등무+요술사)
    if (spawnsAtTurn[3] !== undefined) {
      expect(spawnsAtTurn[3]).toBeGreaterThanOrEqual(STAGE_02.units.length + 2)
    }
    if (spawnsAtTurn[5] !== undefined) {
      expect(spawnsAtTurn[5]).toBeGreaterThanOrEqual(STAGE_02.units.length + 4)
    }
  })

  it('AI 자동 시뮬레이션이 크래시 없이 종료된다 (버티기 또는 보스 격파 또는 패배)', () => {
    const result = simulate(startBattle(STAGE_02, 7), 200)
    expect(['victory', 'defeat']).toContain(result.result)
  })

  it('아무도 행동하지 않아도 8턴 버티면 게임이 끝난다 (surviveTurns 평가)', () => {
    // v1.1: 대사 이벤트도 소화해야 페이즈가 넘어간다 (대기 큐가 남으면 리듀서가 전 액션을 거부한다)
    let state = autoResolveEvents(startBattle(STAGE_02, 1))
    for (let i = 0; i < 60 && state.result === 'ongoing'; i++) {
      if (state.phase === 'player') {
        state = autoResolveEvents(applyAction(state, { type: 'endPhase' }))
      } else {
        state = autoResolveEvents(runAiPhase(state, state.phase))
      }
    }
    expect(state.result).not.toBe('ongoing')
  })
})

describe('스테이지 3 — 황건 본진 소탕', () => {
  it('AI vs AI 자동 시뮬레이션이 크래시 없이 승패를 낸다', () => {
    // 장수 기본 레벨(2~3)로는 협곡에서 밀린다 — 최종 스테이지라 로스터 이월을 전제한다
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_03, 42), 400).result)

    // 두 전투를 거친 로스터(≈Lv6, 초기 장비 유지)면 협곡→성문→성채까지 진행돼 장각을 잡는다.
    // v0.7에서 적 잡병이 방어구까지 갖추면서 맨몸 로스터로는 밀린다 — 실플레이 조건(장비 보유)으로 검증
    const roster = STAGE_03.units
      .filter((u) => u.faction === 'player')
      .map((u) => ({
        officerId: u.officerId,
        level: 6,
        exp: 0,
        equipment: toEquipmentMap(OFFICERS[u.officerId].initialEquipment),
        statBonus: {},
      }))
    const grown = simulate(startBattle(STAGE_03, 42, roster), 400)
    expect(grown.result).toBe('victory')
    expect(grown.units.find((u) => u.isBoss)!.hp).toBe(0)
  })

  it('출진 명단으로 시작하면 슬롯에 배치되고 적 배치는 그대로다 (stage03)', () => {
    const state = startBattle(STAGE_03, 1, undefined, ['caocao', 'dianwei', 'xunyu', 'guojia'])
    const players = livingUnits(state, 'player')
    expect(players.map((u) => u.officerId)).toEqual(['caocao', 'dianwei', 'xunyu', 'guojia'])
    expect(players.map((u) => u.pos)).toEqual(STAGE_03.playerSlots!.slice(0, 4))
    const boss = state.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('zhangJiao')
    expect(boss.pos).toEqual({ x: 7, y: 1 })
  })
})

// ---------- 제1부 「패왕 탄생」 (v0.7) ----------

/** 스테이지 클리어 로스터 근사 — 지정 레벨 + 장수 초기 장비 */
const rosterAt = (stage: typeof STAGE_04, level: number) =>
  stage.units
    .filter((u) => u.faction === 'player')
    .map((u) => ({
      officerId: u.officerId,
      level,
      exp: 0,
      equipment: toEquipmentMap(OFFICERS[u.officerId].initialEquipment),
      statBonus: {},
    }))

describe('스테이지 4 — 사수관 전투', () => {
  it('관문 구조: 성문은 하나뿐이고 보스(화웅)는 그 뒤에 선다', () => {
    const gates: string[] = []
    for (let y = 0; y < STAGE_04.map.height; y++) {
      for (let x = 0; x < STAGE_04.map.width; x++) {
        // v1.1: 성문은 닫힌 상태(gateClosed)로 시작하고 이벤트로 열린다 — 위치는 그대로 (11,5)
        if (STAGE_04.map.tiles[y][x] === 'gateClosed') gates.push(`${x},${y}`)
      }
    }
    expect(gates).toEqual(['11,5'])
    expect(STAGE_04.map.tiles.flat()).not.toContain('gate') // 열린 문은 처음엔 없다
    const boss = STAGE_04.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('huaXiong')
    expect(boss.pos).toEqual({ x: 12, y: 5 }) // 성문 바로 뒤
  })

  it('턴 3에 관 안쪽 증원이 들어온다', () => {
    const spawnsAtTurn: Record<number, number> = {}
    simulate(startBattle(STAGE_04, 42, rosterAt(STAGE_04, 7)), 400, (s) => {
      spawnsAtTurn[s.turn] = s.units.length
    })
    if (spawnsAtTurn[3] !== undefined) {
      expect(spawnsAtTurn[3]).toBeGreaterThanOrEqual(STAGE_04.units.length + 2)
    }
  })

  it('stage03 클리어 로스터(Lv7 + 장비)면 관문을 뚫고 승리한다', () => {
    // 밸런스 기준선 — 직전 스테이지를 클리어한 실플레이 조건에서 이길 수 있어야 한다
    const grown = simulate(startBattle(STAGE_04, 42, rosterAt(STAGE_04, 7)), 400)
    expect(grown.result).toBe('victory')
  })

  it('장수 기본 레벨로도 크래시 없이 승패가 난다', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_04, 7), 400).result)
  })
})

describe('스테이지 5 — 호로관 전투', () => {
  it('여포는 첫 턴부터 밀고 나오는 보스이고 1차 승리조건은 여포 격파다', () => {
    const boss = STAGE_05.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('lüBu')
    expect(boss.behavior).toBe('pursue')
    // 전멸시키지 않아도 이긴다 — 원작 "여포 퇴각" 재현. 전멸은 2차(보너스) 조건
    expect(STAGE_05.victory[0]).toEqual({ type: 'defeatBoss' })
    expect(STAGE_05.victory[1]).toEqual({ type: 'annihilation' })
    expect(STAGE_05.bonusExp).toBeGreaterThan(0)
  })

  it('AI vs AI 시뮬레이션이 크래시 없이 승패를 낸다 (도전적 난이도 — 양쪽 허용)', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_05, 42, rosterAt(STAGE_05, 8)), 400).result)
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_05, 7), 400).result)
  })
})

describe('스테이지 6 — 동탁 추격전', () => {
  it('초기 적은 미끼 규모지만 2단 증원으로 8기 이상이 더 나온다', () => {
    const initial = STAGE_06.units.filter((u) => u.faction === 'enemy')
    expect(initial.length).toBeGreaterThanOrEqual(4)
    expect(initial.length).toBeLessThanOrEqual(5)
    const waves = STAGE_06.reinforcements
    expect(waves.map((w) => w.trigger)).toEqual([
      { type: 'turnStart', turn: 2 },
      { type: 'turnStart', turn: 3 },
    ])
    expect(waves.reduce((n, w) => n + w.units.length, 0)).toBeGreaterThanOrEqual(8)
    // 후방 본대는 이유가 이끈다
    expect(waves[1].units.some((u) => u.officerId === 'liRu')).toBe(true)
    expect(STAGE_06.victory).toEqual([{ type: 'annihilation' }])
  })

  it('AI vs AI 시뮬레이션이 크래시 없이 승패를 낸다 (고난도 — 양쪽 허용)', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_06, 42, rosterAt(STAGE_06, 9)), 600).result)
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_06, 7), 600).result)
  })
})

// ---------- 제2부 「연주에서 서주로」 (v1.0) ----------
// 밸런스 방침: 초·중반(stage07/08/10)은 직전 클리어 로스터로 고정 시드 승리를 단정하고,
// 고난도(stage09 여포 조우 · stage11 최종전)는 양쪽 허용 + 크래시 없음만 단정한다.

describe('스테이지 7 — 청주 평정', () => {
  it('원작 c04 충실: 적장이 한 명도 없고 승리조건은 전멸 단일이다 (보너스도 없다)', () => {
    // 관해(管亥)·조표(曹豹)는 원작 512인 명부에 없다 — 청주는 황건 익명 부대만 (statuses.md §4)
    expect(STAGE_07.units.some((u) => u.isBoss)).toBe(false)
    expect(OFFICERS.guanHai).toBeUndefined()
    expect(OFFICERS.caoBao).toBeUndefined()
    expect(STAGE_07.victory).toEqual([{ type: 'annihilation' }])
    expect(STAGE_07.bonusExp).toBeUndefined()
    expect(STAGE_07.deployMax).toBe(7)
    expect(STAGE_07.forcedOfficers).toEqual(['caocao'])
  })

  it('물량전 구성: 초기 9기 + 턴3 증원 3기 = 12기, 전원 Lv12~13', () => {
    const initial = STAGE_07.units.filter((u) => u.faction === 'enemy')
    const reinforced = STAGE_07.reinforcements.flatMap((r) => r.units)
    expect(initial.length).toBe(9)
    expect(initial.length + reinforced.length).toBe(12)
    expect(STAGE_07.reinforcements.map((r) => r.trigger)).toEqual([{ type: 'turnStart', turn: 3 }])
    // 적 레벨은 2부 진입 예상(Lv13~14)에 러버밴딩 — 전원 Lv12~13
    for (const u of [...initial, ...reinforced]) {
      const level = u.level ?? OFFICERS[u.officerId].level
      expect(level, u.officerId).toBeGreaterThanOrEqual(12)
      expect(level, u.officerId).toBeLessThanOrEqual(13)
    }
  })

  it('stage06 클리어 로스터(Lv14 + 장비)면 물량을 끝까지 정리하고 승리한다', () => {
    const grown = simulate(startBattle(STAGE_07, 42, rosterAt(STAGE_07, 14)), 600)
    expect(grown.result).toBe('victory')
    // 전멸 단일 조건이므로 승리 = 적 0기
    expect(livingUnits(grown, 'enemy')).toHaveLength(0)
  })

  it('장수 기본 레벨로도 크래시 없이 승패가 난다', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_07, 7), 600).result)
  })
})

describe('스테이지 8 — 서주 침공', () => {
  it('도하 구조: 강이 전장을 가르고 다리는 정확히 2칸뿐이다', () => {
    const bridges: string[] = []
    let rivers = 0
    for (let y = 0; y < STAGE_08.map.height; y++) {
      for (let x = 0; x < STAGE_08.map.width; x++) {
        const t = STAGE_08.map.tiles[y][x]
        if (t === 'bridge') bridges.push(`${x},${y}`)
        if (t === 'river') rivers += 1
      }
    }
    expect(bridges).toEqual(['4,5', '11,5'])
    expect(rivers).toBe(14) // 폭 16 - 다리 2
  })

  it('원작 c05 충실: 보스는 도겸이고 부장은 실존 적장 조성이다 (조표는 없다)', () => {
    const bosses = STAGE_08.units.filter((u) => u.isBoss)
    expect(bosses.map((u) => u.officerId)).toEqual(['taoQian'])
    // 도겸은 성내(120% 방어 보정)에 선다 — 성채(매턴 회복)에 두면 8턴 격파가 불가능해진다
    expect(STAGE_08.map.tiles[bosses[0].pos.y][bosses[0].pos.x]).toBe('castle')
    expect(bosses[0].behavior).toBe('guard')
    expect(STAGE_08.units.some((u) => u.officerId === 'caoXing')).toBe(true)
    expect(OFFICERS.caoXing.stats).toEqual({ str: 72, ldr: 74, int: 50, agi: 64, luck: 76 })
    expect(OFFICERS.taoQian.stats).toEqual({ str: 74, ldr: 64, int: 72, agi: 58, luck: 56 })
    expect(STAGE_08.victory).toEqual([{ type: 'defeatBoss' }, { type: 'annihilation' }])
    expect(STAGE_08.bonusExp).toBe(150)
  })

  it('턴 8에 유비·관우·장비가 적(enemy) 원군으로 배후에 등장한다 (원작 c05)', () => {
    const wave = STAGE_08.reinforcements.find((r) => r.trigger.type === 'turnStart' && r.trigger.turn === 8)!
    expect(wave.units.map((u) => u.officerId)).toEqual(['liuBei', 'guanYu', 'zhangFei'])
    for (const u of wave.units) {
      expect(u.faction, u.officerId).toBe('enemy') // stage10에서는 같은 3인이 ally가 된다
      expect(u.behavior, u.officerId).toBe('pursue')
      expect(u.level, u.officerId).toBe(16) // 스테이지 적 평균(≈13.4) +2
      // 배후 = 출진 슬롯보다 남쪽
      expect(u.pos.y).toBeGreaterThan(Math.max(...STAGE_08.playerSlots!.map((s) => s.y)))
    }
  })

  it('stage07 클리어 로스터(Lv14 + 장비)면 도겸을 잡고 이긴다', () => {
    const grown = simulate(startBattle(STAGE_08, 42, rosterAt(STAGE_08, 14)), 600)
    expect(grown.result).toBe('victory')
    expect(grown.units.find((u) => u.isBoss)!.hp).toBe(0)
  })

  it('유비군이 도착한 뒤에는 전멸(2차 보너스)이 사실상 닫힌다 — 보스 격파로 끊는 것이 정석', () => {
    const grown = simulate(startBattle(STAGE_08, 42, rosterAt(STAGE_08, 14)), 600)
    // 원군이 떴다면 전멸 조건을 채우지 못하므로 보너스 로그가 없다
    if (grown.units.some((u) => u.officerId === 'guanYu')) {
      expect(livingUnits(grown, 'enemy').length).toBeGreaterThan(0)
      expect(grown.log.some((l) => l.type === 'bonus')).toBe(false)
    }
  })
})

describe('스테이지 9 — 복양 전투', () => {
  it('시가전 구성: 성벽 블록이 전장을 격자로 가르고 보스는 Lv18 여포(pursue)다', () => {
    let walls = 0
    for (const row of STAGE_09.map.tiles) for (const t of row) if (t === 'wall') walls += 1
    expect(walls).toBeGreaterThan(30) // 건물 블록이 시야/기동을 끊는다
    const boss = STAGE_09.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('lüBu')
    expect(boss.level).toBe(18)
    expect(boss.behavior).toBe('pursue')
    // 1차 = 여포 격파(원작 "여포 퇴각"), 2차 = 전멸
    expect(STAGE_09.victory).toEqual([{ type: 'defeatBoss' }, { type: 'annihilation' }])
  })

  it('진궁이 후방에서 책략을 던진다 — 병과가 2차(참모)라 화룡까지 쓴다', () => {
    const chenGong = STAGE_09.units.find((u) => u.officerId === 'chenGong')!
    expect(chenGong.behavior).toBe('guard')
    expect(OFFICERS.chenGong.classId).toBe('counselor')
    expect(CLASSES.counselor.strategies.some((s) => s.strategyId === 'hwaryong')).toBe(true)
  })

  it('턴 3에 측면 골목 증원 3기가 들어온다', () => {
    expect(STAGE_09.reinforcements.map((r) => r.trigger)).toEqual([{ type: 'turnStart', turn: 3 }])
    expect(STAGE_09.reinforcements[0].units).toHaveLength(3)
    const spawnsAtTurn: Record<number, number> = {}
    simulate(startBattle(STAGE_09, 42, rosterAt(STAGE_09, 16)), 600, (s) => {
      spawnsAtTurn[s.turn] = s.units.length
    })
    if (spawnsAtTurn[3] !== undefined) {
      expect(spawnsAtTurn[3]).toBeGreaterThanOrEqual(STAGE_09.units.length + 3)
    }
  })

  it('AI vs AI 시뮬레이션이 크래시 없이 승패를 낸다 (고난도 — 양쪽 허용)', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_09, 42, rosterAt(STAGE_09, 16)), 600).result)
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_09, 7, rosterAt(STAGE_09, 16)), 600).result)
  })
})

describe('스테이지 10 — 서주 구원', () => {
  it('우군(ally) 유비·관우·장비 3기가 북쪽 마을에 고립돼 있다', () => {
    const allies = STAGE_10.units.filter((u) => u.faction === 'ally')
    expect(allies.map((u) => u.officerId)).toEqual(['liuBei', 'guanYu', 'zhangFei'])
    // 마을 = 매턴 회복 지형 — ally 생존 조건이 없는 대신 오래 버티게 하는 장치
    for (const a of allies) {
      expect(STAGE_10.map.tiles[a.pos.y][a.pos.x], a.officerId).toBe('village')
      expect(a.isLeader, a.officerId).toBeUndefined()
    }
    // 우군은 아군 리더 판정에 끼지 않는다
    expect(STAGE_10.units.filter((u) => u.faction === 'player' && u.isLeader)).toHaveLength(1)
  })

  it('보스는 고순(함진영)이고 승리조건은 고순 격파 → 전멸이다', () => {
    const boss = STAGE_10.units.find((u) => u.isBoss)!
    expect(boss.officerId).toBe('gaoShun')
    expect(OFFICERS.gaoShun.classId).toBe('guardInfantry') // 방어 특화 2차 병과
    expect(STAGE_10.victory).toEqual([{ type: 'defeatBoss' }, { type: 'annihilation' }])
    // 아군은 남쪽에서 진입한다 (출진 슬롯이 마을보다 아래)
    for (const slot of STAGE_10.playerSlots!) expect(slot.y).toBeGreaterThan(8)
  })

  it('허저까지 합류한 로스터(Lv16 + 장비)면 포위를 뚫는다', () => {
    const roster = rosterAt(STAGE_10, 16)
    expect(roster.map((r) => r.officerId)).toContain('xuChu')
    const grown = simulate(startBattle(STAGE_10, 42, roster), 600)
    expect(grown.result).toBe('victory')
  })
})

describe('스테이지 11 — 하비 여포 포위전', () => {
  it('원작 c14 충실: 설원 + 강 + 다리 2개, 성문 1개, 악천후로 화계 봉쇄', () => {
    const gates: string[] = []
    const bridges: string[] = []
    for (let y = 0; y < STAGE_11.map.height; y++) {
      for (let x = 0; x < STAGE_11.map.width; x++) {
        const t = STAGE_11.map.tiles[y][x]
        if (t === 'gate') gates.push(`${x},${y}`)
        if (t === 'bridge') bridges.push(`${x},${y}`)
      }
    }
    expect(gates).toEqual(['7,3'])
    // 강은 북서 → 남동으로 흐르고 건널 곳은 정확히 두 군데다 (수공/침수는 원작에 없다)
    expect(bridges).toEqual(['3,5', '11,7'])
    // 악천후 — 원작 "화계 불가"를 우리 날씨 시스템으로 재현
    expect(STAGE_11.weather).toBe('rain')
  })

  it('최종전 구성: 여포 Lv20(보스) + 진궁 + 고순, 보너스 200, 보스 전리품 방천화극', () => {
    const boss = STAGE_11.units.filter((u) => u.isBoss)
    expect(boss.map((u) => u.officerId)).toEqual(['lüBu'])
    expect(boss[0].level).toBe(20)
    expect(STAGE_11.units.some((u) => u.officerId === 'chenGong')).toBe(true)
    expect(STAGE_11.units.some((u) => u.officerId === 'gaoShun')).toBe(true)
    expect(STAGE_11.victory).toEqual([{ type: 'defeatBoss' }, { type: 'annihilation' }])
    expect(STAGE_11.bonusExp).toBe(200)
    expect(STAGE_11.loot).toEqual([{ trigger: 'bossKill', itemId: 'fangtianHalberd' }])
  })

  it('AI vs AI 시뮬레이션이 크래시 없이 승패를 낸다 (최종전 — 양쪽 허용)', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_11, 42, rosterAt(STAGE_11, 18)), 800).result)
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_11, 7, rosterAt(STAGE_11, 18)), 800).result)
  })
})

// ---------- 전투 내 이벤트 (v1.1) ----------
// 소급 콘텐츠 26건의 발동·효과 회귀. 대사 텍스트는 단정하지 않는다(창작물이라 바뀔 수 있다) —
// 발동 조건, 상태 변화, 시뮬 완주 가능성만 본다.

/** 지정 턴까지 아군은 아무것도 하지 않고 페이즈만 넘긴다 (턴 트리거 관찰용) */
function advanceToTurn(state: BattleState, turn: number, pick = 0): BattleState {
  let current = autoResolveEvents(state, pick)
  for (let i = 0; i < 40 && current.turn < turn && current.result === 'ongoing'; i++) {
    if (current.phase === 'player') {
      current = autoResolveEvents(applyAction(current, { type: 'endPhase' }), pick)
    } else {
      current = autoResolveEvents(runAiPhase(current, current.phase), pick)
    }
  }
  return current
}

describe('이벤트 데이터 — 소급 콘텐츠 26건', () => {
  it('11스테이지 전부 이벤트를 갖고 id는 스테이지 안에서 유일하다', () => {
    const counts = STAGES.map((s) => [s.id, (s.events ?? []).length] as const)
    expect(counts).toEqual([
      ['stage01', 2], ['stage02', 2], ['stage03', 2], ['stage04', 2], ['stage05', 2], ['stage06', 2],
      ['stage07', 1], ['stage08', 3], ['stage09', 2], ['stage10', 2], ['stage11', 6],
    ])
    expect(counts.reduce((n, [, c]) => n + c, 0)).toBe(26)
    for (const stage of STAGES) {
      const ids = (stage.events ?? []).map((e) => e.id)
      expect(new Set(ids).size, stage.id).toBe(ids.length)
    }
  })

  it('이벤트가 AI 시뮬을 막지 않는다 — 11스테이지 전부 승패가 나고 대기 큐가 비어 끝난다', () => {
    // 리듀서는 pendingEvents가 남아 있으면 전 액션을 거부한다 — 끝까지 소화되는지가 이 테스트의 핵심
    for (const stage of STAGES) {
      const result = simulate(startBattle(stage, 42, rosterAt(stage, 18)), 800)
      expect(result.result, stage.id).not.toBe('ongoing')
      expect(result.pendingEvents, stage.id).toHaveLength(0)
    }
  })

  it('같은 시드는 같은 결과를 낸다 — 일기토는 난수를 쓰지 않는다 (stage11 일기토 4건 경유)', () => {
    const run = () => simulate(startBattle(STAGE_11, 42, rosterAt(STAGE_11, 18)), 800)
    const a = run()
    const b = run()
    expect(b.result).toBe(a.result)
    expect(b.firedEvents).toEqual(a.firedEvents)
    expect(b.log.length).toBe(a.log.length)
    expect(b.units.map((u) => [u.officerId, u.hp, u.level])).toEqual(a.units.map((u) => [u.officerId, u.hp, u.level]))
  })
})

describe('stage01 — 허자장의 제안 (원작 c00 "대화 후 혜택")', () => {
  it('턴 2에 선택지가 뜨고, 수락하면 경험치 / 거절하면 도구를 준다', () => {
    const accepted = advanceToTurn(startBattle(STAGE_01, 1), 2, 0)
    expect(accepted.firedEvents).toContain('s01-xuzijiang')
    expect(accepted.log.some((l) => l.message.includes('경험치 +100'))).toBe(true)
    expect(accepted.pendingRewards).toEqual([])

    const declined = advanceToTurn(startBattle(STAGE_01, 1), 2, 1)
    expect(declined.firedEvents).toContain('s01-xuzijiang')
    expect(declined.pendingRewards).toEqual([{ itemId: 'hoebokKong', kind: 'consumable' }])
    expect(declined.log.some((l) => l.message.includes('경험치 +100'))).toBe(false)
  })
})

describe('stage02 — 턴 5 사기 진작 (창작 스테이지의 의도적 이탈)', () => {
  it('턴 5에 아군 전원이 사기 버프를 받는다', () => {
    const state = advanceToTurn(startBattle(STAGE_02, 1), 5)
    expect(state.firedEvents).toContain('s02-wave')
    for (const unit of livingUnits(state, 'player')) {
      expect(unit.buffs.some((b) => b.stat === 'morale' && b.amount === 20), unit.officerId).toBe(true)
    }
  })
})

describe('stage04 — 성문 개방 (지점 도달 + 맵 가변)', () => {
  it('닫힌 성문은 통과할 수 없고, 문 앞에 서면 열려서 관 안쪽이 열린다', () => {
    const state = autoResolveEvents(startBattle(STAGE_04, 1, rosterAt(STAGE_04, 7)))
    expect(state.pendingEvents).toHaveLength(0) // 개전 대사는 소화됐다
    expect(tileAt(state, 11, 5)).toBe('gateClosed')

    // 문 앞((10,5))에 세워도 닫힌 문 너머(x≥11)로는 한 칸도 갈 수 없다
    const atGate = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 10, y: 5 }
    })
    const before = movementRangeOf(atGate, unitOf(atGate, 'caocao'))
    expect([...before.values()].some((c) => c.pos.x >= 11)).toBe(false)

    // 다음 액션의 공통 후처리에서 reachArea가 평가돼 문이 열린다
    const after = autoResolveEvents(applyAction(atGate, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s04-gate-open')
    expect(tileAt(after, 11, 5)).toBe('gate')
    const opened = movementRangeOf(after, unitOf(after, 'caocao'))
    expect([...opened.values()].some((c) => c.pos.x >= 11)).toBe(true)

    // 스테이지 정의는 오염되지 않는다 (createBattle 딥클론) — 다음 전투도 닫힌 문에서 시작
    expect(STAGE_04.map.tiles[5][11]).toBe('gateClosed')
  })
})

describe('stage05 — 여포 격파 연쇄 (원작 c02)', () => {
  it('여포가 쓰러지면 관 밖 서량기병이 혼란에 빠진다', () => {
    const state = autoResolveEvents(startBattle(STAGE_05, 1, rosterAt(STAGE_05, 12)))
    // 여포를 잔 HP 1로 두고 아군 3기를 인접시켜 실제 공격으로 격파한다 (격파 처리를 위조하지 않는다)
    const ready = situate(state, (s) => {
      unitOf(s, 'lüBu').hp = 1
      unitOf(s, 'dianwei').pos = { x: 7, y: 2 }
      unitOf(s, 'xiahoudun').pos = { x: 6, y: 2 }
      unitOf(s, 'caocao').pos = { x: 8, y: 3 }
    })
    let after = ready
    for (const officerId of ['dianwei', 'xiahoudun', 'caocao']) {
      const lüBu = after.units.find((u) => u.officerId === 'lüBu')!
      if (lüBu.hp <= 0) break
      const attacker = unitOf(after, officerId)
      after = autoResolveEvents(
        applyAction(after, { type: 'attack', unitId: attacker.id, targetId: lüBu.id }),
      )
    }
    expect(after.units.find((u) => u.officerId === 'lüBu')!.hp).toBe(0)
    expect(after.firedEvents).toContain('s05-lubu-fall')
    const cavalry = after.units.filter((u) => u.officerId === 'westCavalry' && u.hp > 0)
    expect(cavalry.length).toBeGreaterThan(0)
    for (const unit of cavalry) {
      expect(unit.statuses.map((s) => s.id), unit.id).toContain('confusion')
    }
  })
})

describe('stage07 — 청주 3책 (원작 c04)', () => {
  const picked = (pick: number) =>
    autoResolveEvents(startBattle(STAGE_07, 42, rosterAt(STAGE_07, 14)), pick)

  it('①순욱 권항: 궁병 2 + 요술사 1이 설득으로 물러난다', () => {
    const state = picked(0)
    expect(state.firedEvents).toContain('s07-three-plans')
    expect(livingUnits(state, 'enemy')).toHaveLength(6)
    expect(state.units.some((u) => u.officerId === 'yellowArcher')).toBe(false)
    expect(state.units.some((u) => u.officerId === 'yellowShaman')).toBe(false)
  })

  it('②전위 강행: 소수만 도주하고 잔존 적 전원이 레벨업한다', () => {
    const state = picked(1)
    const enemies = livingUnits(state, 'enemy')
    expect(enemies).toHaveLength(8)
    expect(state.units.some((u) => u.officerId === 'yellowShaman')).toBe(false)
    for (const unit of enemies) expect(unit.level, unit.officerId).toBeGreaterThanOrEqual(13)
    expect(enemies.every((u) => u.hp === u.maxHp)).toBe(true) // 정예화 = 완전회복
  })

  it('③곽가 유인: 기병 3기가 아군 진 안쪽으로 재배치되고 혼란에 빠진다 (총량 유지 = 최다 경험치)', () => {
    const state = picked(2)
    const enemies = livingUnits(state, 'enemy')
    expect(enemies).toHaveLength(9)
    const confused = enemies.filter((u) => u.statuses.some((s) => s.id === 'confusion'))
    expect(confused.map((u) => u.officerId)).toEqual(['yellowCavalry', 'yellowCavalry', 'yellowCavalry'])
    // 재배치 위치 = 아군 출진 슬롯 안쪽 (남쪽)
    for (const unit of confused) expect(unit.pos.y).toBeGreaterThanOrEqual(8)
  })

  it('세 분기 모두 stage06 클리어 로스터로 승리할 수 있다', () => {
    for (const pick of [0, 1, 2]) {
      const result = simulate(startBattle(STAGE_07, 42, rosterAt(STAGE_07, 14)), 600, undefined, pick)
      expect(result.result, `선택 ${pick}`).toBe('victory')
    }
  })
})

describe('stage09 / stage11 — 일기토 (원작 확정 결과)', () => {
  it('stage09 조조×여포: 인접만으로 자동 발동하고 무승부로 끝난다 (경험치 없음)', () => {
    const state = autoResolveEvents(startBattle(STAGE_09, 1, rosterAt(STAGE_09, 16)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 5, y: 4 } // 여포 (5,3) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s09-lubu-duel')
    expect(unitOf(after, 'lüBu').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').exp).toBe(0) // 무승부는 무보상
  })

  it('stage11 위속×하후돈: 아군이 이기고 적장이 죽는다 (배반·투항이 아니다)', () => {
    const state = autoResolveEvents(startBattle(STAGE_11, 1, rosterAt(STAGE_11, 18)))
    const meet = situate(state, (s) => {
      unitOf(s, 'xiahoudun').pos = { x: 10, y: 4 } // 위속 (11,4) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s11-duel-weixu')
    expect(after.units.find((u) => u.officerId === 'weiXu')!.hp).toBe(0)
    expect(unitOf(after, 'xiahoudun').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'xiahoudun').exp).toBeGreaterThan(0) // 일기토 승리 = 일반 격파 경험치
  })

  it('stage11 초선×조조: 무승부 — 아무도 죽지 않는다', () => {
    const state = autoResolveEvents(startBattle(STAGE_11, 1, rosterAt(STAGE_11, 18)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 7, y: 3 } // 성문 위 — 초선 (8,2) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s11-duel-diaochan')
    expect(unitOf(after, 'diaochan').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').exp).toBe(0)
  })
})

describe('stage11 — 여포 기동 (원작 c14 "성내 4부대")', () => {
  it('아군 4부대가 성내에 들어서면 여포·진궁·고순이 농성을 풀고 나온다', () => {
    const state = autoResolveEvents(startBattle(STAGE_11, 1, rosterAt(STAGE_11, 18)))
    for (const officerId of ['lüBu', 'chenGong', 'gaoShun']) {
      expect(unitOf(state, officerId).behavior, officerId).toBe('guard')
    }
    // 성벽 안쪽 맨 위 행에 4부대를 들여놓는다 (3부대로는 발동하지 않아야 한다)
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 15, y: 0 },
    ]
    const place = (count: number) =>
      situate(state, (s) => {
        s.units
          .filter((u) => u.faction === 'player')
          .slice(0, count)
          .forEach((u, i) => {
            u.pos = cells[i]
          })
      })

    const three = autoResolveEvents(applyAction(place(3), { type: 'endPhase' }))
    expect(three.firedEvents).not.toContain('s11-lubu-sortie')
    expect(unitOf(three, 'lüBu').behavior).toBe('guard')

    const four = autoResolveEvents(applyAction(place(4), { type: 'endPhase' }))
    expect(four.firedEvents).toContain('s11-lubu-sortie')
    for (const officerId of ['lüBu', 'chenGong', 'gaoShun']) {
      expect(unitOf(four, officerId).behavior, officerId).toBe('pursue')
    }
  })
})
