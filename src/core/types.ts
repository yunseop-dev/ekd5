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
  | 'gate' // 성문 (열림 — 통행 가능)
  | 'gateClosed' // 닫힌 성문 (진입 불가) — 이벤트 setTile로 'gate'로 열린다 (v1.1)
  | 'ford' // 여울/늪 — 기병 성능 80% (원작 확정), 차량 진입 불가 (v1.2)

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

// 공격범위 모양 — 기본은 맨해튼(거리합, 상하좌우). 체비쇼프(8방)는 보병/무도가/무희/적병의 원작
// 「ロ」 범위를 위해 v1.3에서 추가 (docs/research/classes.md §4.1). undefined = 'manhattan'.
export type AttackShape = 'manhattan' | 'chebyshev'

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
  /**
   * 합류 시 장착하고 있는 장비 (원작: 조조 = 의천검, campaign-ux.md §7.2).
   * 정의는 슬롯 → 장비 id로 간결하게 쓰고, 인스턴스화(Lv1)는 생성 시점(createBattle/newCampaign)에 한다.
   */
  initialEquipment?: EquipmentIdMap
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
  /**
   * 계열 루트 = 이 병과가 속한 1차 병과 id (1차 병과는 자기 자신).
   * 승급해도 장비 착용 규칙은 계열 단위로 유지된다 — 중기병도 창을 쓴다 (equipment.md §5).
   */
  lineage: string
  mounted: boolean // 기병계 여부 (원거리 추가피해 대상)
  ranged: boolean // 간접 공격 병과 (반격 안 받음/안 함)
  move: number
  minRange: number // 궁병류 = 2 (인접 공격 불가)
  maxRange: number
  /** 공격범위 모양 — 기본(undefined)은 맨해튼. 'chebyshev' = 8방(보병/무도가/무희/적병 등). */
  attackShape?: AttackShape
  /** 포차 광역 — 본타가 명중하면 대상 인접(8방) 적에게 반감 광역 피해. 2차 중포차부터 (classes.md §4.2). */
  splash?: boolean
  moveProfile: MoveProfileId
  growth: GrowthGrades
  hpBase: number
  hpGrowth: number // 레벨당
  mpBase: number
  mpGrowth: number
  strategies: { strategyId: string; learnLevel: number }[]
  promotesTo?: string // 인수 사용 시 (Lv15↑ 2차, Lv30↑ 3차)
}

// ---------- 장비 / 보물 ----------

// 조조전 장비 슬롯 3개: 무기 / 방어구(갑옷·옷) / 보조구(방패·기마·서적) (docs/research/caocao.md §6).
// v0.6부터 무구성장(장비 자체가 사용으로 레벨업 — 일반 Lv3/보물 Lv9)을 구현한다 (equipment.md §1~2).
export type EquipSlot = 'weapon' | 'armor' | 'accessory'

