// 캠페인 진행 상태 — 전투 사이에 남는 유일한 데이터 (docs/research/campaign-ux.md)
// core/ 규칙: 렌더러/브라우저 의존성 금지. 순수 TS + 데이터 참조만.

import { CLASSES } from '../data/classes'
import { CONSUMABLE_STOCK_MAX, CONSUMABLES } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { FRUIT_ON_SELL, FRUITS } from '../data/fruits'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
// 착용 제한 판정은 병과의 lineage(계열 루트) 기준 — 승급해도 계열 무기를 계속 쓴다 (CLASSES 참조 필요)
import type {
  BattleState,
  ConsumableStack,
  EquipInstance,
  EquipmentInput,
  EquipmentMap,
  EquipSlot,
  OfficerStats,
  StageDef,
  UnitState,
} from './types'
import { EQUIP_MAX_LEVEL_NORMAL, MAX_LEVEL } from './types'

/** 로스터 1명 = 전투 사이로 이월되는 성장치 전부 (HP/MP는 레벨에서 재계산) */
export interface RosterEntry {
  officerId: string
  level: number
  exp: number
  /**
   * 승급으로 바뀐 병과 id (오버라이드). 없으면 장수 기본 병과(OFFICERS[officerId].classId).
   * 옵션 필드인 이유: v4 이하 세이브와 승급 전 부대는 이 값을 갖지 않는다.
   */
  classId?: string
  /** 장착 장비 인스턴스 — 무구성장(level/exp)이 전투에서 돌아와 여기에 쌓인다 */
  equipment: EquipmentMap
  /** 열매로 영구 상승한 장수 능력치 */
  statBonus: Partial<OfficerStats>
}

// ---------- 장비 인스턴스 정규화 (정의 표기 ↔ 인스턴스) ----------

/** 문자열 id(정의 표기)면 Lv1 새 인스턴스로, 이미 인스턴스면 복사해서 돌려준다 */
export function toEquipInstance(value: string | EquipInstance): EquipInstance {
  return typeof value === 'string' ? { itemId: value, level: 1, exp: 0 } : { ...value }
}

/** 슬롯 맵을 전부 인스턴스로 정규화 (얕은 복사 — 원본과 참조를 공유하지 않는다) */
export function toEquipmentMap(input: EquipmentInput | EquipmentMap | undefined): EquipmentMap {
  const map: EquipmentMap = {}
  for (const [slot, value] of Object.entries(input ?? {})) {
    if (value) map[slot as EquipSlot] = toEquipInstance(value)
  }
  return map
}

export type CampaignNode =
  // rewardGold: 승리 시 지급되는 군자금. 원작은 전투별 보상금이 데이터로 박혀 있다.
  // rewardSeal: 승리 시 인수(印綬) 1개 지급 — 원작도 특정 전투에서만 나오는 희소 아이템이다.
  | {
      id: string
      type: 'battle'
      stageId: string
      rewardGold: number
      rewardSeal?: boolean
      /** 이 전투 승리 시 합류하는 장수 id 목록 (applyVictory가 소화) */
      join?: string[]
      /**
       * 이 전투 승리 시 로스터에서 빠지는 장수 (v1.2 — 전위의 죽음).
       * when 'ifDead' = 전장에 사체(hp 0)가 남은 경우만 이탈 (원작: 절영으로 구출하면 생존).
       * 장착 장비는 창고로 회수한다 [설계값 — 플레이어 자산 보호].
       */
      leave?: { officerId: string; when?: 'always' | 'ifDead' }[]
      next: string | null
    }
  | {
      id: string
      type: 'story'
      title: string
      scriptId: string
      /** 이 스토리 소화 시 합류하는 장수 id 목록 (completeStory가 소화) */
      join?: string[]
      /**
       * 로스터 상태에 따른 대체 스크립트 (v1.2). absentOfficerId가 로스터에 없으면 그 scriptId를 쓴다.
       * (전위가 완성에서 전사한 뒤의 추모 장면 — 해석은 표시 계층)
       */
      variants?: { absentOfficerId: string; scriptId: string }[]
      next: string | null
    }
  // 선택지 노드 — 원작 "사실/가상 게이지"를 움직이며 후속 노드를 가른다 (campaign-ux.md 1부 §5).
  // 원작 03 동탁 추격전처럼 "그만둔다"를 고르면 전투 노드를 통째로 건너뛴다.
  | {
      id: string
      type: 'choice'
      title: string
      prompt: string
      speaker: string | null
      options: CampaignChoiceOption[]
    }
  | { id: string; type: 'end'; title: string }

export interface CampaignChoiceOption {
  text: string
  /** 게이지 증감. 양수 = 사실(史實) 쪽, 음수 = 가상 쪽. 원작 증감폭 4단계(2/5/10/20) */
  gaugeDelta: number
  next: string
}

