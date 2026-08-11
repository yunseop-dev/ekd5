/**
 * 승리/패배 조건 문구 — 원작 조조전의 상단 정보 스트립 어투를 그대로 만든다.
 *
 * 원작 확정 문구 (스크린샷 판독):
 *   승리조건: 적을 전멸시킨다.
 *   패배조건: 1. 조조의 사망 2. 20턴을 넘긴다.
 *
 * 이 모듈은 **순수 함수만** 담는다 — 조건 배열(effectiveVictory/effectiveDefeat의 결과)과
 * 이름 조회에 필요한 BattleState를 받아 문장을 돌려준다. 조사는 josa 헬퍼 단일 출처를 쓴다.
 *
 * 주의: 패배 조건의 "주인공 격파"는 엔진 기본이라 DefeatCondition[] 에 들어 있지 않다 —
 * defeatText가 항상 1번 항목으로 앞세운다 (원작도 「조조의 사망」이 늘 1번이다).
 */

import type { BattleState, DefeatCondition, UnitState, VictoryCondition } from '../core/types'
import { OFFICERS } from '../data/officers'
import { eulReul, iGa } from './josa'

/** 복수 조건 연결자 — 원작은 「또는」으로 잇는다 (하나만 달성해도 승리) */
const OR = ' 또는 '

/** 장수 id → 이름. 미등록 id는 그대로 노출해 데이터 실수가 눈에 보이게 한다 */
const officerName = (officerId: string): string => OFFICERS[officerId]?.name ?? officerId

/** 유닛 id 또는 장수 id로 전장의 유닛을 찾는다 (코어 reachPoint 판정과 같은 기준) */
function findUnit(state: BattleState, ref: string): UnitState | undefined {
  return state.units.find((u) => u.id === ref || u.officerId === ref)
}

/** 아군 주인공 — 이름 폴백의 기준점 */
const leaderOf = (state: BattleState): UnitState | undefined =>
  state.units.find((u) => u.faction === 'player' && u.isLeader)

/**
 * 적 보스 이름 목록 — 격파 여부와 무관하게 뽑는다 (조건 문구는 전투 내내 같아야 한다).
 * 중복 이름은 한 번만 센다 (같은 몹 id를 보스로 여럿 둔 데이터 방어).
 */
function bossNames(state: BattleState): string[] {
  const out: string[] = []
  for (const u of state.units) {
    if (u.faction !== 'enemy' || !u.isBoss) continue
    const name = officerName(u.officerId)
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** 승리 조건 1개의 문구 */
function victoryOne(cond: VictoryCondition, state: BattleState): string {
  switch (cond.type) {
    case 'annihilation':
      return '적을 전멸시킨다.'
    case 'defeatBoss': {
      const names = bossNames(state)
      // 보스 데이터가 없는 스테이지도 문장은 성립해야 한다 (원작 「적장을 퇴각시킨다.」)
      if (names.length === 0) return `${eulReul('적장')} 퇴각시킨다.`
      const subject = names.length === 1 ? names[0] : `${names[0]} 등 ${names.length}명`
      return `${eulReul(subject)} 퇴각시킨다.`
    }
    case 'reachPoint': {
      const unit = cond.unitId ? findUnit(state, cond.unitId) : leaderOf(state)
      const name = unit
        ? officerName(unit.officerId)
        : cond.unitId
          ? officerName(cond.unitId)
          : '주인공'
      return `${iGa(name)} 지정 지점에 도달한다.`
    }
    case 'surviveTurns':
      return `${cond.turns}턴까지 버틴다.`
  }
}

/**
 * 승리 조건 문구 — 「승리조건: 」 접두사는 붙이지 않는다 (표시하는 쪽이 라벨을 소유).
 * 조건이 없으면 빈 문자열이 아니라 안내를 돌려준다 — 스트립이 비면 정보가 사라진 것처럼 보인다.
 */
export function victoryText(victory: VictoryCondition[], state: BattleState): string {
  if (victory.length === 0) return '없음'
  return victory.map((c) => victoryOne(c, state)).join(OR)
}

/** 패배 조건 1개의 문구 (번호 없음) */
function defeatOne(cond: DefeatCondition, state: BattleState): string {
  switch (cond.type) {
    case 'turnLimit':
      return `${cond.turns}턴을 넘긴다.`
    case 'unitDies': {
      // 전장에 있는 유닛을 먼저 본다 — 호위 대상은 우군으로 참전하는 경우가 많다
      const unit = findUnit(state, cond.officerId)
      return `${officerName(unit?.officerId ?? cond.officerId)}의 사망`
    }
  }
}

/**
 * 패배 조건 문구 — 항상 「1. {주인공}의 사망」으로 시작하고 데이터 조건이 뒤에 번호로 붙는다.
 * (주인공 격파는 엔진 상수라 DefeatCondition[]에 없다 — 여기서 합성한다)
 */
export function defeatText(
  defeat: DefeatCondition[],
  state: BattleState,
  leaderName: string,
): string {
  const items = [`${leaderName}의 사망`, ...defeat.map((c) => defeatOne(c, state))]
  return items.map((t, i) => `${i + 1}. ${t}`).join(' ')
}

/** 주인공 이름 — defeatText의 첫 항목에 쓴다. 주인공이 없으면 「주인공」 */
export function leaderNameOf(state: BattleState): string {
  const leader = leaderOf(state)
  return leader ? officerName(leader.officerId) : '주인공'
}

/** 패배 조건에서 최대 턴을 뽑는다 (원작 표준 20턴). 없으면 null — 「턴 수 n」만 표시한다 */
export function turnLimitOf(defeat: DefeatCondition[]): number | null {
  for (const c of defeat) if (c.type === 'turnLimit') return c.turns
  return null
}
