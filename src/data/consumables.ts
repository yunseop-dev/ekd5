// 도구(전투 중 소모품) 정의 — v0.9 계약 스켈레톤.
// 수치·명칭·목록은 R 조사(docs/research/items.md) 확정 후 이 파일만 패치한다.
// [설계값] 표시가 있는 항목은 원작 미확인 상태의 자리표시다.
//
// range = **체비쇼프 거리** (1 = 자기 자신 + 인접 8방). 원작 확정(ccz-compat-engine 대조):
// 회복 아이템과 인수 모두 "진영 일치 + 체비쇼프 ≤ 1" 게이트를 쓰며, 인수도 자기 전용 특례가 없다.
// (이동·공격·책략 사거리는 맨해튼 — 도구만 8방 거리다.)

import type { ConsumableDef } from '../core/types'

export const CONSUMABLES: Record<string, ConsumableDef> = {
  // [설계값] HP 회복 소모품 — 원작 회복 아이템(마늘 등) 확정 전 자리표시
  hwanyak: {
    id: 'hwanyak',
    name: '환약',
    desc: '부대의 부상병을 수습한다. HP를 회복한다.',
    price: 500,
    range: 1, // 자기 + 인접 8방 (체비쇼프)
    effect: { kind: 'heal', amount: 50 },
  },
  // [설계값] MP 회복 소모품
  boyangtang: {
    id: 'boyangtang',
    name: '보양탕',
    desc: '심신을 다스리는 탕약. MP를 회복한다.',
    price: 800,
    range: 1, // 자기 + 인접 8방 (체비쇼프)
    effect: { kind: 'mpRestore', amount: 30 },
  },
  // 인수 — 원작대로 전투 중 사용하는 승급 아이템. 사용 즉시 클래스업 + HP/MP 완전회복.
  // 입수는 특정 전투 승리 보상(rewardSeal 노드) — 현재 장에서는 비매품 (원작은 2장부터 상점 판매)
  insu: {
    id: 'insu',
    name: '인수(印綬)',
    desc: 'Lv15 이상의 부대를 상위 병과로 승급시킨다. 사용하면 HP와 MP가 모두 회복된다.',
    price: null,
    range: 1, // 자기 + 인접 8방 (체비쇼프)
    effect: { kind: 'promotion' },
  },
}