/** 사실-가상 게이지 범위 — 합 100 고정이라 한쪽 값만 들고 다닌다 (빨강=사실 / 파랑=가상) */
export const GAUGE_MIN = 0
export const GAUGE_MAX = 100
/** 시작값 — 어느 쪽으로도 기울지 않은 중립 */
export const GAUGE_INITIAL = 50
/** 분기 임계 — 한쪽이 85 이상(=반대쪽 15 이하)이면 진행 분기가 확정 방향으로 굳는다 */
export const GAUGE_THRESHOLD_HIGH = 85
export const GAUGE_THRESHOLD_LOW = 15

/** 게이지를 0~100 정수로 자른다 */
export function clampGauge(value: number): number {
  if (!Number.isFinite(value)) return GAUGE_INITIAL
  return Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, Math.trunc(value)))
}

export interface CampaignState {
  version: 6
  nodeId: string
  roster: RosterEntry[]
  clearedStages: string[]
  /** 군자금 — 상점 매매의 유일한 자원 */
  gold: number
  /** 창고 — 장착되지 않은 장비 인스턴스 목록. 같은 itemId라도 레벨이 다르므로 인덱스로 지목한다 */
  inventory: EquipInstance[]
  /** 보유 열매 id 목록 (중복 허용) */
  fruits: string[]
  /**
   * 사실-가상 게이지 (0~100 정수). 높을수록 사실(빨강), 낮을수록 가상(파랑).
   * 합 100 고정이므로 가상 쪽 값은 100 - gauge로 얻는다.
   */
  gauge: number
  /** 도구(소모품) 스톡 — 인수(insu) 포함. 전투로 반입되어 소비되고 승리 시 잔량이 회수된다 */
  consumables: ConsumableStack[]
}

/** 스택 목록에서 특정 도구의 보유 수 */
export function consumableCount(list: ConsumableStack[], itemId: string): number {
  return list.find((s) => s.itemId === itemId)?.count ?? 0
}

/** 도구 n개 추가한 새 목록 (불변). n<=0이면 복제만 */
export function addConsumable(list: ConsumableStack[], itemId: string, n: number): ConsumableStack[] {
  const next = list.map((s) => ({ ...s }))
  if (n <= 0) return next
  const stack = next.find((s) => s.itemId === itemId)
  if (stack) stack.count += n
  else next.push({ itemId, count: n })
  return next
}

/** 도구 n개 제거한 새 목록 (불변). 0이 되는 스택은 목록에서 뺀다. 부족하면 null */
export function removeConsumable(list: ConsumableStack[], itemId: string, n: number): ConsumableStack[] | null {
  if (consumableCount(list, itemId) < n) return null
  return list
    .map((s) => (s.itemId === itemId ? { ...s, count: s.count - n } : { ...s }))
    .filter((s) => s.count > 0)
}

/** 초기 군자금 — 서장 1단계 상점에서 tier1 장비 1~2점을 살 수 있는 수준 (설계값) */
export const INITIAL_GOLD = 500

/** 능력치 열매 1개의 장수 능력치 상승폭 — 원작 확정 +2 (짝수 관례, 부대 능력치로는 +1). 경험의 열매는 레벨 +1 */
export const FRUIT_STAT_BONUS = 2

