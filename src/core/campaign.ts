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

export type CampaignNode = {
  id: string
  type: 'battle'
  stageId: string
  next: string | null
}

export interface CampaignState {
  version: 1
  nodeId: string
  roster: RosterEntry[]
  clearedStages: string[]
}

// 원작은 story|battle 노드의 조건부 DAG — 전투 없는 노드, 전투 뒤 후속 노드,
// 선택지/클리어 방식에 따른 스테이지 스킵이 존재한다 (campaign-ux.md 1부 §3).
// v0.3은 battle 노드 선형 체인만 구현하고, story 노드와 분기는 노드 타입 확장으로 얹는다.
export const CAMPAIGN_NODES: CampaignNode[] = [
  { id: 'n01', type: 'battle', stageId: 'stage01', next: 'n02' },
  { id: 'n02', type: 'battle', stageId: 'stage02', next: null },
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

export function stageForNode(node: CampaignNode): StageDef {
  const stage = STAGES.find((s) => s.id === node.stageId)
  if (!stage) throw new Error(`알 수 없는 스테이지: ${node.stageId}`)
  return stage
}

/** 마지막 노드의 전투까지 클리어한 상태 */
export function isCampaignFinished(campaign: CampaignState): boolean {
  const node = currentNode(campaign)
  return node !== null && node.next === null && campaign.clearedStages.includes(node.stageId)
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