export interface EquipmentDef {
  id: string
  name: string
  slot: EquipSlot
  /** 부대 능력치 가산 (effectiveStats에 합산) */
  bonus: Partial<Record<'atk' | 'def' | 'mind' | 'agi' | 'morale', number>>
  moveBonus?: number // 이동력 가산 (준마)
  expMultiplier?: number // 획득 경험치 배율 (맹덕신서 1.5)
  mpRegenPerTurn?: number // 매턴 페이즈 시작 시 MP 회복 (태평요술서 = 10, 원작 확정)
  allTerrainCost1?: boolean // 진입 가능 전 지형 소비 이동력 1 (적로, 원작 확정)
  // ---- v1.3 장비 특수효과 (kr-blog §R5) ----
  /** 최대 HP 가산 (투구 계열 — 가죽+15/구리+30, 원작 확정) */
  maxHpBonus?: number
  /** 최대 MP 가산 (복건/관건/칠흑도복 — +15/+30/+20, 원작 확정) */
  maxMpBonus?: number
  /** 매턴 페이즈 시작 시 최대 HP 대비 n% 회복 (봉황깃옷 20%, 원작 확정) */
  hpRegenPercent?: number
  /** 회심의 일격을 무조건 회피 (황금갑옷, 원작 확정) */
  critImmune?: boolean
  /** 연속공격 2번째 타격만 회피 (연환갑옷, 원작 확정) */
  secondHitEvade?: boolean
  /** 책략 피해 배율 (1=보통, 0.5=반감 — 백은갑옷, 원작 확정) */
  strategyDamageScale?: number
  /** 원거리(ranged) 공격 피해 배율 (기마갑옷·가죽 0.7/구리 0.5, 원작 확정) */
  rangedDamageScale?: number
  /** 물리 명중 보정 (무명장갑 +10 — 퍼센트포인트, 원작 확정) */
  hitBonus?: number
  /** 물리 회피 보정 (방패 — 가죽+10/구리+15 — 퍼센트포인트, 원작 확정) */
  evadeBonus?: number
  // ----
  /** 착용 가능 병과 id 목록. undefined = 전 병과 (원작 병과 1:1 무기 규칙, equipment.md §5) */
  classes?: string[]
  price: number | null // null = 비매품(보물)
  tier: 1 | 2 | 3 // 상점 해금 단계 (아군 평균 레벨 연동, campaign-ux.md 1부 §3)
  isTreasure?: boolean // 보물 — 판매 불가 (원작: 영걸전은 가능, 조조전은 불가)
  /** 무구성장으로 오르는 능력치. undefined = 성장하지 않는 장비(보조구류) */
  growthStat?: 'atk' | 'def' | 'mind'
  /** 사모 — 명중 시 대상 뒤편(공격자 반대쪽) 1칸의 적도 함께 타격 (원작 확정, v1.2) */
  pierceBack?: boolean
  /** 여포궁 등 — 명중 시 상태이상 확정 부여 (원작: 보물은 100% 부여, v1.2) */
  onHitStatus?: StatusId
  /** 몰우전 — 근접 병과에 원거리 공격을 부여 (원작 확정. v1.3 엔진 반영 — effectiveAttackRanges) */
  rangedAttack?: boolean
  description: string
}

/**
 * 장비 1점의 실체 — 같은 종류라도 개체마다 레벨/경험치가 다르다 (원작 무구성장).
 * level은 1부터. 실효 보정치 = def.bonus + growthStat에 (level-1) × 성장량.
 */
export interface EquipInstance {
  itemId: string
  level: number
  exp: number
}

// ---------- 도구 (전투 중 소모품) ----------

/** 도구 정의 — 회복·MP·상태해제·승급(인수) 등 전투 중 1회성 효과. 수치는 docs/research/items.md 기준 */
export interface ConsumableDef {
  id: string
  name: string
  desc: string
  price: number | null // 상점 가격 (null = 비매품)
  range: number // 체비쇼프 거리 (1 = 자기 + 인접 8방) — 원작 도구 게이트 (items.md §1)
  effect:
    | { kind: 'heal'; amount: number }
    | { kind: 'mpRestore'; amount: number }
    // 상태이상 해제 — 'all'은 전부 해제(만능약). 원작 해제약 4종 + 만능약
    | { kind: 'cureStatus'; statuses: StatusId[] | 'all' }
    | { kind: 'promotion' } // 인수 — 즉시 승급 + HP/MP 완전회복 (원작)
}

/** 도구 보유 스택 — 소모품은 인스턴스 상태가 없어 수량으로만 관리한다 */
export interface ConsumableStack {
  itemId: string
  count: number
}

/** 슬롯 → 장비 인스턴스. 비어 있는 슬롯은 키 자체가 없다 (런타임/세이브 표현) */
export type EquipmentMap = Partial<Record<EquipSlot, EquipInstance>>

/** 슬롯 → 장비 id. 데이터 정의(장수 초기 장비/스테이지 적 장비)용 간결 표기 */
export type EquipmentIdMap = Partial<Record<EquipSlot, string>>

/** 정의 표기와 인스턴스를 모두 허용하는 입력 — createBattle이 인스턴스로 정규화한다 */
export type EquipmentInput = Partial<Record<EquipSlot, string | EquipInstance>>

// ---------- 능력치 열매 (원작: 3단계 장비를 Lv3에 판매 → 열매, equipment.md §1) ----------