// 원작은 story|battle 노드의 조건부 DAG — 전투 없는 노드, 전투 뒤 후속 노드,
// 선택지/클리어 방식에 따른 스테이지 스킵이 존재한다 (campaign-ux.md 1부 §3.3).
// v0.7에서 제1부(반동탁 연합) 구간과 선택지 분기(c01)를 얹었다:
//   c01에서 "그만둔다"(회군)를 고르면 동탁 추격전(n13) 전투 노드를 통째로 건너뛴다 — 원작 03 스킵 재현.
// v1.0에서 제2부(청주~하비, 원작 1장 후반)를 5전투로 압축해 얹었다:
//   c02(원작 c05)에서 "도겸과 화친"을 고르면 서주 전투(n21)를 통째로 건너뛴다 — c01과 같은 스킵 패턴.
//   합류(join)는 노드 필드로 선언하고 completeStory/applyVictory가 joinOfficers로 소화한다.
// battle 노드 id(n01/n02)는 v0.3 세이브 호환을 위해 유지한다.
export const CAMPAIGN_NODES: CampaignNode[] = [
  { id: 's00', type: 'story', title: '의용군 결성', scriptId: 'intro', next: 'n01' },
  { id: 'n01', type: 'battle', stageId: 'stage01', rewardGold: 300, next: 's01' },
  { id: 's01', type: 'story', title: '관문을 지켜라', scriptId: 'afterStage01', next: 'n02' },
  { id: 'n02', type: 'battle', stageId: 'stage02', rewardGold: 400, next: 's02' },
  { id: 's02', type: 'story', title: '황건 본진', scriptId: 'afterStage02', next: 'n03' },
  { id: 'n03', type: 'battle', stageId: 'stage03', rewardGold: 600, next: 's10' },
  // ---- 제1부 「패왕 탄생」 — 반동탁 연합 ----
  { id: 's10', type: 'story', title: '반동탁 격문', scriptId: 'coalition', next: 'n11' },
  { id: 'n11', type: 'battle', stageId: 'stage04', rewardGold: 700, rewardSeal: true, next: 's11' },
  { id: 's11', type: 'story', title: '호로관으로', scriptId: 'toHulao', next: 'n12' },
  { id: 'n12', type: 'battle', stageId: 'stage05', rewardGold: 800, rewardSeal: true, next: 'c01' },
  {
    id: 'c01',
    type: 'choice',
    title: '추격이냐 회군이냐',
    prompt:
      '동탁이 낙양을 불태우고 장안으로 도주했다. 연합의 제후들은 술잔만 기울일 뿐 아무도 움직이지 않는다.',
    speaker: 'caocao',
    // 원작 낙양 선택지 재현 — 실제 역사에서 조조는 홀로 추격했다(사실 루트).
    // 증감폭 10 = 원작 4단계(2/5/10/20) 중 중상급 (campaign-ux.md 1부 §5).
    options: [
      { text: '지금 추격한다. 하늘이 준 기회다!', gaugeDelta: 10, next: 'n13' },
      { text: '무리다. 훗날을 기약한다.', gaugeDelta: -10, next: 's12' },
    ],
  },
  { id: 'n13', type: 'battle', stageId: 'stage06', rewardGold: 1000, rewardSeal: true, next: 's13' },
  { id: 's12', type: 'story', title: '회군', scriptId: 'retreat', next: 's13' },
  { id: 's13', type: 'story', title: '1부 종장', scriptId: 'chapterEnd', next: 's20' },
  // ---- 제2부 「연주에서 서주로」 — 청주 평정 ~ 하비 (원작 1장 후반을 5전투로 압축) ----
  // chapterOf가 이 s20을 경계로 1부/2부를 가른다 → 인수 상점 진열이 여기서 열린다 (items.md §5).
  { id: 's20', type: 'story', title: '청주 격문', scriptId: 'chapter2Intro', next: 'n20' },
  { id: 'n20', type: 'battle', stageId: 'stage07', rewardGold: 900, next: 's21' },
  { id: 's21', type: 'story', title: '아버지의 죽음', scriptId: 'fatherDeath', next: 'c02' },
  {
    id: 'c02',
    type: 'choice',
    title: '화친이냐 토벌이냐',
    prompt:
      '서주로 진군하던 중 급보가 날아들었다. 여포가 연주를 급습해 복양에 들어앉았다는 것이다.',
    speaker: 'caocao',
    // 원작 c05의 실제 선택지 = 「도겸과 화친 / 토벌 속행」이다.
    // 서주 대학살 선택지는 원작에 없다 — 조조가 학살 의도를 명시 부정한다 (statuses.md §4).
    // 화친을 고르면 서주 전투(n21)를 통째로 건너뛴다 — 원작도 화친 시 전투가 즉시 끝난다.
    // 증감폭 5는 우리 게이지 시스템 활용 [설계값] — 원작은 이 선택지에서 게이지가 움직이지 않는다.
    options: [
      { text: '여포는 나중이다. 도겸 토벌을 속행한다.', gaugeDelta: 5, next: 'n21' },
      { text: '도겸과 화친하고 복양으로 향한다.', gaugeDelta: -5, next: 's22' },
    ],
  },
  { id: 'n21', type: 'battle', stageId: 'stage08', rewardGold: 1100, next: 's22' },
  { id: 's22', type: 'story', title: '복양의 배신', scriptId: 'puyangBetrayal', next: 'n22' },
  { id: 'n22', type: 'battle', stageId: 'stage09', rewardGold: 1300, next: 's23' },
  // 허저 합류 — story 노드의 join을 completeStory가 소화한다
  {
    id: 's23',
    type: 'story',
    title: '서주 구원 요청',
    scriptId: 'xuzhouRescue',
    join: ['xuChu'],
    next: 'n23',
  },
  { id: 'n23', type: 'battle', stageId: 'stage10', rewardGold: 1400, next: 's24' },
  { id: 's24', type: 'story', title: '하비 포위', scriptId: 'xiapiSiege', next: 'n24' },
  { id: 'n24', type: 'battle', stageId: 'stage11', rewardGold: 1800, rewardSeal: true, next: 's25' },
  // 장료 합류 — 원작 명장면("장료는 죽음을 두려워하지 않는다") 직후 2차 병과 그대로 들어온다
  { id: 's25', type: 'story', title: '2부 종장', scriptId: 'chapter2End', join: ['zhangLiao'], next: 'fin' },
  { id: 'fin', type: 'end', title: '제2부 완' },
]

