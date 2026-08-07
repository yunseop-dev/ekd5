// 캠페인 진행 상태 — 전투 사이에 남는 유일한 데이터 (docs/research/campaign-ux.md)
// core/ 규칙: 렌더러/브라우저 의존성 금지. 순수 TS + 데이터 참조만.

import { OFFICERS } from '../data/officers'
import { STAGES } from '../data/stages'
import type { BattleState, StageDef } from './types'

/** 로스터 1명 = 전투 사이로 이월되는 성장치 전부 (HP/MP는 레벨에서 재계산) */
export interface RosterEntry {
  officerId: string
  level: number
  exp: number
}

export type CampaignNode =
  | { id: string; type: 'battle'; stageId: string; next: string | null }
  | { id: string; type: 'story'; title: string; scriptId: string; next: string | null }

export interface CampaignState {
  version: 1
  nodeId: string
  roster: RosterEntry[]
  clearedStages: string[]
}

// 원작은 story|battle 노드의 조건부 DAG — 전투 없는 노드, 전투 뒤 후속 노드,
// 선택지/클리어 방식에 따른 스테이지 스킵이 존재한다 (campaign-ux.md 1부 §3.3).
// v0.4는 story↔battle 교대 선형 체인까지. 분기/스킵은 next를 조건부로 바꿔 얹는다.
// battle 노드 id(n01/n02)는 v0.3 세이브 호환을 위해 유지한다.
export const CAMPAIGN_NODES: CampaignNode[] = [
  { id: 's00', type: 'story', title: '의용군 결성', scriptId: 'intro', next: 'n01' },
  { id: 'n01', type: 'battle', stageId: 'stage01', next: 's01' },
  { id: 's01', type: 'story', title: '관문을 지켜라', scriptId: 'afterStage01', next: 'n02' },
  { id: 'n02', type: 'battle', stageId: 'stage02', next: 's02' },
  { id: 's02', type: 'story', title: '황건 본진', scriptId: 'afterStage02', next: 'n03' },
  { id: 'n03', type: 'battle', stageId: 'stage03', next: null },
]

/** 초기 로스터 — 서장 클리어 후 6명 일괄 합류 커브를 압축한 구성 (campaign-ux.md 1부 §7) */
export const PLAYER_OFFICER_IDS = ['caocao', 'xiahoudun', 'dianwei', 'xiahouyuan', 'guojia', 'xunyu']

export function newCampaign(): CampaignState {
  return {
    version: 1,
    nodeId: CAMPAIGN_NODES[0].id,
    roster: PLAYER_OFFICER_IDS.map((officerId) => ({
      officerId,
      level: OFFICERS[officerId].level,
      exp: 0,
    })),
    clearedStages: [],
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
    version: 1,
    nodeId: node.next,
    roster: campaign.roster.map((entry) => ({ ...entry })),
    clearedStages: [...campaign.clearedStages],
  }
}

/** 마지막 노드의 전투까지 클리어한 상태 */
export function isCampaignFinished(campaign: CampaignState): boolean {
  const node = currentNode(campaign)
  return (
    node !== null && node.type === 'battle' && node.next === null && campaign.clearedStages.includes(node.stageId)
  )
}

/**
 * 승리 반영: 전투 중 성장을 로스터로 회수하고 다음 노드로 진행 (원본 불변).
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
    version: 1,
    // 마지막 노드면 제자리에 머문다 (isCampaignFinished로 판별)
    nodeId: node?.next ?? campaign.nodeId,
    roster: campaign.roster.map((entry) => {
      const after = grown.get(entry.officerId)
      return after ? { officerId: entry.officerId, level: after.level, exp: after.exp } : { ...entry }
    }),
    clearedStages,
  }
}

export interface GrowthRow {
  officerId: string
  levelBefore: number
  levelAfter: number
  expBefore: number
  expAfter: number
}

/** 승리 결산 UI용 성장 요약 — 레벨업한 부대를 위로 정렬 (campaign-ux.md 2부 §2) */
export function growthSummary(before: RosterEntry[], after: RosterEntry[]): GrowthRow[] {
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
