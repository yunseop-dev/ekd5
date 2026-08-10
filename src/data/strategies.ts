// 책략 정의 — MVP 서브셋.
// v0.9에서 원작 데이터(docs/research/items.md §3 — biglobe effect.htm 범위 코드 완전 해독)에 맞춰 정합했다:
//  - 사거리/영향 코드: イ~×(사거리 13종) + A~E(영향 5종). A=단일 / B=십자5 / C=ㅁ자9
//  - **바람 계열만 ㅁ자(3×3)**, 화·수·지계는 십자. 1차 버프·디버프도 원작은 전부 십자다.
//  - 회복량은 고정이 아니라 **base + floor(시전자 정신력 / mindDiv)**
//  - 명칭도 원작명으로 교정: 치료 → 소보급 / 대치료 → 구원대 / 격려 → 고양
// 버프량·지속턴은 원작 수치 미확보라 설계값 유지.

import type { StrategyDef } from '../core/types'

export const STRATEGIES: Record<string, StrategyDef> = {
  // ---- 화계 (우천 시 사용 불가) ----
  choyeol: {
    id: 'choyeol',
    name: '초열',
    kind: 'damage',
    element: 'fire',
    mpCost: 6,
    range: 4,
    area: 'single',
    power: 70,
    capHitRate: 100,
    targets: 'enemy',
  }, // 원작 ルＡ 70%/100% — 일치 확인
  eophwa: {
    id: 'eophwa',
    name: '업화',
    kind: 'damage',
    element: 'fire',
    mpCost: 10,
    range: 3,
    area: 'single',
    power: 90,
    capHitRate: 90,
    targets: 'enemy',
  }, // 원작 チＡ 90%/90% — 일치 확인
  hwajin: {
    id: 'hwajin',
    name: '화진',
    kind: 'damage',
    element: 'fire',
    mpCost: 12,
    range: 4,
    area: 'cross',
    power: 50,
    capHitRate: 90,
    targets: 'enemy',
  }, // 원작 ルＢ 50%/90% — 일치 확인
  // 화룡 — 2차 병과(참모) 전용 광역 화계. 원작 チＢ 위력 70 확정 (v0.9에서 60→70 교정)
  hwaryong: {
    id: 'hwaryong',
    name: '화룡',
    kind: 'damage',
    element: 'fire',
    mpCost: 20,
    range: 3,
    area: 'cross',
    power: 70,
    capHitRate: 80,
    targets: 'enemy',
  },

  // ---- 풍계 (날씨 무관) — 원작에서 바람 계열만 ㅁ자 범위를 갖는다 ----
  seonpung: {
    id: 'seonpung',
    name: '선풍',
    kind: 'damage',
    element: 'wind',
    mpCost: 6,
    range: 4,
    area: 'single',
    power: 50,
    capHitRate: 100,
    targets: 'enemy',
  }, // 원작 ルＡ 50%/100% — 일치 확인
  // 풍진 — 원작 ルＣ(ㅁ자 3×3) 위력 40 / 한계명중 100. "풍진 한방에 9명" 실측 근거.
  // 습득 레벨은 설계값 (원작 습득표 미확보)
  pungjin: {
    id: 'pungjin',
    name: '풍진',
    kind: 'damage',
    element: 'wind',
    mpCost: 12,
    range: 4,
    area: 'square',
    power: 40,
    capHitRate: 100,
    targets: 'enemy',
  },

  // ---- 회복 (원작 補給 계열 — 회복량 = base + 정신력/mindDiv) ----
  sobogeup: {
    id: 'sobogeup',
    name: '소보급',
    kind: 'heal',
    element: 'holy',
    mpCost: 6,
    range: 4,
    area: 'single',
    heal: { base: 40, mindDiv: 10 },
    capHitRate: 100,
    targets: 'ally',
  }, // 원작 ルＡ MP6 40+정신/10
  // 구원대 — 2차 병과(방술사) 전용 광역 회복. 원작 援隊 = ルＢ(십자5) MP12
  guwondae: {
    id: 'guwondae',
    name: '구원대',
    kind: 'heal',
    element: 'holy',
    mpCost: 12,
    range: 4,
    area: 'cross',
    heal: { base: 40, mindDiv: 10 },
    capHitRate: 100,
    targets: 'ally',
  },

  // ---- 버프 / 디버프 (원작 1차는 전부 ルＢ = 십자5, MP6, 사거리4) ----
  yeonbyeong: {
    id: 'yeonbyeong',
    name: '연병',
    kind: 'buff',
    element: 'none',
    mpCost: 6,
    range: 4,
    area: 'cross',
    buff: { stat: 'agi', amount: 30, duration: 3 }, // 증감폭·지속은 설계값
    capHitRate: 100,
    targets: 'ally',
  },
  dunbyeong: {
    id: 'dunbyeong',
    name: '둔병',
    kind: 'debuff',
    element: 'none',
    mpCost: 6,
    range: 4,
    area: 'cross',
    buff: { stat: 'agi', amount: -30, duration: 3 },
    capHitRate: 90,
    targets: 'enemy',
  },
  // 고양 — 원작명 昂揚 (구 '격려'). 사기 상승, ルＢ
  goyang: {
    id: 'goyang',
    name: '고양',
    kind: 'buff',
    element: 'none',
    mpCost: 6,
    range: 4,
    area: 'cross',
    buff: { stat: 'morale', amount: 30, duration: 3 },
    capHitRate: 100,
    targets: 'ally',
  },

  // ---- 방해 (상태이상 부여) — 전부 원작 ルＡ = 사거리 4 / 단일 / MP8 ----
  // 지속턴이 없는 게 원작 사양이다: 걸리면 장수 운÷2 % 자연 해제나 해제약까지 계속 간다
  // (docs/research/caocao.md §90). 그래서 위력 대신 **한계명중**이 유일한 조절 손잡이다.
  heobo: {
    id: 'heobo',
    name: '허보',
    kind: 'status',
    element: 'none',
    mpCost: 8,
    range: 4,
    area: 'single',
    inflicts: 'confusion',
    capHitRate: 80, // 원작 확정 (docs/research/items.md §3)
    targets: 'enemy',
  },
  bongchaek: {
    id: 'bongchaek',
    name: '봉책',
    kind: 'status',
    element: 'none',
    mpCost: 8,
    range: 4,
    area: 'single',
    inflicts: 'seal',
    capHitRate: 80, // [설계값] 허보와 동급 — R 조사 확정 대기
    targets: 'enemy',
  },
  dogyeon: {
    id: 'dogyeon',
    name: '독연',
    kind: 'status',
    element: 'none',
    mpCost: 8,
    range: 4,
    area: 'single',
    inflicts: 'poison',
    capHitRate: 80, // [설계값]
    targets: 'enemy',
  },
  pobak: {
    id: 'pobak',
    name: '포박',
    kind: 'status',
    element: 'none',
    mpCost: 8,
    range: 4,
    area: 'single',
    inflicts: 'immobile',
    capHitRate: 80, // [설계값]
    targets: 'enemy',
  },
}