/** 초기 로스터 — 서장 클리어 후 6명 일괄 합류 커브를 압축한 구성 (campaign-ux.md 1부 §7) */
export const PLAYER_OFFICER_IDS = ['caocao', 'xiahoudun', 'dianwei', 'xiahouyuan', 'guojia', 'xunyu']

/**
 * 로스터 엔트리 생성 — 초기 편성과 중간 합류가 같은 규칙을 쓴다.
 * 원작 디테일: 장수는 합류 시 병과 기본 무기를 장착하고 온다 (조조 = 의천검) — 전부 Lv1 인스턴스.
 * 이미 승급된 채 합류하는 장수(장료 등)는 OfficerDef.classId 자체가 2차라 오버라이드가 필요 없다.
 */
export function newRosterEntry(officerId: string): RosterEntry {
  return {
    officerId,
    level: OFFICERS[officerId].level,
    exp: 0,
    equipment: toEquipmentMap(OFFICERS[officerId].initialEquipment),
    statBonus: {},
  }
}

/**
 * 장수 합류 (원본 불변, 멱등) — 이미 로스터에 있거나 미등록 id인 장수는 조용히 건너뛴다.
 * 노드의 join 필드를 completeStory/applyVictory가 이 함수로 소화한다.
 */
export function joinOfficers(campaign: CampaignState, officerIds: string[]): CampaignState {
  const fresh = officerIds.filter(
    (id) => OFFICERS[id] !== undefined && !campaign.roster.some((r) => r.officerId === id),
  )
  if (fresh.length === 0) return campaign
  return {
    ...campaign,
    roster: [...campaign.roster.map(cloneEntry), ...fresh.map(newRosterEntry)],
    clearedStages: [...campaign.clearedStages],
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
    consumables: campaign.consumables.map((s) => ({ ...s })),
  }
}

/**
 * 노드가 속한 부(장) — 상태 필드 없이 노드 그래프 위치에서 파생한다.
 * 2부 첫 노드(s20) 이전이면 1부. s20이 아직 없으면(1부만 존재) 항상 1.
 * 원작: 인수는 2장부터 상점 판매 (items.md §5) — 상점 해금 판정에 쓴다.
 */
export function chapterOf(nodeId: string): 1 | 2 {
  const start = CAMPAIGN_NODES.findIndex((n) => n.id === 's20')
  if (start < 0) return 1
  const index = CAMPAIGN_NODES.findIndex((n) => n.id === nodeId)
  return index >= start ? 2 : 1
}

export function newCampaign(): CampaignState {
  return {
    version: 6,
    nodeId: CAMPAIGN_NODES[0].id,
    roster: PLAYER_OFFICER_IDS.map(newRosterEntry),
    clearedStages: [],
    gold: INITIAL_GOLD,
    inventory: [],
    fruits: [],
    gauge: GAUGE_INITIAL,
    consumables: [],
  }
}

export function currentNode(campaign: CampaignState): CampaignNode | null {
  return CAMPAIGN_NODES.find((n) => n.id === campaign.nodeId) ?? null
}

/** battle 노드 전용 — story 노드는 전투가 없으므로 예외 */
export function stageForNode(node: CampaignNode): StageDef {
  if (node.type !== 'battle') throw new Error(`전투 노드가 아니다: ${node.id}`)
  const stage = STAGES.find((s) => s.id === node.stageId)
  if (!stage) throw new Error(`알 수 없는 스테이지: ${node.stageId}`)
  return stage
}

/**
 * story 노드 소화 → 다음 노드로 전진 (원본 불변).
 * 노드에 join이 있으면 그 장수들을 로스터에 편입한 뒤 전진한다 (joinOfficers는 멱등).
 * battle 노드나 막다른 노드에서 호출되면 아무 일도 하지 않고 원본을 그대로 돌려준다.
 */
export function completeStory(campaign: CampaignState): CampaignState {
  const node = currentNode(campaign)
  if (!node || node.type !== 'story' || node.next === null) return campaign
  const advanced: CampaignState = {
    version: 6,
    nodeId: node.next,
    roster: campaign.roster.map(cloneEntry),
    clearedStages: [...campaign.clearedStages],
    gold: campaign.gold,
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
    gauge: clampGauge(campaign.gauge),
    consumables: campaign.consumables.map((s) => ({ ...s })),
  }
  return node.join ? joinOfficers(advanced, node.join) : advanced
}

/**
 * 선택지 소화 → 게이지를 움직이고 고른 갈래로 전진 (원본 불변).
 * choice 노드가 아니거나 범위 밖 인덱스면 아무 일도 하지 않고 원본을 그대로 돌려준다.
 */
