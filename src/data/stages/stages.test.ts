// 스테이지 데이터 무결성 + AI 자동 시뮬레이션 통합 테스트

import { describe, expect, it } from 'vitest'
import { decideUnit, runAiPhase } from '../../core/ai'
import { applyAction, livingUnits, movementRangeOf, startBattle, unitAt } from '../../core/battle'
import { toEquipmentMap } from '../../core/campaign'
import { autoResolveEvents } from '../../core/events'
import type { BattleAction, BattleState, EventAction } from '../../core/types'
import { CLASSES } from '../classes'
import { CONSUMABLES } from '../consumables'
import { EQUIPMENT } from '../equipment'
import { OFFICERS } from '../officers'
import { STRATEGIES } from '../strategies'
import { TERRAIN } from '../terrain'
import { STAGES, stageById } from './index'
import { validateStageVerbose } from './validateStage'

// 번들 json 원본 — 로더(index.ts)는 검증 실패를 조용히 드롭하므로,
// "왜 드롭됐는지"를 알려면 원본을 직접 검증해야 한다 (v1.2에서 스테이지가 15개로 늘며 추가).
const STAGE_JSON = import.meta.glob<{ default: unknown }>('./json/*.json', { eager: true })

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
// v1.2 W-content — 원작 미구현 4전투 (제3부 「허도 천도」)
const STAGE_12 = stageById('stage12')!
const STAGE_13 = stageById('stage13')!
const STAGE_14 = stageById('stage14')!
const STAGE_15 = stageById('stage15')!

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
  it('번들 json 15개가 전부 검증기를 통과한다 (드롭 사유를 그대로 노출한다)', () => {
    const paths = Object.keys(STAGE_JSON).sort()
    expect(paths).toHaveLength(15)
    for (const path of paths) {
      const { stage, errors } = validateStageVerbose(STAGE_JSON[path].default)
      expect(errors, path).toEqual([])
      expect(stage, path).not.toBeNull()
    }
    expect(STAGES.map((s) => s.id)).toEqual([
      'stage01', 'stage02', 'stage03', 'stage04', 'stage05', 'stage06', 'stage07', 'stage08',
      'stage09', 'stage10', 'stage11', 'stage12', 'stage13', 'stage14', 'stage15',
    ])
  })

  it('스테이지 명칭 — v1.2 교정분 포함', () => {
    expect(STAGES.map((s) => s.name)).toEqual([
      '연습전 — 강가의 황건적',
      '관문 방어전',
      '황건 본진 소탕',
      '사수관 전투',
      '호로관 전투',
      '동탁 추격전',
      '청주 황건적 토벌전',
      '서주 보복전',
      '복양 전투',
      '서주 구원전',
      '여포 포위전',
      '헌제 구출전',
      '장수 토벌전',
      '원술 정벌전',
      '장수 토벌전 2',
    ])
  })

  it('패배 조건 — stage02만 turnLimit이 없다 (victory surviveTurns와 배타)', () => {
    for (const stage of STAGES) {
      const limit = (stage.defeat ?? []).find((d) => d.type === 'turnLimit')
      if (stage.id === 'stage02') {
        // surviveTurns(8턴 버티면 승리)와 turnLimit은 검증기가 함께 두지 못하게 막는다
        expect(stage.victory.some((v) => v.type === 'surviveTurns'), stage.id).toBe(true)
        expect(stage.defeat, stage.id).toBeUndefined()
        continue
      }
      expect(limit, `${stage.id} turnLimit`).toBeDefined()
      expect(limit?.type === 'turnLimit' && limit.turns, stage.id).toBe(20)
    }
    // 호위 대상 사망 패배는 stage12(헌제)뿐이다
    const escorts = STAGES.flatMap((s) => (s.defeat ?? []).map((d) => [s.id, d] as const))
      .filter(([, d]) => d.type === 'unitDies')
    expect(escorts.map(([id, d]) => [id, d.type === 'unitDies' && d.officerId])).toEqual([['stage12', 'xianDi']])
  })

  it('이벤트가 지급하는 아이템 id는 모두 실재한다 (validateStage가 보지 않는 giveItem/dropItem)', () => {
    const known = (itemId: string) => EQUIPMENT[itemId] !== undefined || CONSUMABLES[itemId] !== undefined
    const walk = (actions: EventAction[], where: string): void => {
      for (const action of actions) {
        if (action.type === 'choice') {
          for (const option of action.options) walk(option.actions, `${where}/${option.text}`)
          continue
        }
        if (action.type === 'giveItem' || action.type === 'dropItem') {
          expect(known(action.itemId), `${where}: ${action.itemId}`).toBe(true)
        }
      }
    }
    for (const stage of STAGES) {
      for (const event of stage.events ?? []) walk(event.actions, `${stage.id}/${event.id}`)
      for (const g of stage.groundItems ?? []) expect(known(g.itemId), `${stage.id} groundItems`).toBe(true)
    }
  })

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

    // 두 전투를 거친 로스터(≈Lv7, 초기 장비 유지)면 협곡→성문→성채까지 진행돼 장각을 잡는다.
    // v0.7에서 적 잡병이 방어구까지 갖추면서 맨몸 로스터로는 밀린다 — 실플레이 조건(장비 보유)으로 검증
    // v1.3-review: 성장등급을 §2로 교정(적 기병 atk S·궁병 사기 S)하면서 적도 강해져 기준을 Lv6→Lv7로 상향
    const roster = STAGE_03.units
      .filter((u) => u.faction === 'player')
      .map((u) => ({
        officerId: u.officerId,
        level: 7,
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

  it('선봉 손견의 우군 3기가 관 안쪽 동측에 갇혀 있고, 생존 시 고정도가 나온다 (v1.2)', () => {
    const allies = STAGE_04.units.filter((u) => u.faction === 'ally')
    expect(allies.map((u) => u.officerId)).toEqual(['sunJian', 'jingInfantry', 'jingCavalry'])
    for (const a of allies) {
      // 관문 벽은 x=11 — 우군은 그 동쪽(관 안)에 있다
      expect(a.pos.x, a.officerId).toBeGreaterThan(11)
      expect(a.behavior, a.officerId).toBe('guard')
      // HP 손실 상태를 표현할 수 없어 저레벨로 "이미 반 이상 잃은 선봉"을 표현한다
      expect(a.level!, a.officerId).toBeLessThanOrEqual(5)
    }
    expect(STAGE_04.loot).toEqual([{ trigger: 'allySurvived', officerId: 'sunJian', itemId: 'gudingDao' }])
    // 우군은 아군 리더 판정에 끼지 않는다
    expect(STAGE_04.units.filter((u) => u.faction === 'player' && u.isLeader)).toHaveLength(1)
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
    // 후방 본대는 이유가 이끌고, v1.2부터 서영이 함께 온다
    expect(waves[1].units.some((u) => u.officerId === 'liRu')).toBe(true)
    expect(waves[1].units.some((u) => u.officerId === 'xuRong')).toBe(true)
    expect(STAGE_06.victory).toEqual([{ type: 'annihilation' }])
  })

  it('서영 격파 = 가죽 방패 / 이유 격파 = 절영 (stage13 전위 구출의 핵심템, v1.2)', () => {
    expect((STAGE_06.events ?? []).map((e) => e.id)).toEqual([
      's06-open',
      's06-ambush',
      's06-xurong-fall',
      's06-liru-fall',
    ])
    const rewardOf = (eventId: string) =>
      (STAGE_06.events ?? [])
        .find((e) => e.id === eventId)!
        .actions.flatMap((a) => (a.type === 'giveItem' ? [a.itemId] : []))
    expect(rewardOf('s06-xurong-fall')).toEqual(['leatherShield'])
    expect(rewardOf('s06-liru-fall')).toEqual(['jueYing'])
    expect(EQUIPMENT.jueYing.moveBonus).toBeGreaterThan(0) // 이동력 — 불길을 돌아 전위에게 붙는 데 쓰인다
  })

  it('AI vs AI 시뮬레이션이 크래시 없이 승패를 낸다 (고난도 — 양쪽 허용)', () => {
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_06, 42, rosterAt(STAGE_06, 9)), 600).result)
    expect(['victory', 'defeat']).toContain(simulate(startBattle(STAGE_06, 7), 600).result)
  })
})

