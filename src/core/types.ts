// 코어 타입 정의 — 조조전(1998) 시스템 기준 (docs/research/caocao.md)
// 이 폴더(core/)는 React 등 렌더러 의존성 금지. 순수 TS만.

export interface Vec2 {
  x: number
  y: number
}

export type Faction = 'player' | 'enemy' | 'ally'

// ---------- 지형 ----------

export type TerrainId =
  | 'plain' // 평지
  | 'grass' // 초원
  | 'forest' // 숲
  | 'mountain' // 산지
  | 'wasteland' // 황무지
  | 'river' // 강 (진입 불가)
  | 'bridge' // 다리
  | 'fort' // 성채 (매턴 회복)
  | 'village' // 마을 (매턴 회복)
  | 'castle' // 성내
  | 'wall' // 성벽 (진입 불가)
  | 'gate' // 성문

// 병과별 이동/지형효과 프로필. 조조전: 지형효과는 물리 공방에만 적용(%).
export type MoveProfileId = 'foot' | 'horse' | 'wheel' | 'mage'

export interface TerrainDef {
  id: TerrainId
  name: string
  // 이동 코스트 (null = 진입 불가)
  cost: Record<MoveProfileId, number | null>
  // 물리 지형효과 % — 이 지형에 서 있는 유닛의 공격력/방어력에 곱해짐 (100 = 보정 없음)
  effect: Record<MoveProfileId, number>
  healPerTurn?: number // 성채/마을: 매턴 최대 HP 대비 회복 %
}

// ---------- 장수 / 병과 ----------

// 장수 5능력치 (원작은 모두 짝수, 부대 초기치 = ÷2)
export interface OfficerStats {
  str: number // 무력 → 공격력
  ldr: number // 통솔 → 방어력
  int: number // 지력 → 정신력
  agi: number // 민첩 → 순발력
  luck: number // 운 → 사기
}

export interface OfficerDef {
  id: string
  name: string
  stats: OfficerStats
  classId: string
  level: number
}

// 성장 등급: 레벨당 성장치. S=+5, A=+4, B=+3, C=+2
// (근거: "B등급 순발 +3/레벨", "만렙50 기준 S는 B보다 100, A는 B보다 50 높음")
export type GrowthGrade = 'S' | 'A' | 'B' | 'C'

export interface GrowthGrades {
  atk: GrowthGrade
  def: GrowthGrade
  mind: GrowthGrade
  agi: GrowthGrade
  morale: GrowthGrade
}

// 상성 삼각형: 기병 > 보병 > 궁병 > 기병
// 조조전 실구현은 2가지 배율뿐이며 나머지는 스탯으로 창발:
//  - 보병 → 기병(mounted) 공격: 딜 50% 감소
//  - 원거리(ranged) → 기병(mounted): +50% 추가 피해
export type ClassCategory = 'lord' | 'cavalry' | 'infantry' | 'archer' | 'strategist' | 'support'

export interface UnitClassDef {
  id: string
  name: string
  tier: 1 | 2 | 3
  category: ClassCategory
  mounted: boolean // 기병계 여부 (원거리 추가피해 대상)
  ranged: boolean // 간접 공격 병과 (반격 안 받음/안 함)
  move: number
  minRange: number // 궁병류 = 2 (인접 공격 불가)
  maxRange: number
  moveProfile: MoveProfileId
  growth: GrowthGrades
  hpBase: number
  hpGrowth: number // 레벨당
  mpBase: number
  mpGrowth: number
  strategies: { strategyId: string; learnLevel: number }[]
  promotesTo?: string // 인수 사용 시 (Lv15↑ 2차, Lv30↑ 3차)
}

// ---------- 책략 ----------

export type StrategyElement = 'fire' | 'water' | 'wind' | 'earth' | 'holy' | 'none'

export type StrategyKind = 'damage' | 'heal' | 'buff' | 'debuff'