export function completeChoice(campaign: CampaignState, optionIndex: number): CampaignState {
  const node = currentNode(campaign)
  if (!node || node.type !== 'choice') return campaign
  if (!Number.isInteger(optionIndex)) return campaign
  const option = node.options[optionIndex]
  if (!option) return campaign
  return {
    version: 6,
    nodeId: option.next,
    roster: campaign.roster.map(cloneEntry),
    clearedStages: [...campaign.clearedStages],
    gold: campaign.gold,
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
    gauge: clampGauge(campaign.gauge + option.gaugeDelta),
    consumables: campaign.consumables.map((s) => ({ ...s })),
  }
}

const cloneEntry = (entry: RosterEntry): RosterEntry => ({
  ...entry,
  equipment: toEquipmentMap(entry.equipment),
  statBonus: { ...entry.statBonus },
})

const cloneInventory = (inventory: EquipInstance[]): EquipInstance[] => inventory.map((i) => ({ ...i }))

/** 종막(end) 노드에 도달한 상태 — 어느 갈래로 왔든 종장 story를 소화하면 켜진다 */
export function isCampaignFinished(campaign: CampaignState): boolean {
  return currentNode(campaign)?.type === 'end'
}

/** 전투 상태에 붙어 있는 스테이지 정의 (attachStage) → 없으면 id로 조회 */
function stageOfBattle(battleState: BattleState): StageDef | undefined {
  return battleState.__stage ?? STAGES.find((s) => s.id === battleState.stageId)
}

/** 아이템 id가 장비인지 도구인지 — 오타/삭제된 id는 null (조용히 무시된다) */
type RewardKind = 'equipment' | 'consumable'

function itemKindOf(itemId: string): RewardKind | null {
  if (EQUIPMENT[itemId]) return 'equipment'
  if (CONSUMABLES[itemId]) return 'consumable'
  return null
}

/**
 * 전리품 판정 — 원작 "승리 후 지급" 단계에 대응 (docs/research/campaign-ux.md 1부 §3).
 * victory      = 승리했으면 무조건 (applyVictory가 곧 승리 시점)
 * bossKill     = isBoss 유닛이 존재하고 전부 격파됐을 때 (N턴 방어로 이긴 경우엔 안 나온다)
 * allySurvived = 지정 우군(officerId)이 승리 시점에 생존 (원작 c13 유비 → 인수, v1.1)
 * 장비/도구 양쪽을 지급한다 — 도구는 addConsumable 경로로 간다.
 */
function lootFor(battleState: BattleState): { itemId: string; kind: RewardKind }[] {
  const stage = stageOfBattle(battleState)
  if (!stage?.loot) return []
  const bosses = battleState.units.filter((u) => u.isBoss)
  const bossKilled = bosses.length > 0 && bosses.every((u) => u.hp <= 0)
  const rewards: { itemId: string; kind: RewardKind }[] = []
  for (const entry of stage.loot) {
    if (entry.trigger === 'bossKill' && !bossKilled) continue
    if (entry.trigger === 'allySurvived') {
      const survived = battleState.units.some(
        (u) => u.officerId === entry.officerId && u.faction === 'ally' && u.hp > 0,
      )
      if (!survived) continue
    }
    const kind = itemKindOf(entry.itemId)
    if (kind) rewards.push({ itemId: entry.itemId, kind }) // 오타/삭제된 id는 무시
  }
  return rewards
}

/**
 * 승리 반영: 전투 중 성장을 로스터로 회수하고, 보상금·전리품을 챙기고 다음 노드로 진행 (원본 불변).
 * 퇴각(hp<=0)한 부대도 포함 — 원작 규칙상 퇴각은 사망이 아니고 획득 경험치도 유지된다.
 */
