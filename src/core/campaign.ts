// 캠페인 진행 상태 — 전투 사이에 남는 유일한 데이터 (docs/research/campaign-ux.md)
// core/ 규칙: 렌더러/브라우저 의존성 금지. 순수 TS + 데이터 참조만.

import { EQUIPMENT } from '../data/equipment'
import { FRUIT_ON_SELL, FRUITS } from '../data/fruits'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
// (착용 제한 판정은 OFFICERS.classId만으로 충분 — CLASSES 참조 불필요)
import { applyExp } from './formulas'
import type {
  BattleState,
  EquipInstance,
  EquipmentInput,
  EquipmentMap,
  EquipSlot,
  OfficerStats,
  StageDef,
} from './types'
import { EQUIP_MAX_LEVEL_NORMAL } from './types'

/** 로스터 1명 = 전투 사이로 이월되는 성장치 전부 (HP/MP는 레벨에서 재계산) */
export interface RosterEntry {
  officerId: string
  level: number
  exp: number
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
  | { id: string; type: 'battle'; stageId: string; rewardGold: number; next: string | null }
  | { id: string; type: 'story'; title: string; scriptId: string; next: string | null }

export interface CampaignState {
  version: 3
  nodeId: string
  roster: RosterEntry[]
  clearedStages: string[]
  /** 군자금 — 상점 매매의 유일한 자원 */
  gold: number
  /** 창고 — 장착되지 않은 장비 인스턴스 목록. 같은 itemId라도 레벨이 다르므로 인덱스로 지목한다 */
  inventory: EquipInstance[]
  /** 보유 열매 id 목록 (중복 허용) */
  fruits: string[]
}

/** 초기 군자금 — 서장 1단계 상점에서 tier1 장비 1~2점을 살 수 있는 수준 (설계값) */
export const INITIAL_GOLD = 500

/** 능력치 열매 1개의 장수 능력치 상승폭 — ⚠ 원작 미확보 설계값. 부대 능력치로는 ÷2 되어 +1 */
export const FRUIT_STAT_BONUS = 2
/** 경험의 열매 1개가 주는 부대 경험치 — ⚠ 원작 미확보 설계값 (레벨업 1/2) */
export const FRUIT_EXP_AMOUNT = 50

// 원작은 story|battle 노드의 조건부 DAG — 전투 없는 노드, 전투 뒤 후속 노드,
// 선택지/클리어 방식에 따른 스테이지 스킵이 존재한다 (campaign-ux.md 1부 §3.3).
// v0.4는 story↔battle 교대 선형 체인까지. 분기/스킵은 next를 조건부로 바꿔 얹는다.
// battle 노드 id(n01/n02)는 v0.3 세이브 호환을 위해 유지한다.
export const CAMPAIGN_NODES: CampaignNode[] = [
  { id: 's00', type: 'story', title: '의용군 결성', scriptId: 'intro', next: 'n01' },
  { id: 'n01', type: 'battle', stageId: 'stage01', rewardGold: 300, next: 's01' },
  { id: 's01', type: 'story', title: '관문을 지켜라', scriptId: 'afterStage01', next: 'n02' },
  { id: 'n02', type: 'battle', stageId: 'stage02', rewardGold: 400, next: 's02' },
  { id: 's02', type: 'story', title: '황건 본진', scriptId: 'afterStage02', next: 'n03' },
  { id: 'n03', type: 'battle', stageId: 'stage03', rewardGold: 600, next: null },
]

/** 초기 로스터 — 서장 클리어 후 6명 일괄 합류 커브를 압축한 구성 (campaign-ux.md 1부 §7) */
export const PLAYER_OFFICER_IDS = ['caocao', 'xiahoudun', 'dianwei', 'xiahouyuan', 'guojia', 'xunyu']

export function newCampaign(): CampaignState {
  return {
    version: 3,
    nodeId: CAMPAIGN_NODES[0].id,
    roster: PLAYER_OFFICER_IDS.map((officerId) => ({
      officerId,
      level: OFFICERS[officerId].level,
      exp: 0,
      // 원작 디테일: 장수는 합류 시 병과 기본 무기를 장착하고 온다 (조조 = 의천검) — 전부 Lv1 인스턴스
      equipment: toEquipmentMap(OFFICERS[officerId].initialEquipment),
      statBonus: {},
    })),
    clearedStages: [],
    gold: INITIAL_GOLD,
    inventory: [],
    fruits: [],
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
 * battle 노드나 막다른 노드에서 호출되면 아무 일도 하지 않고 원본을 그대로 돌려준다.
 */
export function completeStory(campaign: CampaignState): CampaignState {
  const node = currentNode(campaign)
  if (!node || node.type !== 'story' || node.next === null) return campaign
  return {
    version: 3,
    nodeId: node.next,
    roster: campaign.roster.map(cloneEntry),
    clearedStages: [...campaign.clearedStages],
    gold: campaign.gold,
    inventory: cloneInventory(campaign.inventory),
    fruits: [...campaign.fruits],
  }
}

const cloneEntry = (entry: RosterEntry): RosterEntry => ({
  ...entry,
  equipment: toEquipmentMap(entry.equipment),
  statBonus: { ...entry.statBonus },
})

const cloneInventory = (inventory: EquipInstance[]): EquipInstance[] => inventory.map((i) => ({ ...i }))

/** 마지막 노드의 전투까지 클리어한 상태 */
export function isCampaignFinished(campaign: CampaignState): boolean {
  const node = currentNode(campaign)
  return (
    node !== null && node.type === 'battle' && node.next === null && campaign.clearedStages.includes(node.stageId)
  )
}

/** 전투 상태에 붙어 있는 스테이지 정의 (attachStage) → 없으면 id로 조회 */
function stageOfBattle(battleState: BattleState): StageDef | undefined {
  return battleState.__stage ?? STAGES.find((s) => s.id === battleState.stageId)
}

/**
 * 전리품 판정 — 원작 "승리 후 지급" 단계에 대응 (docs/research/campaign-ux.md 1부 §3).
 * victory  = 승리했으면 무조건 (applyVictory가 곧 승리 시점)
 * bossKill = isBoss 유닛이 존재하고 전부 격파됐을 때 (N턴 방어로 이긴 경우엔 안 나온다)
 */
function lootFor(battleState: BattleState): string[] {
  const stage = stageOfBattle(battleState)
  if (!stage?.loot) return []
  const bosses = battleState.units.filter((u) => u.isBoss)
  const bossKilled = bosses.length > 0 && bosses.every((u) => u.hp <= 0)
  return stage.loot
    .filter((entry) => (entry.trigger === 'bossKill' ? bossKilled : true))
    .filter((entry) => EQUIPMENT[entry.itemId] !== undefined) // 오타/삭제된 id는 무시
    .map((entry) => entry.itemId)
}

/**
 * 승리 반영: 전투 중 성장을 로스터로 회수하고, 보상금·전리품을 챙기고 다음 노드로 진행 (원본 불변).
 * 퇴각(hp<=0)한 부대도 포함 — 원작 규칙상 퇴각은 사망이 아니고 획득 경험치도 유지된다.
 */
export function applyVictory(campaign: CampaignState, battleState: BattleState): CampaignState {
  // 무구성장도 함께 회수한다 — 전투 중 오른 장비 레벨/경험치는 로스터 쪽 인스턴스가 정본이 된다.
  const grown = new Map<string, { level: number; exp: number; equipment: EquipmentMap }>()
  for (const unit of battleState.units) {
    if (unit.faction !== 'player') continue
    grown.set(unit.officerId, { level: unit.level, exp: unit.exp, equipment: toEquipmentMap(unit.equipment) })
  }

  const node = currentNode(campaign)
  const clearedStages = campaign.clearedStages.includes(battleState.stageId)
    ? [...campaign.clearedStages]
    : [...campaign.clearedStages, battleState.stageId]

  return {
    version: 3,
    // 마지막 노드면 제자리에 머문다 (isCampaignFinished로 판별)
    nodeId: node?.next ?? campaign.nodeId,
    roster: campaign.roster.map((entry) => {
      const after = grown.get(entry.officerId)
      // 출진하지 않은 부대는 로스터 값 그대로. 출진했다면 레벨/경험치 + 장비 인스턴스를 회수한다.
      return after
        ? { ...cloneEntry(entry), level: after.level, exp: after.exp, equipment: after.equipment }
        : cloneEntry(entry)
    }),
    clearedStages,
    gold: campaign.gold + (node?.type === 'battle' ? node.rewardGold : 0),
    inventory: [...cloneInventory(campaign.inventory), ...lootFor(battleState).map(toEquipInstance)],
    fruits: [...campaign.fruits],
  }
}

// ---------- 장비 장착 / 상점 (모두 불변, 실패 시 원본 그대로 반환) ----------

/** 창고에서 인덱스 1개를 제거한 새 배열 (범위 밖이면 null) */
function removeAt<T>(list: T[], index: number): T[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return null
  return [...list.slice(0, index), ...list.slice(index + 1)]
}

/**
 * 병과별 착용 가능 판정 (원작: 무기 카테고리는 병과 1:1 — equipment.md §5).
 * classes 미지정 장비는 전 병과 착용 가능.
 */
export function canEquip(officerId: string, itemId: string): boolean {
  const item = EQUIPMENT[itemId]
  const officer = OFFICERS[officerId]
  if (!item || !officer) return false
  return !item.classes || item.classes.includes(officer.classId)
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
  if (!campaign.roster.some((r) => r.officerId === officerId)) return campaign
  if (!canEquip(officerId, instance.itemId)) return campaign
  const rest = removeAt(campaign.inventory, inventoryIndex)
  if (!rest) return campaign

  const previous = campaign.roster.find((r) => r.officerId === officerId)!.equipment[item.slot]
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
 * 그 외에는 기본가의 반값 골드 — 레벨이 올라도 판매가는 오르지 않는다(만렙 판매의 유일한 보상이 열매).
 * 보물은 판매 불가 (원작: 영걸전은 가능, 조조전은 불가). 장착 중인 장비는 창고에 없으니 자연히 팔리지 않는다.
 */
export function sellItem(campaign: CampaignState, inventoryIndex: number): CampaignState {
  const instance = campaign.inventory[inventoryIndex]
  if (!instance) return campaign
  const item = EQUIPMENT[instance.itemId]
  if (!item || item.isTreasure || item.price === null) return campaign
  const rest = removeAt(campaign.inventory, inventoryIndex)
  if (!rest) return campaign

  const fruitId = item.tier === 3 && instance.level >= EQUIP_MAX_LEVEL_NORMAL ? FRUIT_ON_SELL[item.id] : undefined
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold + (fruitId ? 0 : Math.trunc(item.price / 2)),
    inventory: cloneInventory(rest),
    fruits: fruitId ? [...campaign.fruits, fruitId] : [...campaign.fruits],
  }
}

/**
 * 열매 사용 — 능력치 열매는 장수 능력치 +2(부대 능력치로는 +1), 경험의 열매는 부대 경험치 +50.
 * 경험의 열매는 applyExp를 그대로 재사용하므로 레벨업까지 일어난다.
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
        const progress = applyExp(entry.level, entry.exp, FRUIT_EXP_AMOUNT)
        return { ...clone, level: progress.level, exp: progress.exp }
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
