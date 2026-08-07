// 캠페인 진행 상태 — 전투 사이에 남는 유일한 데이터 (docs/research/campaign-ux.md)
// core/ 규칙: 렌더러/브라우저 의존성 금지. 순수 TS + 데이터 참조만.

import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
// (착용 제한 판정은 OFFICERS.classId만으로 충분 — CLASSES 참조 불필요)
import type { BattleState, EquipmentMap, EquipSlot, StageDef } from './types'

/** 로스터 1명 = 전투 사이로 이월되는 성장치 전부 (HP/MP는 레벨에서 재계산) */
export interface RosterEntry {
  officerId: string
  level: number
  exp: number
  equipment: EquipmentMap
}

export type CampaignNode =
  // rewardGold: 승리 시 지급되는 군자금. 원작은 전투별 보상금이 데이터로 박혀 있다.
  | { id: string; type: 'battle'; stageId: string; rewardGold: number; next: string | null }
  | { id: string; type: 'story'; title: string; scriptId: string; next: string | null }

export interface CampaignState {
  version: 2
  nodeId: string
  roster: RosterEntry[]
  clearedStages: string[]
  /** 군자금 — 상점 매매의 유일한 자원 */
  gold: number
  /** 창고 — 장착되지 않은 장비 id 목록 (중복 허용) */
  inventory: string[]
}

/** 초기 군자금 — 서장 1단계 상점에서 tier1 장비 1~2점을 살 수 있는 수준 (설계값) */
export const INITIAL_GOLD = 500

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
    version: 2,
    nodeId: CAMPAIGN_NODES[0].id,
    roster: PLAYER_OFFICER_IDS.map((officerId) => ({
      officerId,
      level: OFFICERS[officerId].level,
      exp: 0,
      // 원작 디테일: 장수는 합류 시 병과 기본 무기를 장착하고 온다 (조조 = 의천검)
      equipment: { ...(OFFICERS[officerId].initialEquipment ?? {}) },
    })),
    clearedStages: [],
    gold: INITIAL_GOLD,
    inventory: [],
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
    version: 2,
    nodeId: node.next,
    roster: campaign.roster.map(cloneEntry),
    clearedStages: [...campaign.clearedStages],
    gold: campaign.gold,
    inventory: [...campaign.inventory],
  }
}

const cloneEntry = (entry: RosterEntry): RosterEntry => ({ ...entry, equipment: { ...entry.equipment } })

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
  const grown = new Map<string, { level: number; exp: number }>()
  for (const unit of battleState.units) {
    if (unit.faction !== 'player') continue
    grown.set(unit.officerId, { level: unit.level, exp: unit.exp })
  }

  const node = currentNode(campaign)
  const clearedStages = campaign.clearedStages.includes(battleState.stageId)
    ? [...campaign.clearedStages]
    : [...campaign.clearedStages, battleState.stageId]

  return {
    version: 2,
    // 마지막 노드면 제자리에 머문다 (isCampaignFinished로 판별)
    nodeId: node?.next ?? campaign.nodeId,
    roster: campaign.roster.map((entry) => {
      const after = grown.get(entry.officerId)
      // 장비는 전투로 변하지 않으므로 로스터 쪽 값을 그대로 유지한다
      return after ? { ...cloneEntry(entry), level: after.level, exp: after.exp } : cloneEntry(entry)
    }),
    clearedStages,
    gold: campaign.gold + (node?.type === 'battle' ? node.rewardGold : 0),
    inventory: [...campaign.inventory, ...lootFor(battleState)],
  }
}

// ---------- 장비 장착 / 상점 (모두 불변, 실패 시 원본 그대로 반환) ----------

/** 창고에서 1개만 제거한 새 배열 (없으면 null) */
function removeOne(inventory: string[], itemId: string): string[] | null {
  const idx = inventory.indexOf(itemId)
  if (idx < 0) return null
  return [...inventory.slice(0, idx), ...inventory.slice(idx + 1)]
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
 * 창고의 장비를 장수에게 장착. 같은 슬롯에 이미 장비가 있으면 그것은 창고로 돌아간다.
 * 창고에 없는 장비 / 없는 장수 / 미등록 id / 병과 착용 불가면 원본을 그대로 반환한다.
 */
export function equipItem(campaign: CampaignState, officerId: string, itemId: string): CampaignState {
  const item = EQUIPMENT[itemId]
  if (!item) return campaign
  if (!campaign.roster.some((r) => r.officerId === officerId)) return campaign
  if (!canEquip(officerId, itemId)) return campaign
  const rest = removeOne(campaign.inventory, itemId)
  if (!rest) return campaign

  const previous = campaign.roster.find((r) => r.officerId === officerId)!.equipment[item.slot]
  return {
    ...campaign,
    roster: campaign.roster.map((entry) =>
      entry.officerId === officerId
        ? { ...entry, equipment: { ...entry.equipment, [item.slot]: itemId } }
        : cloneEntry(entry),
    ),
    inventory: previous ? [...rest, previous] : rest,
  }
}

/** 슬롯을 비우고 장비를 창고로 되돌린다. 빈 슬롯이면 원본 그대로. */
export function unequipItem(campaign: CampaignState, officerId: string, slot: EquipSlot): CampaignState {
  const target = campaign.roster.find((r) => r.officerId === officerId)
  const itemId = target?.equipment[slot]
  if (!itemId) return campaign

  return {
    ...campaign,
    roster: campaign.roster.map((entry) => {
      if (entry.officerId !== officerId) return cloneEntry(entry)
      const equipment = { ...entry.equipment }
      delete equipment[slot]
      return { ...entry, equipment }
    }),
    inventory: [...campaign.inventory, itemId],
  }
}

/**
 * 상점 구매 → 창고로. 비매품(보물, price null)이거나 군자금이 부족하면 원본 그대로.
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
    inventory: [...campaign.inventory, itemId],
  }
}

/**
 * 창고의 장비를 반값에 판매. 보물은 판매 불가 (원작 규칙: 영걸전은 가능, 조조전은 불가).
 * 창고에 없으면 원본 그대로. 장착 중인 장비는 창고에 없으니 자연히 팔리지 않는다.
 */
export function sellItem(campaign: CampaignState, itemId: string): CampaignState {
  const item = EQUIPMENT[itemId]
  if (!item || item.isTreasure || item.price === null) return campaign
  const rest = removeOne(campaign.inventory, itemId)
  if (!rest) return campaign
  return {
    ...campaign,
    roster: campaign.roster.map(cloneEntry),
    gold: campaign.gold + Math.trunc(item.price / 2),
    inventory: rest,
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