export function applyVictory(campaign: CampaignState, battleState: BattleState): CampaignState {
  // 무구성장도 함께 회수한다 — 전투 중 오른 장비 레벨/경험치는 로스터 쪽 인스턴스가 정본이 된다.
  // classId까지 회수하는 이유: v0.9부터 승급은 전투 중 인수 사용으로 일어난다.
  const grown = new Map<string, { level: number; exp: number; classId: string; equipment: EquipmentMap }>()
  for (const unit of battleState.units) {
    if (unit.faction !== 'player') continue
    grown.set(unit.officerId, {
      level: unit.level,
      exp: unit.exp,
      classId: unit.classId,
      equipment: toEquipmentMap(unit.equipment),
    })
  }

  const node = currentNode(campaign)

  // 전리품(스테이지 loot) + 전투 중 이벤트 획득분(pendingRewards) — 패배 시에는 이 함수가 불리지 않는다
  const rewards = [
    ...lootFor(battleState),
    ...battleState.pendingRewards.flatMap((r) => {
      const kind = itemKindOf(r.itemId) // 실제 데이터를 기준으로 경로를 정한다 (선언 kind 오기 내성)
      return kind ? [{ itemId: r.itemId, kind }] : []
    }),
  ]
  // 도구는 전투 로컬 사본의 잔량이 정본 → 인수 보상 → 이벤트/전리품 도구 순으로 얹는다
  let consumables = addConsumable(
    battleState.consumables,
    'insu',
    node?.type === 'battle' && node.rewardSeal ? 1 : 0,
  )
  for (const reward of rewards) {
    if (reward.kind === 'consumable') consumables = addConsumable(consumables, reward.itemId, 1)
  }

  const clearedStages = campaign.clearedStages.includes(battleState.stageId)
    ? [...campaign.clearedStages]
    : [...campaign.clearedStages, battleState.stageId]

  const advanced: CampaignState = {
    version: 6,
    // 막다른 노드(next null)나 전투 아닌 노드에서 불리면 제자리에 머문다
    nodeId: (node?.type === 'battle' || node?.type === 'story' ? node.next : null) ?? campaign.nodeId,
    roster: campaign.roster.map((entry) => {
      const after = grown.get(entry.officerId)
      // 출진하지 않은 부대는 로스터 값 그대로. 출진했다면 레벨/경험치 + 장비 인스턴스를 회수한다.
      if (!after) return cloneEntry(entry)
      const recovered = { ...cloneEntry(entry), level: after.level, exp: after.exp, equipment: after.equipment }
      // 전투 중 인수로 승급했다면 병과 오버라이드도 회수한다.
      // 기본 병과 그대로인 부대는 키를 만들지 않는다 — 세이브 라운드트립 동일성 유지.
      if (after.classId !== OFFICERS[entry.officerId]?.classId) recovered.classId = after.classId
      return recovered
    }),
    clearedStages,
    gold: campaign.gold + (node?.type === 'battle' ? node.rewardGold : 0),
    inventory: [
      ...cloneInventory(campaign.inventory),
      ...rewards.filter((r) => r.kind === 'equipment').map((r) => toEquipInstance(r.itemId)),
    ],
    fruits: [...campaign.fruits],
    gauge: clampGauge(campaign.gauge),
    // 도구는 전투 로컬 사본의 잔량이 정본이 된다 (전투 중 소비 반영).
    // 인수는 노드에 박힌 보상 — 원작대로 특정 전투(사수관/호로관/추격전)에서만 나온다
    consumables,
  }

  // 전투 승리 합류 — 노드의 join을 소화한다 (joinOfficers는 멱등이라 재호출에 안전하다)
  const join = node?.type === 'battle' || node?.type === 'story' ? node.join : undefined
  return join ? joinOfficers(advanced, join) : advanced
}

// ---------- 승급 (Lv15 + 인수 — caocao.md §2.1~2.2) ----------

/** 승급에 필요한 최소 레벨 (2차). 원작: Lv15↑ 인수 → 2차, Lv30↑ 인수 → 3차 */
export const PROMOTION_LEVEL = 15

/**
 * 로스터 항목의 실제 병과 id — 승급 오버라이드가 있으면 그것, 없으면 장수 기본 병과.
 * 미등록 병과 id(데이터 개편/손상된 세이브)는 기본 병과로 되돌린다.
 */
export function classIdOf(entry: Pick<RosterEntry, 'officerId' | 'classId'>): string {
  if (entry.classId && CLASSES[entry.classId]) return entry.classId
  return OFFICERS[entry.officerId]?.classId ?? entry.classId ?? ''
}

/**
 * 승급 가능 판정 — 병과에 상위 병과가 있고 Lv15 이상인가. 인수 보유는 보지 않는다.
 * 전투 리듀서(useItem 인수 분기)와 UI가 같은 규칙을 쓰도록 부대 단위로 뽑아낸 함수다.
 */
export function canPromoteUnit(unit: Pick<UnitState, 'classId' | 'level'>): boolean {
  if (unit.level < PROMOTION_LEVEL) return false
  const promotesTo = CLASSES[unit.classId]?.promotesTo
  return promotesTo !== undefined && CLASSES[promotesTo] !== undefined
}

// ---------- 장비 장착 / 상점 (모두 불변, 실패 시 원본 그대로 반환) ----------

/** 창고에서 인덱스 1개를 제거한 새 배열 (범위 밖이면 null) */
function removeAt<T>(list: T[], index: number): T[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return null
  return [...list.slice(0, index), ...list.slice(index + 1)]
}

/**
 * 병과별 착용 가능 판정 (원작: 무기 카테고리는 병과 1:1 — equipment.md §5).
 * 판정 기준은 **계열(lineage)** — EQUIPMENT.classes에는 1차 병과 id만 적히고,
 * 승급한 부대는 그 계열 루트로 환원해서 본다 (중기병도 경기병과 같은 창을 쓴다).
 * classes 미지정 장비는 전 병과 착용 가능.
 */
export function canEquipClass(classId: string, itemId: string): boolean {
  const item = EQUIPMENT[itemId]
  const cls = CLASSES[classId]
  if (!item || !cls) return false
  return !item.classes || item.classes.includes(cls.lineage)
}