export type BuffStat = 'atk' | 'def' | 'mind' | 'agi' | 'morale'

export interface StrategyDef {
  id: string
  name: string
  kind: StrategyKind
  element: StrategyElement
  mpCost: number
  range: number // 사거리 (Infinity 허용: 모래폭풍)
  area: 'single' | 'cross' // 단일 / 십자(대상+상하좌우)
  power?: number // 위력 계수 % (주작=100 기준) — damage 전용
  healAmount?: number // heal 전용 (고정량)
  buff?: { stat: BuffStat; amount: number; duration: number } // buff/debuff 전용
  capHitRate: number // 한계 명중률 % (100/90/80/60/50/33). buff/heal은 100
  targets: 'enemy' | 'ally' | 'self'
}

// ---------- 상태이상 ----------

export type StatusId = 'poison' | 'seal' | 'confusion' | 'immobile' | 'charm'

export interface StatusEffect {
  id: StatusId
}

export interface StatBuff {
  stat: BuffStat
  amount: number // 음수 = 디버프
  remainingTurns: number
}

// ---------- 전투 상태 ----------

export interface UnitState {
  id: string
  officerId: string
  classId: string
  faction: Faction
  pos: Vec2
  level: number
  exp: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  acted: boolean // 이번 페이즈 행동 완료 여부
  statuses: StatusEffect[]
  buffs: StatBuff[]
  isLeader?: boolean // 주인공: 격파당하면 패배
  isBoss?: boolean // 격파 시 승리 조건 대상
  behavior?: 'guard' | 'pursue' // AI: guard = 사거리 진입 전 대기
}

export type Weather = 'clear' | 'rain'

export interface MapDef {
  width: number
  height: number
  tiles: TerrainId[][] // [y][x]
}

export type VictoryCondition =
  | { type: 'annihilation' } // 적 전멸
  | { type: 'defeatBoss' } // isBoss 유닛 전부 격파
  | { type: 'reachPoint'; pos: Vec2; unitId?: string } // 지점 도달 (기본: 주인공)
  | { type: 'surviveTurns'; turns: number } // N턴 버티기

export interface ReinforcementDef {
  trigger:
    | { type: 'turnStart'; turn: number }
    | { type: 'unitDefeated'; unitId: string }
  units: StageUnitDef[]
}

export interface StageUnitDef {
  officerId: string
  faction: Faction
  pos: Vec2
  level?: number // 생략 시 장수 기본 레벨
  isLeader?: boolean
  isBoss?: boolean
  behavior?: 'guard' | 'pursue'
}

export interface StageDef {
  id: string
  name: string
  map: MapDef
  units: StageUnitDef[]
  victory: VictoryCondition[]
  reinforcements: ReinforcementDef[]
  weather: Weather
  bonusExp?: number // 2차 승리조건 달성 시 생존 전원 보너스 (시리즈 전통 +50)
}

export type BattleResult = 'ongoing' | 'victory' | 'defeat'

export interface LogEvent {
  type: string
  message: string
}

export interface BattleState {
  stageId: string
  map: MapDef
  units: UnitState[]
  turn: number // 1부터
  phase: Faction // 현재 행동 진영 (player → enemy → 턴 증가)
  weather: Weather
  rngState: number
  result: BattleResult
  log: LogEvent[]
  spawnedReinforcements: number[] // 이미 발동한 증원 인덱스
}

// ---------- 액션 ----------

export type BattleAction =
  | { type: 'move'; unitId: string; to: Vec2 }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'strategy'; unitId: string; strategyId: string; target: Vec2 }
  | { type: 'wait'; unitId: string }
  | { type: 'endPhase' }

// ---------- 상수 ----------

export const MAX_LEVEL = 50
export const EXP_PER_LEVEL = 100 // 전 구간 고정 (조조전 원작 사양)
export const CRIT_MULTIPLIER = 1.5
export const PROMOTION_LEVELS = { tier2: 15, tier3: 30 } as const