export interface FruitDef {
  id: string
  name: string
  /** 올려주는 장수 능력치. 'exp' = 경험의 열매(경험치 획득) */
  stat: 'str' | 'ldr' | 'int' | 'agi' | 'luck' | 'exp'
  description: string
}

// ---------- 책략 ----------

export type StrategyElement = 'fire' | 'water' | 'wind' | 'earth' | 'holy' | 'none'

export type StrategyKind = 'damage' | 'heal' | 'buff' | 'debuff' | 'status'

export type BuffStat = 'atk' | 'def' | 'mind' | 'agi' | 'morale'

/** 책략 영향 범위 — single 1칸 / cross 십자 5칸 / square ㅁ자 3×3 */
export type StrategyArea = 'single' | 'cross' | 'square'

export interface StrategyDef {
  id: string
  name: string
  kind: StrategyKind
  element: StrategyElement
  mpCost: number
  range: number // 사거리 (Infinity 허용: 모래폭풍)
  area: StrategyArea
  power?: number // 위력 계수 % (주작=100 기준) — damage 전용
  /**
   * heal 전용 — 원작 회복량은 고정이 아니라 **base + floor(시전자 정신력 / mindDiv)** 다
   * (소보급 40+정신/10, 대보급 70+정신/2 — docs/research/items.md §3).
   */
  heal?: { base: number; mindDiv: number }
  buff?: { stat: BuffStat; amount: number; duration: number } // buff/debuff 전용
  /** status 전용 — 부여하는 상태이상. 지속턴은 없다 (원작: 매턴 운÷2% 자연 해제뿐) */
  inflicts?: StatusId
  /**
   * 화계 전용 (v1.2) — 영향 범위의 연소 가능 지형에 불길을 남긴다 (원작: 화공 후 화염 타일 잔존).
   * 십자 범위 화계(화진·화룡)만 보유 [설계값].
   */
  hazard?: { duration: number }
  capHitRate: number // 한계 명중률 % (100/90/80/60/50/33). buff/heal은 100
  targets: 'enemy' | 'ally' | 'self'
}

// ---------- 상태이상 ----------

// 원작은 정확히 4종 (비트필드 0x02 부동/0x04 금책/0x08 혼란/0x10 독).
// '매혹'은 조조전 Online 오염으로 판명되어 제거했다 (docs/research/statuses.md §1)
export type StatusId = 'poison' | 'seal' | 'confusion' | 'immobile'

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
  moved: boolean // 이번 페이즈 이동 완료 여부
  acted: boolean // 이번 페이즈 행동(공격/책략/대기) 완료 여부
  statuses: StatusEffect[]
  buffs: StatBuff[]
  /** 장착 장비 인스턴스 — 캠페인 로스터에서 복사됨. 비캠페인 전투는 빈 객체 */
  equipment: EquipmentMap
  /** 열매로 영구 상승한 장수 능력치 보정 (effectiveStats에서 officer.stats에 합산) */
  statBonus?: Partial<OfficerStats>
  isLeader?: boolean // 주인공: 격파당하면 패배
  isBoss?: boolean // 격파 시 승리 조건 대상
  behavior?: 'guard' | 'pursue' // AI: guard = 사거리 진입 전 대기
}

export type Weather = 'clear' | 'rain'

// ---------- 대사 / 스토리 ----------

// 조조전 스토리 노드 = 이동 없는 회의장 + 장수 얼굴 그래픽 + 대사 (campaign-ux.md 1부 §5).
// 화자는 장수 id로만 들고, 이름/초상 해석은 표시 계층에 맡긴다.
export interface DialogueLine {
  speaker: string | null // OFFICERS 키. null = 내레이션
  text: string
}

/** 전장 위험 지대 (v1.2) — 화계가 남긴 불길. 진입·통과 불가이며 매 턴 사그라든다 */
export type HazardKind = 'fire'

export interface Hazard {
  pos: Vec2
  kind: HazardKind
  remainingTurns: number
}

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