// ---------- 제2부 「연주에서 서주로」 (v1.0) ----------
// 밸런스 방침: 초·중반(stage07/08/10)은 직전 클리어 로스터로 고정 시드 승리를 단정하고,
// 고난도(stage09 여포 조우 · stage11 최종전)는 양쪽 허용 + 크래시 없음만 단정한다.

describe('스테이지 7 — 청주 황건적 토벌전', () => {
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

describe('스테이지 8 — 서주 보복전', () => {
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

  it('stage07 클리어 로스터(Lv14 + 장비)면 8시드 중 6승 이상 — 이길 때는 도겸을 잡는다', () => {
    // v1.2 R 교정으로 하후연의 순발이 88→66이 되어(원작 확정) 궁병 화력이 떨어졌다.
    // 턴 8 유비군 원군(Lv16 추격 3기)에 무너지는 시드가 생기는 것은 난이도 B의 의도된 폭이다.
    let wins = 0
    for (const seed of [42, 7, 1, 99, 2026, 3, 11, 77]) {
      const grown = simulate(startBattle(STAGE_08, seed, rosterAt(STAGE_08, 14)), 600)
      if (grown.result !== 'victory') continue
      wins += 1
      expect(grown.units.find((u) => u.isBoss)!.hp, `seed ${seed}`).toBe(0) // 승리는 보스 격파로만 난다
    }
    expect(wins).toBeGreaterThanOrEqual(6)
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

describe('스테이지 10 — 서주 구원전', () => {
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

describe('스테이지 11 — 여포 포위전 (하비)', () => {
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

// ---------- 제3부 「허도 천도」 — 원작 미구현 4전투 (v1.2 W-content) ----------
// 밸런스 방침: stage12/13/15는 예상 로스터로 고정 시드 승리를 단정하고,
// stage14 옵션 1(12턴 상한)은 고위험 갈래라 양쪽 허용 + 크래시 없음만 단정한다.

describe('스테이지 12 — 헌제 구출전', () => {
  it('호위 기믹: 헌제는 비무장 우군(마을)이고 그 사망이 패배 조건에 들어 있다', () => {
    const xianDi = STAGE_12.units.find((u) => u.officerId === 'xianDi')!
    expect(xianDi.faction).toBe('ally')
    expect(xianDi.behavior).toBe('guard')
    expect(xianDi.equipment).toEqual({}) // 비무장
    expect(STAGE_12.map.tiles[xianDi.pos.y][xianDi.pos.x]).toBe('village') // 매턴 회복
    expect(STAGE_12.defeat).toEqual([
      { type: 'turnLimit', turns: 20 },
      { type: 'unitDies', officerId: 'xianDi' },
    ])
    expect(STAGE_12.victory).toEqual([{ type: 'annihilation' }, { type: 'defeatBoss' }])
    expect(STAGE_12.units.find((u) => u.isBoss)!.officerId).toBe('liJue')
    // 북동 (12,1) = 동쪽 길(피신 지점) — 황토 개활지 속 유일한 평지
    expect(STAGE_12.map.tiles[1][12]).toBe('plain')
  })

  it('적은 전원 북서 진채(y≤2)에 guard로 서서 헌제를 즉살할 수 없다 [의도적 이탈]', () => {
    for (const u of STAGE_12.units.filter((u) => u.faction === 'enemy')) {
      // 궁병 사거리 2 + 헌제 y=5 → y≤2면 첫 턴부터 닿지 않는다. 이 제약을 깨면 회피 불가 패배가 생긴다
      expect(u.pos.y, u.officerId).toBeLessThanOrEqual(2)
      expect(u.behavior, u.officerId).toBe('guard')
    }
    expect(STAGE_12.units.some((u) => u.officerId === 'xuHuang' && u.faction === 'enemy')).toBe(true)
  })

  it('Lv16 로스터면 헌제를 지킨 채 이긴다 (2시드)', () => {
    for (const seed of [42, 7]) {
      const result = simulate(startBattle(STAGE_12, seed, rosterAt(STAGE_12, 16)), 800)
      expect(result.result, `seed ${seed}`).toBe('victory')
      expect(unitOf(result, 'xianDi').hp, `seed ${seed}`).toBeGreaterThan(0)
      expect(result.turn, `seed ${seed}`).toBeLessThanOrEqual(20)
    }
  })

  it('헌제가 실제로 쓰러지면 그 자리에서 패배한다 (unitDies)', () => {
    const state = autoResolveEvents(startBattle(STAGE_12, 1, rosterAt(STAGE_12, 16)))
    // 마을 회복(매턴 20%)이 있어 잔 HP 조작만으로는 죽지 않는다 — 실제로 8방을 에워싸게 두고
    // 격파는 전부 적 AI에 맡긴다 (격파 처리를 위조하지 않는다). 아군은 아무것도 하지 않는다.
    const around = [
      { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 },
      { x: 1, y: 5 }, { x: 3, y: 5 },
      { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 },
    ]
    let current = situate(state, (s) => {
      s.units
        .filter((u) => u.faction === 'enemy')
        .slice(0, around.length)
        .forEach((u, i) => {
          u.pos = around[i]
        })
    })
    for (let i = 0; i < 40 && current.result === 'ongoing'; i++) {
      current =
        current.phase === 'player'
          ? autoResolveEvents(applyAction(current, { type: 'endPhase' }))
          : autoResolveEvents(runAiPhase(current, current.phase))
    }
    expect(current.units.find((u) => u.officerId === 'xianDi')!.hp).toBe(0)
    expect(current.result).toBe('defeat')
    expect(current.log.at(-1)!.type).toBe('defeat')
  })

  it('조조×헌제 조우 선택지 ①호송: 헌제가 전장을 떠나고 승리·패배 조건이 갈린다', () => {
    const state = autoResolveEvents(startBattle(STAGE_12, 1, rosterAt(STAGE_12, 16)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 3, y: 5 } // 헌제 (2,5) 인접
    })
    const escort = autoResolveEvents(applyAction(meet, { type: 'endPhase' }), 0)
    expect(escort.firedEvents).toContain('s12-emperor')
    // removeUnits로 전장을 떠난 유닛은 unitDies를 영구히 발동시키지 않는다 (types.ts 계약)
    expect(escort.units.some((u) => u.officerId === 'xianDi')).toBe(false)
    expect(escort.defeatOverride).toEqual([{ type: 'turnLimit', turns: 20 }])
    expect(escort.victoryOverride).toEqual([
      { type: 'reachPoint', pos: { x: 12, y: 1 }, unitId: 'caocao' },
      { type: 'annihilation' },
    ])
    expect(escort.pendingRewards).toEqual([{ itemId: 'goldenArmor', kind: 'equipment' }])
  })

  it('선택지 ②소탕: 성자보검을 받고 호위 패배 조건이 그대로 남는다', () => {
    const state = autoResolveEvents(startBattle(STAGE_12, 1, rosterAt(STAGE_12, 16)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 3, y: 5 }
    })
    const stay = autoResolveEvents(applyAction(meet, { type: 'endPhase' }), 1)
    expect(stay.firedEvents).toContain('s12-emperor')
    expect(stay.units.some((u) => u.officerId === 'xianDi')).toBe(true)
    expect(stay.victoryOverride).toBeUndefined()
    expect(stay.defeatOverride).toBeUndefined()
    expect(stay.pendingRewards).toEqual([{ itemId: 'holySword', kind: 'equipment' }])
  })
})

describe('스테이지 13 — 장수 토벌전 (완성 야습)', () => {
  it('야영지 구조: 진문 (4,3) 하나, 강제출진 조조①·전위②, 전위 슬롯이 진문에 붙어 있다', () => {
    const gates: string[] = []
    for (let y = 0; y < STAGE_13.map.height; y++) {
      for (let x = 0; x < STAGE_13.map.width; x++) {
        if (STAGE_13.map.tiles[y][x] === 'gate') gates.push(`${x},${y}`)
      }
    }
    expect(gates).toEqual(['4,3'])
    expect(STAGE_13.forcedOfficers).toEqual(['caocao', 'dianwei'])
    expect(STAGE_13.playerSlots![0]).toEqual({ x: 8, y: 6 }) // ①조조 = 진영 안쪽
    expect(STAGE_13.playerSlots![1]).toEqual({ x: 5, y: 3 }) // ②전위 = 진문 바로 안쪽
    expect(STAGE_13.deployMin).toBe(5)
    expect(STAGE_13.deployMax).toBe(6)
    expect(STAGE_13.victory).toEqual([
      { type: 'annihilation' },
      { type: 'reachPoint', pos: { x: 1, y: 10 }, unitId: 'caocao' },
    ])
  })

  it('턴 2·3의 화염이 전위의 후퇴로를 태워 진입 불가로 만든다', () => {
    const turn2 = advanceToTurn(startBattle(STAGE_13, 1, rosterAt(STAGE_13, 17)), 2)
    expect(turn2.firedEvents).toContain('s13-fire-1')
    expect(turn2.hazards.map((h) => `${h.pos.x},${h.pos.y}`).sort()).toEqual(['5,4', '6,3', '6,4'])
    expect(turn2.hazards.every((h) => h.kind === 'fire')).toBe(true)
    // 불길 칸은 이동 후보에서 사라진다 (진입·통과 불가)
    const dianwei = unitOf(turn2, 'dianwei')
    const reach = [...movementRangeOf(turn2, dianwei).values()].map((c) => `${c.pos.x},${c.pos.y}`)
    expect(reach).not.toContain('5,4')
    expect(reach).not.toContain('6,4')

    const turn3 = advanceToTurn(turn2, 3)
    expect(turn3.firedEvents).toContain('s13-fire-2')
    expect(turn3.hazards.length).toBeGreaterThanOrEqual(4)
  })

  it('전위 생존 갈래(seed 7): 전위가 살아남고 승리한다', () => {
    const result = simulate(startBattle(STAGE_13, 7, rosterAt(STAGE_13, 17)), 800)
    expect(result.result).toBe('victory')
    expect(unitOf(result, 'dianwei').hp).toBeGreaterThan(0)
    expect(result.firedEvents).not.toContain('s13-dianwei-fall')
    // 호거아를 잡으면 비룡도복
    expect(result.firedEvents).toContain('s13-hucheer-fall')
    expect(result.pendingRewards).toContainEqual({ itemId: 'flyingDragonRobe', kind: 'equipment' })
  })

  it('전위 전사 갈래(seed 3): 진문에서 쓰러지지만 그래도 승리한다 + 봉황깃옷', () => {
    // v1.2 R 교정 후 전위는 무력 100·순발 98이 되어 seed 42에서는 살아남는다 — 전사 시드는 1이었다.
    // v1.3-review: 성장등급 §2 교정(보병 mind C→A·순 C→B)으로 전위가 단단해져 seed 1·2에서도 생존 —
    // 전사 시드를 3으로 갱신 (s13-dianwei-fall + 봉황깃옷 계약 유지)
    const result = simulate(startBattle(STAGE_13, 3, rosterAt(STAGE_13, 17)), 800)
    expect(result.result).toBe('victory')
    expect(result.units.find((u) => u.officerId === 'dianwei')!.hp).toBe(0)
    expect(result.firedEvents).toContain('s13-dianwei-fall')
    expect(result.pendingRewards).toContainEqual({ itemId: 'phoenixRobe', kind: 'equipment' })
  })

  it('전위를 잔 HP 1로 몰아넣어 확실히 전사시켜도 완주해 이긴다', () => {
    // 전위를 잃은 5부대만으로도 이길 수 있어야 한다 (8시드 중 6승 — 시드 42·7은 진다)
    const base = autoResolveEvents(startBattle(STAGE_13, 99, rosterAt(STAGE_13, 17)))
    const doomed = situate(base, (s) => {
      unitOf(s, 'dianwei').hp = 1
    })
    const result = simulate(doomed, 800)
    expect(result.units.find((u) => u.officerId === 'dianwei')!.hp).toBe(0)
    expect(result.firedEvents).toContain('s13-dianwei-fall')
    expect(result.result).toBe('victory')
  })

  it('전위×호거아 인접 → 일기토 무승부 (무기 도난은 대사로만 — 데미지·경험치 없음)', () => {
    const state = autoResolveEvents(startBattle(STAGE_13, 1, rosterAt(STAGE_13, 17)))
    const meet = situate(state, (s) => {
      unitOf(s, 'huCheEr').pos = { x: 4, y: 3 } // 진문 위 — 전위 (5,3) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s13-duel-hucheer')
    expect(unitOf(after, 'dianwei').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'huCheEr').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'dianwei').exp).toBe(0)
  })

  it('턴 4 구원대는 ally 진영으로 들어온다 (player 스폰 금지)', () => {
    const rescue = (STAGE_13.events ?? []).find((e) => e.id === 's13-rescue')!
    const spawn = rescue.actions.find((a) => a.type === 'spawnUnits')!
    expect(spawn.type === 'spawnUnits' && spawn.units.map((u) => [u.officerId, u.faction])).toEqual([
      ['weiInfantry', 'ally'],
      ['weiCavalry', 'ally'],
    ])
    let alliesSeen = 0
    const result = simulate(startBattle(STAGE_13, 7, rosterAt(STAGE_13, 17)), 800, (s) => {
      alliesSeen = Math.max(alliesSeen, livingUnits(s, 'ally').length)
    })
    expect(result.firedEvents).toContain('s13-rescue')
    expect(alliesSeen).toBeGreaterThan(0)
  })
})

describe('스테이지 14 — 원술 정벌전', () => {
  it('늪·강 구조: 여울 다수 + 다리 2개 + 요새 성문 1개, 우군 3방향', () => {
    let fords = 0
    const bridges: string[] = []
    const gates: string[] = []
    for (let y = 0; y < STAGE_14.map.height; y++) {
      for (let x = 0; x < STAGE_14.map.width; x++) {
        const t = STAGE_14.map.tiles[y][x]
        if (t === 'ford') fords += 1
        if (t === 'bridge') bridges.push(`${x},${y}`)
        if (t === 'gate') gates.push(`${x},${y}`)
      }
    }
    expect(fords).toBeGreaterThanOrEqual(20) // 기병 성능 80% 지대
    expect(bridges).toEqual(['4,6', '11,6'])
    expect(gates).toEqual(['6,2'])
    const allies = STAGE_14.units.filter((u) => u.faction === 'ally')
    expect(allies.map((u) => u.officerId)).toEqual(['lüBu', 'sunCe', 'liuBei', 'guanYu', 'zhangFei'])
    for (const a of allies) expect(a.behavior, a.officerId).toBe('guard')
    expect(STAGE_14.units.find((u) => u.isBoss)!.officerId).toBe('yuanShu')
    expect(STAGE_14.loot).toEqual([{ trigger: 'bossKill', itemId: 'moYuJian' }])
  })

  it('옵션 0(유비에게 도움을 청한다): 조건은 그대로, 보물 2점 + Lv18 로스터로 승리한다', () => {
    for (const seed of [42, 7]) {
      const result = simulate(startBattle(STAGE_14, seed, rosterAt(STAGE_14, 18)), 800, undefined, 0)
      expect(result.result, `seed ${seed}`).toBe('victory')
      expect(result.victoryOverride, `seed ${seed}`).toBeUndefined()
      expect(result.defeatOverride, `seed ${seed}`).toBeUndefined()
      expect(result.pendingRewards, `seed ${seed}`).toEqual([
        { itemId: 'windWheel', kind: 'equipment' },
        { itemId: 'bashoFan', kind: 'equipment' },
      ])
    }
  })

  it('옵션 1(군량총관 처형): 승리 = 보스 단일 / 패배 = 12턴 + 보물 2점에 인수까지 나온다', () => {
    const opened = autoResolveEvents(startBattle(STAGE_14, 42, rosterAt(STAGE_14, 18)), 1)
    expect(opened.firedEvents).toContain('s14-open')
    expect(opened.victoryOverride).toEqual([{ type: 'defeatBoss' }])
    expect(opened.defeatOverride).toEqual([{ type: 'turnLimit', turns: 12 }])
    // 원작 확정: 바람바퀴·파초선은 선택과 무관한 공통 보상이고, 인수만 이 갈래 전용이다 (kr-blog §R4)
    expect(opened.pendingRewards).toEqual([
      { itemId: 'windWheel', kind: 'equipment' },
      { itemId: 'bashoFan', kind: 'equipment' },
      { itemId: 'insu', kind: 'consumable' },
    ])
    // 12턴 상한은 빡빡하다 — 고위험 갈래라 시드에 따라 승패가 갈린다 (양쪽 허용)
    for (const seed of [42, 7]) {
      const result = simulate(startBattle(STAGE_14, seed, rosterAt(STAGE_14, 18)), 800, undefined, 1)
      expect(['victory', 'defeat'], `seed ${seed}`).toContain(result.result)
      expect(result.turn, `seed ${seed}`).toBeLessThanOrEqual(13) // 12턴을 넘기면 곧바로 패배 판정
    }
  })

  it('서쪽 여울목에 아군이 닿으면 여포가 농성을 풀고 참전한다', () => {
    const state = autoResolveEvents(startBattle(STAGE_14, 1, rosterAt(STAGE_14, 18)))
    expect(unitOf(state, 'lüBu').behavior).toBe('guard')
    const west = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 1, y: 7 }
    })
    const after = autoResolveEvents(applyAction(west, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s14-lubu-join')
    expect(unitOf(after, 'lüBu').behavior).toBe('pursue')
  })

  it('조조×원술 인접 → 설전 무승부 (원작에 승패 기록이 없다)', () => {
    const state = autoResolveEvents(startBattle(STAGE_14, 1, rosterAt(STAGE_14, 18)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 6, y: 2 } // 성문 위 — 원술 (6,1) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s14-yuanshu-debate')
    expect(unitOf(after, 'yuanShu').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').exp).toBe(0)
  })
})

describe('스테이지 15 — 장수 토벌전 2 (완성 재정벌)', () => {
  it('성 구조: 남문 (4,4) + 동측 트임 (8,3), 보스 2명, 보스 전멸 전리품이 인수다', () => {
    const gates: string[] = []
    for (let y = 0; y < STAGE_15.map.height; y++) {
      for (let x = 0; x < STAGE_15.map.width; x++) {
        if (STAGE_15.map.tiles[y][x] === 'gate') gates.push(`${x},${y}`)
      }
    }
    expect(gates).toEqual(['4,4'])
    expect(STAGE_15.map.tiles[3][8]).toBe('castle') // 동측 성벽이 끊긴 트임 — AI 병목 완화
    expect(STAGE_15.map.tiles[2][8]).toBe('wall')
    const bosses = STAGE_15.units.filter((u) => u.isBoss).map((u) => u.officerId)
    expect(bosses).toEqual(['zhangXiu', 'jiaXu'])
    // 원작 "전멸 시 인수" 재현 — bossKill은 isBoss 전원 격파를 요구한다
    expect(STAGE_15.loot).toEqual([{ trigger: 'bossKill', itemId: 'insu' }])
    expect(STAGE_15.victory).toEqual([
      { type: 'annihilation' },
      { type: 'reachPoint', pos: { x: 12, y: 1 }, unitId: 'caocao' },
    ])
  })

  it('성내 진입 선택지 — 양쪽 다 복병 4기가 붙고, 물러서면 아군 전체 방어 +10(2턴)', () => {
    const state = autoResolveEvents(startBattle(STAGE_15, 1, rosterAt(STAGE_15, 19)))
    const before = livingUnits(state, 'enemy').length
    const atGate = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 4, y: 4 }
    })

    const push = autoResolveEvents(applyAction(atGate, { type: 'endPhase' }), 0)
    expect(push.firedEvents).toContain('s15-southgate')
    expect(livingUnits(push, 'enemy').length).toBe(before + 4)
    expect(livingUnits(push, 'player').every((u) => u.buffs.length === 0)).toBe(true)

    const hold = autoResolveEvents(applyAction(atGate, { type: 'endPhase' }), 1)
    expect(livingUnits(hold, 'enemy').length).toBe(before + 4)
    for (const u of livingUnits(hold, 'player')) {
      expect(u.buffs.some((b) => b.stat === 'def' && b.amount === 10 && b.remainingTurns === 2), u.officerId).toBe(true)
    }
  })

  it('가후 주변에 닿으면 가후가 부동을 푼다 (인접 설전과 별개로 발동한다)', () => {
    const state = autoResolveEvents(startBattle(STAGE_15, 1, rosterAt(STAGE_15, 19)))
    expect(unitOf(state, 'jiaXu').behavior).toBe('guard')
    // (3,0) = 가후 (1,1)에서 체비쇼프 2 — 인접이 아니므로 설전은 아직 발동하지 않는다
    const near = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 3, y: 0 }
    })
    const after = autoResolveEvents(applyAction(near, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s15-jiaxu-move')
    expect(after.firedEvents).not.toContain('s15-jiaxu-debate')
    expect(unitOf(after, 'jiaXu').behavior).toBe('pursue')
  })

  it('Lv19 로스터면 8시드 중 6승 이상 — 이길 때는 20턴 안에 보스 2명을 잡는다 (턴 7 유표 원군 포함)', () => {
    // [밸런스 v1.2-R] 잡병 Lv17은 그대로 둔다 — Lv16으로 낮추면 턴 6에 끝나 버려
    // 턴 7 유표 원군(이 전투의 설계 핵심)이 아예 발동하지 않는다. 대신 시드 폭을 인정한다.
    let wins = 0
    for (const seed of [42, 7, 1, 99, 2026, 3, 11, 77]) {
      const result = simulate(startBattle(STAGE_15, seed, rosterAt(STAGE_15, 19)), 900)
      if (result.result !== 'victory') continue
      wins += 1
      expect(result.turn, `seed ${seed}`).toBeLessThanOrEqual(20)
      expect(result.units.filter((u) => u.isBoss).every((u) => u.hp === 0), `seed ${seed}`).toBe(true)
      expect(result.firedEvents, `seed ${seed}`).toContain('s15-liubiao')
      expect(result.pendingRewards, `seed ${seed}`).toContainEqual({ itemId: 'serpentSpear', kind: 'equipment' })
    }
    expect(wins).toBeGreaterThanOrEqual(6)
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

describe('이벤트 데이터 — v1.2 전량 58건', () => {
  it('15스테이지 전부 이벤트를 갖고 id는 스테이지 안에서 유일하다', () => {
    const counts = STAGES.map((s) => [s.id, (s.events ?? []).length] as const)
    expect(counts).toEqual([
      ['stage01', 2], ['stage02', 2], ['stage03', 2], ['stage04', 2], ['stage05', 2], ['stage06', 4],
      ['stage07', 1], ['stage08', 3], ['stage09', 4], ['stage10', 2], ['stage11', 9],
      ['stage12', 3], ['stage13', 12], ['stage14', 4], ['stage15', 6],
    ])
    expect(counts.reduce((n, [, c]) => n + c, 0)).toBe(58)
    for (const stage of STAGES) {
      const ids = (stage.events ?? []).map((e) => e.id)
      expect(new Set(ids).size, stage.id).toBe(ids.length)
    }
  })

  it('이벤트가 AI 시뮬을 막지 않는다 — 15스테이지 전부 승패가 나고 대기 큐가 비어 끝난다', () => {
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

describe('stage09 — 부호의 처분 (v1.2)', () => {
  it('성내 북쪽 골목에 닿으면 선택지가 뜬다 — 용서 = 여포궁 / 추방 = 군자금 3000', () => {
    const state = autoResolveEvents(startBattle(STAGE_09, 1, rosterAt(STAGE_09, 16)))
    const inside = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 7, y: 0 }
    })

    const spare = autoResolveEvents(applyAction(inside, { type: 'endPhase' }), 0)
    expect(spare.firedEvents).toContain('s09-fuhao')
    expect(spare.pendingRewards).toEqual([{ itemId: 'lüBuBow', kind: 'equipment' }])
    expect(spare.pendingGold).toBe(0)

    const expel = autoResolveEvents(applyAction(inside, { type: 'endPhase' }), 1)
    expect(expel.firedEvents).toContain('s09-fuhao')
    expect(expel.pendingRewards).toEqual([])
    expect(expel.pendingGold).toBe(3000)
  })
})

describe('stage11 — 여포군 장수 격파 전리품 (v1.2)', () => {
  it('진궁·후성·고순 격파 이벤트가 각각 보물을 지급한다', () => {
    const rewardOf = (eventId: string) =>
      (STAGE_11.events ?? [])
        .find((e) => e.id === eventId)!
        .actions.flatMap((a) => (a.type === 'giveItem' ? [a.itemId] : []))
    expect(rewardOf('s11-chengong-fall')).toEqual(['fuJin'])
    expect(rewardOf('s11-houcheng-fall')).toEqual(['leatherHorseArmor'])
    expect(rewardOf('s11-gaoshun-fall')).toEqual(['bronzeShield'])
  })

  it('일기토 사망(후성)도 unitDefeated 경로를 타 전리품이 나온다', () => {
    const state = autoResolveEvents(startBattle(STAGE_11, 1, rosterAt(STAGE_11, 18)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 5, y: 4 } // 후성 (4,4) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s11-duel-houcheng')
    expect(after.firedEvents).toContain('s11-houcheng-fall')
    expect(after.units.find((u) => u.officerId === 'houCheng')!.hp).toBe(0)
    expect(after.pendingRewards).toContainEqual({ itemId: 'leatherHorseArmor', kind: 'equipment' })
  })
})

describe('stage09 / stage11 — 일기토 (원작 확정 결과)', () => {
  it('duel 액션은 원작 1장 일기토 목록 안에서만 쓰인다 (kr-blog §R1의 11건 중 6건)', () => {
    const duels: string[] = []
    for (const stage of STAGES) {
      for (const e of stage.events ?? []) {
        for (const a of e.actions) if (a.type === 'duel') duels.push(`${stage.id}:${a.a}×${a.b}`)
      }
    }
    // 원작 11건 중 우리가 재현한 6건. 나머지 5건(관우×화웅, 여포×유비/관우/장비, 전위×장료)은
    // 해당 장수가 그 스테이지에 배치되지 않아 미구현이다 — kr-blog.md §R1의 미구현 목록 참조.
    expect(duels.sort()).toEqual([
      'stage10:xiahoudun×caoXing',   // 서주 구원전 — 개전 동시, 무승부 + 하후돈 실명 (원작 확정)
      'stage11:caocao×diaochan',     // 여포 포위전 — 무승부
      'stage11:caocao×houCheng',     // 여포 포위전 — 후성 사망
      'stage11:xiahoudun×weiXu',     // 여포 포위전 — 위속 사망
      'stage11:xiahouyuan×songXian', // 여포 포위전 — 송헌 사망
      'stage13:dianwei×huCheEr',     // 장수 토벌전 — 무승부 (호거아는 통상 전투로 잡아야 비룡도복)
      'stage14:caocao×yuanShu',      // [창작] 원술 설전 — 원작에 승패 기록이 없어 무승부로 고정
      'stage15:caocao×jiaXu',        // [창작] 가후 설전 — 원작 장수 토벌전 2도 일기토는 없다
    ].sort())
  })

  it('stage09 조조×여포: 일기토가 아니라 대사 연출이다 (원작 복양 3연전은 일기토 없음)', () => {
    // 원작 1장의 정식 일기토는 11건이고 복양전은 그 목록에 없다 — biglobe도 thewiki도 「일기토 없음」이며
    // 한국어 공략은 접촉 장면을 「단순히 칼을 주고 받습니다」로만 적는다 (kr-blog §R1).
    const state = autoResolveEvents(startBattle(STAGE_09, 1, rosterAt(STAGE_09, 16)))
    const meet = situate(state, (s) => {
      unitOf(s, 'caocao').pos = { x: 5, y: 4 } // 여포 (5,3) 인접
    })
    const after = autoResolveEvents(applyAction(meet, { type: 'endPhase' }))
    expect(after.firedEvents).toContain('s09-lubu-clash')
    expect((STAGE_09.events ?? []).find((e) => e.id === 's09-lubu-clash')!.actions.map((a) => a.type))
      .toEqual(['dialogue'])
    expect(unitOf(after, 'lüBu').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').hp).toBeGreaterThan(0)
    expect(unitOf(after, 'caocao').exp).toBe(0) // 연출이라 무보상
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
