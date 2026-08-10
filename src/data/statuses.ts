// 상태이상 정의 — 명칭·설명·수치의 단일 출처 (UI 라벨 포함).
// 원작 규칙: 지속턴 없음, 매턴 자기 페이즈 시작 시 장수 운÷2 % 확률로 각각 자연 해제 (caocao.md §90).
// [설계값] 표시 수치는 R 조사(docs/research/statuses.md) 확정 후 이 파일만 패치한다.

import type { StatusId } from '../core/types'

export interface StatusDef {
  id: StatusId
  name: string
  desc: string
  /** 독 전용 — 매턴 자기 페이즈 시작 시 최대 HP 대비 데미지 % [설계값 10] */
  poisonDamagePct?: number
}

export const STATUSES: Record<StatusId, StatusDef> = {
  poison: {
    id: 'poison',
    name: '독',
    desc: '매턴 부대가 손해를 입는다. 해독약으로 치료.',
    poisonDamagePct: 10,
  },
  confusion: {
    id: 'confusion',
    name: '혼란',
    desc: '부대가 행동할 수 없다. 각성약으로 치료 — 혼란에 빠진 부대는 스스로 약을 쓸 수 없다.',
  },
  immobile: {
    id: 'immobile',
    name: '부동',
    desc: '부대가 이동할 수 없다. 제자리 공격·책략은 가능. 도포약으로 치료.',
  },
  seal: {
    id: 'seal',
    name: '금책',
    desc: '책략을 쓸 수 없다. 양치약으로 치료.',
  },
}

/** UI 라벨 헬퍼 — 미등록 id 내성 */
export const statusName = (id: string): string => STATUSES[id as StatusId]?.name ?? id
