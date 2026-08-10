// 전투 내 이벤트 엔진 (v1.1) — 골격.
// 설계: 액션 처리 중 이산 사건(occurred)을 수집해 applyAction 공통 후처리에서 일괄 평가한다.
// 즉시형 액션(buff/spawn/remove/setBehavior/setTile/levelUpEnemies/giveItem/giveExp)은 그 자리에서
// 실행하고, 표시형(dialogue/choice/duel)을 만나면 잔여 큐를 state.pendingEvents에 쌓고 정지한다.
// UI/시뮬은 eventContinue 액션으로 큐를 소비한다. 구현은 W1 트랙 — 이 파일은 계약 골격이다.

import type { BattleState, StageDef } from './types'

/** 액션 처리 중 발생한 이산 사건 — 위치 트리거(unitsMeet/reachArea)는 매번 전수 평가라 수집 불필요 */
export type OccurredEvent =
  | { type: 'battleStart' }
  | { type: 'turnStart'; turn: number }
  | { type: 'unitDefeated'; officerId: string }

/**
 * 미발동 이벤트 중 트리거가 맞는 것을 정의 순서대로 발동한다 (firedEvents 갱신 + 즉시형 실행 +
 * 표시형에서 pendingEvents 적재). applyAction 공통 후처리와 startBattle(battleStart)에서 호출.
 */
export function runEvents(state: BattleState, stage: StageDef, occurred: OccurredEvent[]): void {
  // W1 구현 예정 — Phase 0 골격 (호출부가 먼저 배선돼도 무해하도록 no-op)
  void state
  void stage
  void occurred
}

/**
 * 대기 이벤트를 자동 소화한다 — 테스트 시뮬레이션과 연출 생략(speed 0)용.
 * choice는 pick(기본 0 = 밸런스 기준선)을 고른다.
 */
export function autoResolveEvents(state: BattleState, pick = 0): BattleState {
  // W1 구현 예정 — applyAction({type:'eventContinue', choice: pick}) 반복
  void pick
  return state
}