/**
 * 패배 조건 (v1.2) — 주인공(조조) 격파는 전 전투 공통이라 계약 밖 암묵 기본이다.
 * 원작은 전투마다 "20턴을 넘긴다"(표준)·"헌제의 사망" 같은 조건을 데이터로 갖는다.
 * unitDies는 **hp 0 사체가 남아 있을 때만** 발동 — removeUnits·duel retreat로 전장을 떠난
 * 유닛은 발동시키지 않는다 (원작 서주 구원전의 "미축 배신으로 실제로는 지지 않는" 페이크 재현).
 */
export type DefeatCondition =
  | { type: 'turnLimit'; turns: number } // turn > turns 이면 패배
  | { type: 'unitDies'; officerId: string } // 호위 대상 사망 (헌제 등)

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
  /** 적/우군 장비 (아군은 캠페인 로스터가 우선). 생략 시 장수 initialEquipment */
  equipment?: EquipmentInput
  isLeader?: boolean
  isBoss?: boolean
  behavior?: 'guard' | 'pursue'
}

// ---------- 전투 내 이벤트 (v1.1) ----------
// 원작 조조전의 전투 연출을 데이터로 표현한다: 전투 전 전략 선택(청주 3책), 전투 중 대사,
// 인접 시 일기토/설전(전투별 고정 쌍 — 랜덤 아님), 지점 도달 이벤트(성문 개방·여포 기동),
// 대화 후 버프, 우군 생존 보상. 근거: campaign-ux.md §63, caocao.md §8, statuses.md §4.
//
// 유닛 참조는 전부 officerId — 제약: 이벤트가 참조하는 officerId는 스테이지 안에서 유일해야
// 한다 (westInfantry 같은 몹 재사용 금지 — validateStage가 잡는다).

export type EventTrigger =
  | { type: 'battleStart' }
  | { type: 'turnStart'; turn: number } // 턴 증가 직후 (아군 페이즈 시작)
  | { type: 'unitDefeated'; officerId: string }
  | { type: 'unitsMeet'; a: string; b: string } // 체비쇼프 거리 1 (인접 8방) — 일기토/설전/조우
  | { type: 'reachArea'; area: Vec2[]; faction: Faction; count?: number } // 지정 칸 위 생존 유닛 ≥ count(기본 1)
  // v1.3 — 승리 확정 직후 발화 (원작 "승리 후 전리품/대사", kr-blog §R3). 전투당 1회.
  | { type: 'victory' }

export type EventAction =
  | { type: 'dialogue'; lines: DialogueLine[] }
  | {
      type: 'choice'
      prompt: string
      speaker: string | null
      options: { text: string; actions: EventAction[] }[] // 중첩 choice 금지 (validateStage)
    }
  | {
      type: 'duel' // 일기토/설전 — 결과는 데이터 고정 (원작: 랜덤 아님). 승자가 아군이면 일반 격파 경험치
      a: string
      b: string
      lines: DialogueLine[]
      outcome: { winner: 'a' | 'b'; loserFate: 'die' | 'retreat' } | { draw: true }
    }
  | { type: 'buff'; target: string | 'playerAll'; stat: BuffStat; amount: number; duration: number }
  | { type: 'spawnUnits'; units: StageUnitDef[] } // 증원과 동일 시맨틱 (자리 막히면 개별 취소)
  | { type: 'removeUnits'; officerIds: string[] } // 조용한 이탈 — 격파 로그/경험치/승패 트리거 없음
  // 스크립트 상태이상 부여 — **명중 판정 없이 확정**(원작: 순유안 "적 4부대 혼란", c02 여포 격파 → 관외 부대 혼란).
  // removeUnits처럼 몹 일괄 지정이 정상 용례라 officerId 유일성을 강제하지 않는다.
  | { type: 'inflictStatus'; officerIds: string[]; status: StatusId }
  // officerIds 생략 = 생존 적 전원 (원작: 퇴각 선택 후 적 전체가 주인공을 추격)
  | { type: 'setBehavior'; officerIds?: string[]; behavior: 'guard' | 'pursue' }
  | { type: 'setTile'; cells: Vec2[]; terrain: TerrainId } // 성문 개방/폐쇄
  | { type: 'levelUpEnemies'; amount: number; officerIds?: string[] } // 생략 = 생존 적 전원. HP/MP 재계산·완전회복
  // 표시형(v1.2) — 「{아이템}을(를) 손에 넣었습니다!」 모달을 띄우고 eventContinue 소비 시 적재된다
  | { type: 'giveItem'; itemId: string; kind: 'equipment' | 'consumable' }
  | { type: 'giveGold'; amount: number } // 즉시형 — pendingGold 적재 → 승리 시 합산 (부호 추방 금 3000)
  // 승리/패배 조건 런타임 교체 (원작: 퇴각 선택 → 승리조건 변경, 원술전 → 12턴 상한)
  | { type: 'setVictory'; victory: VictoryCondition[] }
  | { type: 'setDefeat'; defeat: DefeatCondition[] }
  | { type: 'setHazard'; cells: Vec2[]; kind: HazardKind; duration: number } // 스크립트 발화 (완성 화염 방어진)
  // 맵 드랍 — pos 또는 officerId 중 정확히 하나 (officerId = 그 장수가 서 있던/쓰러진 자리)
  | { type: 'dropItem'; itemId: string; pos?: Vec2; officerId?: string }
  | { type: 'giveExp'; target: string; amount: number }

