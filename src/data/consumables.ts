// 도구(전투 중 소모품) 정의 — 원작 확정 목록 (docs/research/items.md §1).
// 사료: 원작 데이터 파일 Data.e5 아이템 테이블 직접 디코딩 (104레코드×25byte, ID 87–103 = 소모품).
// 가격 필드는 "가격÷100" 저장이며 구입가 = 필드×100 / 판매가 = 필드×75, 255 = 비매품.
// (ekd5는 장비와 같은 반값 판매 관례를 쓴다 — sellConsumable, 원작 75%와는 소폭 차이나는 설계값.)
// ※ 마늘·환약·정력견혈산 계열은 원작에 존재하지 않는다 — v0.9에서 삭제됐다.
//
// range = **체비쇼프 거리** (1 = 자기 자신 + 인접 8방). 원작 확정: 회복·해제·인수 모두
// "진영 일치 + 체비쇼프 ≤ 1" 게이트를 쓴다(엔진 에러 문자열 「周围八格」). 자기 전용 특례는 없다.
// (이동·공격·책략 사거리는 맨해튼 — 도구만 8방 거리다.)
//
// 상태해제약 4종·만능약은 **상태이상을 부여하는 책략이 아직 없어 당분간 유휴 콘텐츠**다.
// 허보(혼란)·독계 책략이 들어오면 그때부터 실효를 갖는다 — 데이터만 선반영한다 (items.md §5).
// [설계값] 표시는 원작이 "줍기 전용"(보물고·점령)이라 상점 가격 사료가 없는 항목 —
// 점령 습득 시스템이 들어올 때까지 상점 판매로 대체한다.

import type { CampaignState } from '../core/campaign'
import { chapterOf } from '../core/campaign'
import type { ConsumableDef } from '../core/types'

/** 종류별 재고 상한 — 원작 저장 구조가 1바이트 카운트다 (Data.e5 / 엔진 확정) */
export const CONSUMABLE_STOCK_MAX = 255

export const CONSUMABLES: Record<string, ConsumableDef> = {
  // ---- HP 회복 (Data.e5 ID 87~89) ----
  hoebokKong: {
    id: 'hoebokKong',
    name: '회복의 콩',
    desc: '부대의 HP를 30 회복한다.',
    price: 100, // 원작: 1장부터 상점 상시 판매 / 적 병영 점령
    range: 1,
    effect: { kind: 'heal', amount: 30 },
  },
  hoebokSsal: {
    id: 'hoebokSsal',
    name: '회복의 쌀',
    desc: '부대의 HP를 80 회복한다.',
    price: 300, // 원작: 중반 상점 / 적 성 점령
    range: 1,
    effect: { kind: 'heal', amount: 80 },
  },
  hoebokBoksunga: {
    id: 'hoebokBoksunga',
    name: '회복의 복숭아',
    desc: '부대의 HP를 전부 회복한다.',
    price: 1000, // [설계값] 원작은 상점 미등장(적장 자리 등 줍기 전용) — 점령 습득 도입 전 대체
    range: 1,
    effect: { kind: 'heal', amount: 9999 }, // 전량 회복 (maxHp에서 잘린다)
  },

  // ---- MP 회복 (Data.e5 ID 90~91) ----
  sinbiMul: {
    id: 'sinbiMul',
    name: '신비로운 물',
    desc: '부대의 책략치(MP)를 30 회복한다.',
    price: 500, // 원작: 중반부터 상점
    range: 1,
    effect: { kind: 'mpRestore', amount: 30 },
  },
  sinbiSul: {
    id: 'sinbiSul',
    name: '신비로운 술',
    desc: '부대의 책략치(MP)를 80 회복한다.',
    price: 1000, // [설계값] 원작은 보물고·관문 줍기 전용
    range: 1,
    effect: { kind: 'mpRestore', amount: 80 },
  },

  // ---- 상태이상 해제 (Data.e5 ID 92~96) ----
  // 원작 입수처는 전부 보물고이며 만능약만 상점 전용이다.
  // 각성약 비고: 혼란은 행동 불가라 자기 자신에게 쓸 수 없다 — "인접 아군 사용"의 독립 증거.
  haedokYak: {
    id: 'haedokYak',
    name: '해독약',
    desc: '독을 치료한다.',
    price: 300,
    range: 1,
    effect: { kind: 'cureStatus', statuses: ['poison'] },
  },
  gakseongYak: {
    id: 'gakseongYak',
    name: '각성약',
    desc: '혼란을 가라앉힌다.',
    price: 300,
    range: 1,
    effect: { kind: 'cureStatus', statuses: ['confusion'] },
  },
  dopoYak: {
    id: 'dopoYak',
    name: '도포약',
    desc: '움직일 수 없는 상태를 풀어준다.',
    price: 300,
    range: 1,
    effect: { kind: 'cureStatus', statuses: ['immobile'] },
  },
  yangchiYak: {
    id: 'yangchiYak',
    name: '양치약',
    desc: '책략을 봉인당한 상태를 풀어준다.',
    price: 300,
    range: 1,
    effect: { kind: 'cureStatus', statuses: ['seal'] },
  },
  mannungYak: {
    id: 'mannungYak',
    name: '만능약',
    desc: '모든 상태이상을 치료한다.',
    price: 1000, // 원작 상점 전용
    range: 1,
    effect: { kind: 'cureStatus', statuses: 'all' },
  },

  // ---- 승급 (Data.e5 ID 97) ----
  // 원작대로 전투 중 사용하는 승급 아이템. 사용 즉시 클래스업 + HP/MP 완전회복.
  // 원작 확정: **2부(원작 2장)부터 1000에 상점 판매** — 진열 여부는 shopConsumables가
  // chapterOf로 판정한다 (1부에서는 전투 보상으로만 입수).
  insu: {
    id: 'insu',
    name: '인수(印綬)',
    desc: 'Lv15 이상의 부대를 상위 병과로 승급시킨다. 사용하면 HP와 MP가 모두 회복된다.',
    price: 1000,
    range: 1,
    effect: { kind: 'promotion' },
  },
}

/**
 * 상점 진열 목록 — 가격이 있는 도구 중, 인수는 2부부터 (원작: 2장부터 상점 판매).
 * 판정은 현재 노드에서 파생(chapterOf) — 세이브에 장 상태를 두지 않는다.
 */
export function shopConsumables(campaign: Pick<CampaignState, 'nodeId'>): ConsumableDef[] {
  const chapter = chapterOf(campaign.nodeId)
  return Object.values(CONSUMABLES)
    .filter((c) => c.price !== null)
    .filter((c) => c.effect.kind !== 'promotion' || chapter >= 2)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || a.name.localeCompare(b.name, 'ko'))
}