/**
 * 장수 **기본 병과** 기준 착용 판정 — 승급 여부를 모르는 호출부(세이브 정화/목록 표시)용.
 * 승급을 반영해야 하는 실제 장착은 equipItem(→ canEquipClass)이 로스터 병과로 판정한다.
 */
export function canEquip(officerId: string, itemId: string): boolean {
  const officer = OFFICERS[officerId]
  if (!officer) return false
  return canEquipClass(officer.classId, itemId)
}

/**
 * 창고의 inventoryIndex번 장비를 장수에게 장착. 같은 슬롯에 이미 장비가 있으면 그것은 창고로 돌아간다.
 * 인덱스로 지목하는 이유: 무구성장 도입 후에는 같은 itemId라도 레벨이 다른 별개의 물건이다.
 * 범위 밖 인덱스 / 없는 장수 / 미등록 id / 병과 착용 불가면 원본을 그대로 반환한다.
 */
export function equipItem(campaign: CampaignState, officerId: string, inventoryIndex: number): CampaignState {
  const instance = campaign.inventory[inventoryIndex]
  if (!instance) return campaign
  const item = EQUIPMENT[instance.itemId]
  if (!item) return campaign
  const target = campaign.roster.find((r) => r.officerId === officerId)
  if (!target) return campaign
  // 승급 병과를 반영해 판정한다 (계열 기준이므로 승급해도 결과는 같지만, 정본은 로스터 병과다)
  if (!canEquipClass(classIdOf(target), instance.itemId)) return campaign
  const rest = removeAt(campaign.inventory, inventoryIndex)
  if (!rest) return campaign

  const previous = target.equipment[item.slot]
  return {
    ...campaign,
    roster: campaign.roster.map((entry) =>
      entry.officerId === officerId
        ? { ...cloneEntry(entry), equipment: { ...toEquipmentMap(entry.equipment), [item.slot]: { ...instance } } }
        : cloneEntry(entry),
    ),
    inventory: previous ? [...cloneInventory(rest), { ...previous }] : cloneInventory(rest),
  }
}

/** 슬롯을 비우고 장비를 창고로 되돌린다 (레벨/경험치 유지). 빈 슬롯이면 원본 그대로. */
export function unequipItem(campaign: CampaignState, officerId: string, slot: EquipSlot): CampaignState {
  const target = campaign.roster.find((r) => r.officerId === officerId)
  const instance = target?.equipment[slot]
  if (!instance) return campaign

  return {
    ...campaign,
    roster: campaign.roster.map((entry) => {
      if (entry.officerId !== officerId) return cloneEntry(entry)
      const clone = cloneEntry(entry)
      delete clone.equipment[slot]
      return clone
    }),
    inventory: [...cloneInventory(campaign.inventory), { ...instance }],
  }
}

/**
 * 상점 구매 → 창고로 Lv1 새 인스턴스. 비매품(보물, price null)이거나 군자금이 부족하면 원본 그대로.
 * ※ 해금 단계(tier) 제한은 상점 UI가 shopTierFor로 걸러낸다 — 여기서는 검사하지 않는다.
 */
export function buyItem(campaign: CampaignState, itemId: string): CampaignState {
  const item = EQUIPMENT[itemId]
  if (!item || item.price === null) return campaign
  if (campaign.gold < item.price) return campaign
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold - item.price,
    inventory: [...cloneInventory(campaign.inventory), toEquipInstance(itemId)],
  }
}

/**
 * 창고의 inventoryIndex번 장비를 판매.
 * 원작 확정 규칙(equipment.md §1): **3단계 일반 장비를 Lv3(만렙)에 팔면 골드가 아니라 능력치 열매**가 나온다.
 * 판매가는 항상 기본가의 반값 골드. 만렙(일반 Lv3) 장비는 **골드에 더해 열매**를 준다 (원작 확정 — 동시 지급).
 * 보물은 판매 불가 (원작: 영걸전은 가능, 조조전은 불가). 장착 중인 장비는 창고에 없으니 자연히 팔리지 않는다.
 */
export function sellItem(campaign: CampaignState, inventoryIndex: number): CampaignState {
  const instance = campaign.inventory[inventoryIndex]
  if (!instance) return campaign
  const item = EQUIPMENT[instance.itemId]
  if (!item || item.isTreasure || item.price === null) return campaign
  const rest = removeAt(campaign.inventory, inventoryIndex)
  if (!rest) return campaign

  // 원작 확정(equipment.md 증보): tier 무관, 일반 장비가 만렙이면 열매 — 골드도 함께 지급
  const fruitId = instance.level >= EQUIP_MAX_LEVEL_NORMAL ? FRUIT_ON_SELL[item.id] : undefined
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold + Math.trunc(item.price / 2),
    inventory: cloneInventory(rest),
    fruits: fruitId ? [...campaign.fruits, fruitId] : [...campaign.fruits],
  }
}