export interface BattleEventDef {
  id: string // 스테이지 내 유일 — firedEvents 키. 발동은 항상 1회 (v1.1 고정)
  trigger: EventTrigger
  actions: EventAction[]
}

/** 표시 대기 중인 이벤트 — 헤드 액션은 항상 표시형(dialogue/choice/duel), UI가 eventContinue로 소비 */
export interface PendingEvent {
  eventId: string
  queue: EventAction[]
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
  /** 적 레벨 연동 스케일링 (v1.3-scaling, 옵트인) — 로스터가 있는 캠페인 전투에서만.
   *  값 = 이 스테이지의 **설계 기준 레벨**. 출진 아군 절사평균과의 차분만큼 적 단위 레벨을 보정하고,
   *  보정 레벨이 승급 문턱(≥15·≥30) 이상이면 적장 병과도 클래스업. 선언하지 않으면 불변(밸런스 보존). */
  enemyLevelScaling?: number
  // 전리품 — 원작 3분류 중 "특정 적 격파 시"(bossKill)와 "승리 후 지급"(victory)만 구현.
  // 시설 점령 즉시 지급은 v0.5 범위 밖 (docs/research/campaign-ux.md 1부 §3).
  loot?: {
    trigger: 'victory' | 'bossKill' | 'allySurvived' // allySurvived = 지정 우군이 승리 시 생존 (원작 c13 유비 → 인수)
    itemId: string
    officerId?: string // allySurvived 전용
  }[]
  /**
   * 패배 조건 (v1.2). 주인공 격파는 명시하지 않아도 항상 적용된다.
   * 원작 표준은 `[{ type: 'turnLimit', turns: 20 }]`.
   */
  defeat?: DefeatCondition[]
  /** 맵에 놓인 아이템 (v1.2) — 아군이 그 칸에 서면 회수한다 (원작: 적장이 있던 자리의 보물) */
  groundItems?: { pos: Vec2; itemId: string }[]
  /** 전투 내 이벤트 (v1.1) — 발동 여부는 BattleState.firedEvents가 든다 */
  events?: BattleEventDef[]
  // ---- 출진 준비 화면 (docs/research/campaign-ux.md 1부 §2) ----
  // 원작은 스테이지마다 출진 부대수 min~max와 강제출진 슬롯(①조조②하후돈 — 번호=출진 순서)이
  // 데이터로 박혀 있고, "선택 순서 = 맵 배치 위치"라 슬롯 인덱스→좌표 테이블이 하드코딩돼 있다.
  // 전부 옵션 — 없으면 units의 player 정의를 그대로 쓰는 자유 전투 경로가 유지된다.
  playerSlots?: Vec2[] // 출진 슬롯 좌표. 인덱스 = 배치 순서
  deployMin?: number
  deployMax?: number
  forcedOfficers?: string[] // 앞 슬롯 고정(순서 포함). 조조는 전 전투 강제(퇴각=게임오버)
}

