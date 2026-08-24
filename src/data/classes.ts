// 병과 정의 — 1차 6종 + 2차 6종 (Lv15 + 인수로 승급, docs/research/caocao.md §2.2).
// lineage = 계열 루트(1차 병과 id) — 장비 착용 판정은 항상 계열 기준이라 승급해도 무기를 잃지 않는다.
// 성장등급 배치 원칙(docs/research/caocao.md §2):
//  - 기병: 공격 우수, 기동 6, 평지 강함 / 보병: 방어 S 탱커 / 궁병: 공격 A 원거리
//  - 책사: 정신 S 공격책략 특화 / 풍수사: 힐러+버퍼 / 군주: 밸런스형 + 사기 S
// HP/MP 스케일 근거: 조홍 HP 116→434(Lv1→50), 곽가 MP 48→154 → 대략 HP +6~7/lv, MP +2~3/lv

import type { UnitClassDef } from '../core/types'

export const CLASSES: Record<string, UnitClassDef> = {
  lord: {
    id: 'lord',
    lineage: 'lord',
    promotesTo: 'chancellor',
    name: '군웅',
    tier: 1,
    category: 'lord',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'A', mind: 'A', agi: 'B', morale: 'S' },
    hpBase: 120,
    hpGrowth: 7,
    mpBase: 20,
    mpGrowth: 2,
    strategies: [
      { strategyId: 'goyang', learnLevel: 1 },
      { strategyId: 'seonpung', learnLevel: 8 },
    ],
  },
  lightCavalry: {
    id: 'lightCavalry',
    lineage: 'lightCavalry',
    promotesTo: 'heavyCavalry',
    name: '경기병',
    tier: 1,
    category: 'cavalry',
    mounted: true,
    ranged: false,
    move: 6,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'horse',
    growth: { atk: 'A', def: 'B', mind: 'C', agi: 'A', morale: 'B' },
    hpBase: 110,
    hpGrowth: 6,
    mpBase: 10,
    mpGrowth: 1,
    strategies: [],
  },
  heavyInfantry: {
    id: 'heavyInfantry',
    lineage: 'heavyInfantry',
    promotesTo: 'guardInfantry',
    name: '경보병',
    tier: 1,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'foot',
    growth: { atk: 'B', def: 'S', mind: 'C', agi: 'C', morale: 'B' },
    hpBase: 130,
    hpGrowth: 7,
    mpBase: 10,
    mpGrowth: 1,
    strategies: [],
  },
  archer: {
    id: 'archer',
    lineage: 'archer',
    promotesTo: 'crossbowman',
    name: '궁병',
    tier: 1,
    category: 'archer',
    mounted: false,
    ranged: true,
    move: 4,
    minRange: 2,
    maxRange: 2,
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'C', mind: 'B', agi: 'B', morale: 'C' },
    hpBase: 100,
    hpGrowth: 5,
    mpBase: 10,
    mpGrowth: 1,
    strategies: [],
  },
  strategist: {
    id: 'strategist',
    lineage: 'strategist',
    promotesTo: 'counselor',
    name: '책사',
    tier: 1,
    category: 'strategist',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'C', mind: 'S', agi: 'B', morale: 'B' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 30,
    mpGrowth: 3,
    strategies: [
      { strategyId: 'choyeol', learnLevel: 1 },
      { strategyId: 'seonpung', learnLevel: 3 },
      { strategyId: 'dunbyeong', learnLevel: 5 },
      { strategyId: 'hwajin', learnLevel: 8 },
      { strategyId: 'pungjin', learnLevel: 10 }, // 풍계 ㅁ자(3×3) — 습득 레벨은 설계값
      { strategyId: 'eophwa', learnLevel: 12 },
      { strategyId: 'heobo', learnLevel: 14 }, // 방해(혼란) — 습득 레벨 [설계값]
    ],
  },
  geomancer: {
    id: 'geomancer',
    lineage: 'geomancer',
    promotesTo: 'seniorGeomancer',
    name: '풍수사',
    tier: 1,
    category: 'support',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'C', mind: 'A', agi: 'B', morale: 'A' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 30,
    mpGrowth: 3,
    strategies: [
      { strategyId: 'sobogeup', learnLevel: 1 },
      { strategyId: 'goyang', learnLevel: 3 },
      { strategyId: 'yeonbyeong', learnLevel: 6 },
      { strategyId: 'pobak', learnLevel: 14 }, // 방해(부동) — 습득 레벨 [설계값]
    ],
  },

  // ---------- 2차 병과 (Lv15 + 인수 승급) ----------
  // 원작 규칙 (docs/research/promotion.md §2·§3, biglobe 部隊一覧 + 나무위키 병과):
  //  - 승급은 능력치·성장률을 바꾸지 않는다 ("영걸전, 공명전과 다르게 … 변화가 없다")
  //  - 클래스업 보너스 = HP/MP 최대치 +레벨성장치×2 (조창 107→372 검산 일치)
  //    → 기본치에 +2×성장치로 반영 (HP = base + lv×growth 이므로 등가)
  //  - 기능 변화만 존재: 원거리 계열 사거리 확장, 풍수사 계열 이동 +1, 문관 상위 책략 해금.
  //    기병·보병 1→2차는 원작대로 수치 무변화(보너스 HP/MP만).
  // 명칭은 원작 2차명(영웅/중기병/중보병/노병/참모/방술사). id는 세이브 호환을 위해 유지.
  chancellor: {
    id: 'chancellor',
    lineage: 'lord',
    name: '영웅',
    tier: 2,
    category: 'lord',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'A', mind: 'A', agi: 'B', morale: 'S' },
    hpBase: 134, // 120 + 7×2
    hpGrowth: 7,
    mpBase: 24, // 20 + 2×2
    mpGrowth: 2,
    strategies: [
      { strategyId: 'goyang', learnLevel: 1 },
      { strategyId: 'seonpung', learnLevel: 8 },
    ],
  },
  heavyCavalry: {
    id: 'heavyCavalry',
    lineage: 'lightCavalry',
    name: '중기병',
    tier: 2,
    category: 'cavalry',
    mounted: true,
    ranged: false,
    move: 6, // 원작: 기병 1→2차 이동력 불변 (경기병 6 → 중기병 6)
    minRange: 1,
    maxRange: 1,
    moveProfile: 'horse',
    growth: { atk: 'A', def: 'B', mind: 'C', agi: 'A', morale: 'B' },
    hpBase: 122, // 110 + 6×2
    hpGrowth: 6,
    mpBase: 12, // 10 + 1×2
    mpGrowth: 1,
    strategies: [],
  },
  guardInfantry: {
    id: 'guardInfantry',
    lineage: 'heavyInfantry',
    name: '중보병',
    tier: 2,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'foot',
    growth: { atk: 'B', def: 'S', mind: 'C', agi: 'C', morale: 'B' },
    hpBase: 144, // 130 + 7×2
    hpGrowth: 7,
    mpBase: 12, // 10 + 1×2
    mpGrowth: 1,
    strategies: [],
  },
  crossbowman: {
    id: 'crossbowman',
    lineage: 'archer',
    name: '노병',
    tier: 2,
    category: 'archer',
    mounted: false,
    ranged: true,
    move: 4,
    minRange: 2,
    maxRange: 3, // 원작: 원거리 계열은 승급마다 사거리 확장 (궁병 ニ → 노병 ト)
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'C', mind: 'B', agi: 'B', morale: 'C' },
    hpBase: 110, // 100 + 5×2
    hpGrowth: 5,
    mpBase: 12, // 10 + 1×2
    mpGrowth: 1,
    strategies: [],
  },
  counselor: {
    id: 'counselor',
    lineage: 'strategist',
    name: '참모',
    tier: 2,
    category: 'strategist',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'C', mind: 'S', agi: 'B', morale: 'B' },
    hpBase: 98, // 90 + 4×2
    hpGrowth: 4,
    mpBase: 36, // 30 + 3×2
    mpGrowth: 3,
    strategies: [
      { strategyId: 'choyeol', learnLevel: 1 },
      { strategyId: 'seonpung', learnLevel: 3 },
      { strategyId: 'dunbyeong', learnLevel: 5 },
      { strategyId: 'hwajin', learnLevel: 8 },
      { strategyId: 'pungjin', learnLevel: 10 }, // 풍계 ㅁ자(3×3) — 습득 레벨은 설계값
      { strategyId: 'eophwa', learnLevel: 12 },
      { strategyId: 'heobo', learnLevel: 14 }, // 1차 전승 (책사와 같은 learnLevel — promotion 계약)
      { strategyId: 'hwaryong', learnLevel: 15 }, // 승급 해금 — "한층 더 강력해진 공격계 책략"
      { strategyId: 'bongchaek', learnLevel: 16 }, // 승급 해금 — 방해(금책) [설계값]
    ],
  },
  seniorGeomancer: {
    id: 'seniorGeomancer',
    lineage: 'geomancer',
    name: '방술사',
    tier: 2,
    category: 'support',
    mounted: false,
    ranged: false,
    move: 5, // 원작: 풍수사 계열만 2차에서 이동 +1 ("이동력이 올라가서 더 많은 아군을 지원")
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'C', mind: 'A', agi: 'B', morale: 'A' },
    hpBase: 98, // 90 + 4×2
    hpGrowth: 4,
    mpBase: 36, // 30 + 3×2
    mpGrowth: 3,
    strategies: [
      { strategyId: 'sobogeup', learnLevel: 1 },
      { strategyId: 'goyang', learnLevel: 3 },
      { strategyId: 'yeonbyeong', learnLevel: 6 },
      { strategyId: 'pobak', learnLevel: 14 }, // 1차 전승 (풍수사와 같은 learnLevel — promotion 계약)
      { strategyId: 'guwondae', learnLevel: 15 }, // 승급 해금 — 광역 회복
      { strategyId: 'dogyeon', learnLevel: 16 }, // 승급 해금 — 방해(독) [설계값]
    ],
  },

  // ==========================================================================
  // v1.3: STEP 5 — 원작 13개 아군 계열(궁기병·포차·무도가·적병·무희·기마책사·도사)
  //       + 황제 추가로 원작 13계열 전무를 갖춘다.
  // 근거: docs/research/classes.md §1~3. 성장등급·HP/MP·이동·사거리는 classes.md §1/§2 값.
  // 3차 병과명(권성/무녀/벽력차/기마군사/요술사 등)은 tier-3(Lv30) 확장 시 일괄 적용 —
  // 여기서는 1차→2차 깊이(기존 6계열과 동일 패턴)만 추가.
  // --------------------------------------------------------------------------

  // 궁기병계 — 활+기병. 성장 S/B/B/B/A, 기동 6 (classes.md §2)
  mountedArcher: {
    id: 'mountedArcher',
    lineage: 'mountedArcher',
    promotesTo: 'crossbowRider',
    name: '궁기병',
    tier: 1,
    category: 'archer',
    mounted: true,
    ranged: true,
    move: 6,
    minRange: 2,
    maxRange: 2, // 원작 궁기병 6-ハ(직선2)→맨해튼2 근사
    moveProfile: 'horse',
    growth: { atk: 'S', def: 'B', mind: 'B', agi: 'B', morale: 'A' },
    hpBase: 100,
    hpGrowth: 5,
    mpBase: 10,
    mpGrowth: 1,
    strategies: [],
  },
  crossbowRider: {
    id: 'crossbowRider',
    lineage: 'mountedArcher',
    name: '노기병',
    tier: 2,
    category: 'archer',
    mounted: true,
    ranged: true,
    move: 6,
    minRange: 2,
    maxRange: 3, // 원작 노기병 6-ニ→맨해튼2..3
    moveProfile: 'horse',
    growth: { atk: 'S', def: 'B', mind: 'B', agi: 'B', morale: 'A' },
    hpBase: 110, // 100 + 5×2
    hpGrowth: 5,
    mpBase: 12, // 10 + 1×2
    mpGrowth: 1,
    strategies: [],
  },

  // 포차계 — 전 병과 최장 사거리 간접(광역), 이동 좁음. wheel (classes.md §3)
  catapult: {
    id: 'catapult',
    lineage: 'catapult',
    promotesTo: 'heavyCatapult',
    name: '경포차',
    tier: 1,
    category: 'archer',
    mounted: false,
    ranged: true,
    move: 3,
    minRange: 3,
    maxRange: 5, // 원작 전 병과 최장 사거리 [설계값 — 정확 칸수 미확보]
    moveProfile: 'wheel',
    growth: { atk: 'S', def: 'B', mind: 'A', agi: 'C', morale: 'A' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 10,
    mpGrowth: 1,
    strategies: [],
  },
  heavyCatapult: {
    id: 'heavyCatapult',
    lineage: 'catapult',
    name: '중포차',
    tier: 2,
    category: 'archer',
    mounted: false,
    ranged: true,
    splash: true, // 2차부터 포차 광역 — 대상 인접(8방) 적 반감 피해 (classes.md §4.2)
    move: 3, // 원작 포차 3→3(2차 무변화)→4(3차 +1)
    minRange: 3,
    maxRange: 5,
    moveProfile: 'wheel',
    growth: { atk: 'S', def: 'B', mind: 'A', agi: 'C', morale: 'A' },
    hpBase: 98, // 90 + 4×2
    hpGrowth: 4,
    mpBase: 12, // 10 + 1×2
    mpGrowth: 1,
    strategies: [],
  },

  // 무도가계 — 곤봉, 순발 S(연속공격/회피), 수상 적성↑, 8방 공격 (classes.md §3)
  martialArtist: {
    id: 'martialArtist',
    lineage: 'martialArtist',
    promotesTo: 'boxer',
    name: '무도가',
    tier: 1,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev', // 8방(ロ)
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'C', mind: 'A', agi: 'S', morale: 'B' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 20,
    mpGrowth: 1,
    strategies: [],
  },
  boxer: {
    id: 'boxer',
    lineage: 'martialArtist',
    name: '권법가',
    tier: 2,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev',
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'C', mind: 'A', agi: 'S', morale: 'B' },
    hpBase: 98, // 90 + 4×2
    hpGrowth: 4,
    mpBase: 22, // 20 + 1×2
    mpGrowth: 1,
    strategies: [],
  },

  // 적병계 — 검, 공S·사기S, 숲/산악 적성↑, 지계 책략, 8방 (classes.md §3)
  bandit: {
    id: 'bandit',
    lineage: 'bandit',
    promotesTo: 'righteousBandit',
    name: '적병',
    tier: 1,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev', // 8방(ロ)
    moveProfile: 'foot',
    growth: { atk: 'S', def: 'C', mind: 'B', agi: 'B', morale: 'S' },
    hpBase: 100,
    hpGrowth: 5,
    mpBase: 20,
    mpGrowth: 1,
    strategies: [],
  },
  righteousBandit: {
    id: 'righteousBandit',
    lineage: 'bandit',
    name: '의적',
    tier: 2,
    category: 'infantry',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev',
    moveProfile: 'foot',
    growth: { atk: 'S', def: 'C', mind: 'B', agi: 'B', morale: 'S' },
    hpBase: 110, // 100 + 5×2
    hpGrowth: 5,
    mpBase: 22, // 20 + 1×2
    mpGrowth: 1,
    strategies: [],
  },

  // 무희계 — 곤봉, 순발 S, HP 낮음, 상태이상 아군 회복 패시브 (classes.md §3)
  dancer: {
    id: 'dancer',
    lineage: 'dancer',
    promotesTo: 'primaDancer',
    name: '무희',
    tier: 1,
    category: 'support',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev', // 8방(ロ)
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'B', mind: 'B', agi: 'S', morale: 'B' },
    hpBase: 90,
    hpGrowth: 3, // HP 낮음 (classes.md §2: +3)
    mpBase: 35,
    mpGrowth: 1,
    strategies: [],
  },
  primaDancer: {
    id: 'primaDancer',
    lineage: 'dancer',
    name: '무희(舞姬)',
    tier: 2,
    category: 'support',
    mounted: false,
    ranged: false,
    move: 5,
    minRange: 1,
    maxRange: 1,
    attackShape: 'chebyshev',
    moveProfile: 'foot',
    growth: { atk: 'A', def: 'B', mind: 'B', agi: 'S', morale: 'B' },
    hpBase: 96, // 90 + 3×2
    hpGrowth: 3,
    mpBase: 37, // 35 + 1×2
    mpGrowth: 1,
    strategies: [],
  },

  // 기마책사계 — 부채, 기동 문관 (classes.md §3)
  cavalryStrategist: {
    id: 'cavalryStrategist',
    lineage: 'cavalryStrategist',
    promotesTo: 'cavalryCounselor',
    name: '기마책사',
    tier: 1,
    category: 'strategist',
    mounted: true,
    ranged: false,
    move: 6,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'horse',
    growth: { atk: 'C', def: 'S', mind: 'C', agi: 'B', morale: 'B' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 40,
    mpGrowth: 2,
    strategies: [
      { strategyId: 'seonpung', learnLevel: 1 },
      { strategyId: 'dunbyeong', learnLevel: 5 },
      { strategyId: 'hwajin', learnLevel: 9 },
    ],
  },
  cavalryCounselor: {
    id: 'cavalryCounselor',
    lineage: 'cavalryStrategist',
    name: '기마참모',
    tier: 2,
    category: 'strategist',
    mounted: true,
    ranged: false,
    move: 6,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'horse',
    growth: { atk: 'C', def: 'S', mind: 'C', agi: 'B', morale: 'B' },
    hpBase: 98, // 90 + 4×2
    hpGrowth: 4,
    mpBase: 44, // 40 + 2×2
    mpGrowth: 2,
    strategies: [
      { strategyId: 'seonpung', learnLevel: 1 },
      { strategyId: 'dunbyeong', learnLevel: 5 },
      { strategyId: 'hwajin', learnLevel: 9 },
    ],
  },

  // 도사계 — 보검(검), 정신 S 문관, 화·독계 책략 특화, 4-이 (classes.md §1/§2)
  // 성장등급: 공C · 정신S · 방B · 순A · 사기B → growth { atk:C, mind:S, def:B, agi:A, morale:B }
  taoist: {
    id: 'taoist',
    lineage: 'taoist',
    promotesTo: 'illusionist',
    name: '도사',
    tier: 1,
    category: 'strategist',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'B', mind: 'S', agi: 'A', morale: 'B' },
    hpBase: 80, // 80~227(+3) (classes.md §2)
    hpGrowth: 3,
    mpBase: 40, // 40~138(+2) (classes.md §2)
    mpGrowth: 2,
    strategies: [
      { strategyId: 'choyeol', learnLevel: 1 },
      { strategyId: 'pungjin', learnLevel: 5 },
      { strategyId: 'eophwa', learnLevel: 9 },
      { strategyId: 'heobo', learnLevel: 12 }, // 방해(혼란) [설계값]
    ],
  },
  illusionist: {
    id: 'illusionist',
    lineage: 'taoist',
    name: '환술사',
    tier: 2,
    category: 'strategist',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 1,
    maxRange: 1,
    moveProfile: 'mage',
    growth: { atk: 'C', def: 'B', mind: 'S', agi: 'A', morale: 'B' },
    hpBase: 86, // 80 + 3×2
    hpGrowth: 3,
    mpBase: 44, // 40 + 2×2
    mpGrowth: 2,
    strategies: [
      { strategyId: 'choyeol', learnLevel: 1 },
      { strategyId: 'pungjin', learnLevel: 5 },
      { strategyId: 'eophwa', learnLevel: 9 },
      { strategyId: 'heobo', learnLevel: 12 }, // 1차 전승
      { strategyId: 'hwaryong', learnLevel: 15 }, // 승급 해금 — 화계 특화 "한층 더 강력해진 공격계 책략"
      { strategyId: 'dogyeon', learnLevel: 16 }, // 승급 해금 — 방해(독) [설계값]
    ],
  },

  // 황제 — 비무장 호송 유닛. 공격 불가(범위 0·1), 승급 없음 (classes.md §3)
  emperor: {
    id: 'emperor',
    lineage: 'emperor',
    name: '황제',
    tier: 1,
    category: 'lord',
    mounted: false,
    ranged: false,
    move: 4,
    minRange: 0,
    maxRange: 0, // 공격 불가
    moveProfile: 'foot',
    growth: { atk: 'C', def: 'B', mind: 'A', agi: 'B', morale: 'S' },
    hpBase: 90,
    hpGrowth: 4,
    mpBase: 20,
    mpGrowth: 1,
    strategies: [],
  },
}