/**
 * 도구(소모품) 구매 → 스톡 +1. 비매품(인수 등 price null)이거나 군자금이 부족하면 원본 그대로.
 * 장비와 달리 인스턴스 상태가 없어 수량 스택으로만 관리한다.
 * 종류별 재고 상한은 255 — 원작 저장 구조가 1바이트 카운트다 (items.md §1).
 */
export function buyConsumable(campaign: CampaignState, itemId: string): CampaignState {
  const def = CONSUMABLES[itemId]
  if (!def || def.price === null) return campaign
  if (campaign.gold < def.price) return campaign
  if (consumableCount(campaign.consumables, itemId) >= CONSUMABLE_STOCK_MAX) return campaign
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold - def.price,
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
    consumables: addConsumable(campaign.consumables, itemId, 1),
  }
}

/**
 * 도구 판매 → 스톡 -1, 기본가의 반값 골드. 비매품(price null)은 판매 불가이며
 * 스톡이 없으면 원본 그대로 (장비 sellItem과 같은 관례).
 */
export function sellConsumable(campaign: CampaignState, itemId: string): CampaignState {
  const def = CONSUMABLES[itemId]
  if (!def || def.price === null) return campaign
  const rest = removeConsumable(campaign.consumables, itemId, 1)
  if (!rest) return campaign
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold + Math.floor(def.price / 2),
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
    consumables: rest,
  }
}

/**
 * 열매 사용 — 능력치 열매는 장수 능력치 +2(부대 능력치로는 +1),
 * 경험의 열매는 **레벨 +1** (원작 확정, 잔여 경험치 유지 — 영걸전 일기토와 같은 방식). Lv50 캡.
 * 범위 밖 인덱스 / 미등록 열매 / 로스터 밖 장수면 원본 그대로.
 */
export function useFruit(campaign: CampaignState, officerId: string, fruitIndex: number): CampaignState {
  const fruitId = campaign.fruits[fruitIndex]
  const fruit = fruitId ? FRUITS[fruitId] : undefined
  if (!fruit) return campaign
  if (!campaign.roster.some((r) => r.officerId === officerId)) return campaign
  const rest = removeAt(campaign.fruits, fruitIndex)
  if (!rest) return campaign

  return {
    ...campaign,
    roster: campaign.roster.map((entry) => {
      const clone = cloneEntry(entry)
      if (entry.officerId !== officerId) return clone
      if (fruit.stat === 'exp') {
        return { ...clone, level: Math.min(MAX_LEVEL, entry.level + 1) }
      }
      const current = clone.statBonus[fruit.stat] ?? 0
      return { ...clone, statBonus: { ...clone.statBonus, [fruit.stat]: current + FRUIT_STAT_BONUS } }
    }),
    fruits: rest,
  }
}

/** 아군 평균 레벨 (내림). 빈 로스터는 0 */
export function avgRosterLevel(campaign: CampaignState): number {
  if (campaign.roster.length === 0) return 0
  const total = campaign.roster.reduce((sum, entry) => sum + entry.level, 0)
  return Math.floor(total / campaign.roster.length)
}

/**
 * 상점 해금 단계 — 원작은 스토리 노드 고정 해금이지만(밸런스 최대 단점으로 지적됨),
 * "아군 평균 레벨 연동" 서술도 함께 있어 후자를 채택했다 (docs/research/caocao.md §6).
 */
export function shopTierFor(avgLevel: number): 1 | 2 | 3 {
  if (avgLevel < 8) return 1
  if (avgLevel < 16) return 2
  return 3
}

export interface GrowthRow {
  officerId: string
  levelBefore: number
  levelAfter: number
  expBefore: number
  expAfter: number
}

/** 성장 비교에 필요한 최소 필드만 — 장비까지 갖춘 RosterEntry를 요구하지 않는다 */
export type GrowthSnapshot = Pick<RosterEntry, 'officerId' | 'level' | 'exp'>

/** 승리 결산 UI용 성장 요약 — 레벨업한 부대를 위로 정렬 (campaign-ux.md 2부 §2) */
export function growthSummary(before: GrowthSnapshot[], after: GrowthSnapshot[]): GrowthRow[] {
  const rows: GrowthRow[] = after.map((entry) => {
    const prev = before.find((b) => b.officerId === entry.officerId)
    return {
      officerId: entry.officerId,
      levelBefore: prev?.level ?? entry.level,
      levelAfter: entry.level,
      expBefore: prev?.exp ?? entry.exp,
      expAfter: entry.exp,
    }
  })
  const leveled = (r: GrowthRow): number => (r.levelAfter > r.levelBefore ? 0 : 1)
  return rows.sort((a, b) => leveled(a) - leveled(b))
}