export type BattleResult = 'ongoing' | 'victory' | 'defeat'

export interface LogEvent {
  type: string
  message: string
  /** 데미지/회복/미스의 대상 유닛 — UI 플로팅 텍스트 앵커 */
  targetId?: string
  /** 음수 = 데미지, 양수 = 회복, 0 = 미스 */
  amount?: number
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
  /** 도구(소모품) — 캠페인 스톡의 전투 로컬 사본. 리듀서가 차감하고 승리 시 캠페인이 회수한다 */
  consumables: ConsumableStack[]
  /** 소진된 이벤트 id (이벤트는 전투당 1회) */
  firedEvents: string[]
  /** 표시 대기 이벤트 큐 (FIFO) — 비어있지 않으면 eventContinue 외 전 액션 거부 */
  pendingEvents: PendingEvent[]
  /** giveItem 적재분 — applyVictory가 캠페인으로 회수 (패배 시 소멸) */
  pendingRewards: { itemId: string; kind: 'equipment' | 'consumable' }[]
  /** giveGold 적재분 — applyVictory가 보상금에 합산 (v1.2) */
  pendingGold: number
  /** 불길 등 전장 위험 지대 (v1.2) */
  hazards: Hazard[]
  /** 맵에 남아 있는 아이템 — 스테이지 정의의 전투 로컬 사본 (v1.2) */
  groundItems: { pos: Vec2; itemId: string }[]
  /** setVictory로 교체된 승리 조건. 없으면 스테이지 정의를 쓴다 (v1.2) */
  victoryOverride?: VictoryCondition[]
  /** setDefeat로 교체된 패배 조건 (v1.2) */
  defeatOverride?: DefeatCondition[]
}

// ---------- 액션 ----------

export type BattleAction =
  | { type: 'move'; unitId: string; to: Vec2 }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'strategy'; unitId: string; strategyId: string; target: Vec2 }
  | { type: 'useItem'; unitId: string; itemId: string; target: Vec2 } // range 0 도구는 자기 위치를 넣는다
  | { type: 'wait'; unitId: string }
  | { type: 'endPhase' }
  // 이벤트 큐 헤드 소비: dialogue = pop / choice = options[choice].actions 앞삽입 / duel = 결과 적용 (v1.1)
  | { type: 'eventContinue'; choice?: number }

// ---------- 상수 ----------

export const MAX_LEVEL = 50
export const EXP_PER_LEVEL = 100 // 전 구간 고정 (조조전 원작 사양)
export const CRIT_MULTIPLIER = 1.5
export const PROMOTION_LEVELS = { tier2: 15, tier3: 30 } as const

// ---------- 무구성장 (equipment.md §1~2) ----------

export const EQUIP_MAX_LEVEL_NORMAL = 3 // 상점 일반 장비 (원작 확정)
export const EQUIP_MAX_LEVEL_TREASURE = 9 // 보물 (원작 확정)
export const EQUIP_GROWTH_NORMAL = 10 // 레벨당 보정치 상승 — 원작 확정
export const EQUIP_GROWTH_TREASURE = 9 // 보물은 상점템보다 낮다 — 원작 확정("만렙 상점템에 소폭 밀림")
/** 레벨업 필요 장비 경험치 — 원작 확정 99, 1% 차이라 부대와 같은 100으로 통일 (equipment.md 증보) */
export const EQUIP_EXP_PER_LEVEL = 100
/**
 * 장비 경험치 획득량 — 원작 확정 비율(무기 3/2/미스1, 방어구 4/3/회피0)에
 * 짧은 캠페인 보정 k=3을 곱한 값 (equipment.md 증보 "반영 결정").
 * higher = 상대 레벨이 나 이상일 때, lower = 미만일 때.
 */
export const EQUIP_EXP_WEAPON_HIT = { higher: 9, lower: 6 } as const
export const EQUIP_EXP_WEAPON_MISS = 3
export const EQUIP_EXP_ARMOR_HIT = { higher: 12, lower: 9 } as const // 회피 시 0
