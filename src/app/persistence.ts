// 세이브 계층 — IndexedDB 본체 + localStorage 메타 미러 (docs/research/campaign-ux.md 2부 §4).
// 메타를 따로 미러하는 이유: 타이틀 화면이 await 없이 "이어하기" 활성 여부를 즉시 판단해야 함.
// 브라우저 API는 전부 함수 안에서 지연 접근 — 노드/vitest에서 import만으로 죽지 않게 한다.

import { openDB, type IDBPDatabase } from 'idb'
import type { CampaignState, RosterEntry } from '../core/campaign'
import { canEquip, currentNode, INITIAL_GOLD } from '../core/campaign'
import type { EquipInstance, EquipmentMap, EquipSlot, OfficerStats } from '../core/types'
import { EQUIP_EXP_PER_LEVEL, EQUIP_MAX_LEVEL_NORMAL, EQUIP_MAX_LEVEL_TREASURE } from '../core/types'
import { EQUIPMENT } from '../data/equipment'
import { STAGES } from '../data/stages'

export interface SaveMeta {
  nodeId: string
  stageName: string
  savedAt: number
}

const DB_NAME = 'ekd5'
const DB_VERSION = 1
const STORE = 'saves'
const AUTO_SLOT = 'auto'
const META_KEY = 'ekd5:save:meta'

let dbPromise: Promise<IDBPDatabase> | null = null
let persistenceRequested = false

function db(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(instance) {
      if (!instance.objectStoreNames.contains(STORE)) instance.createObjectStore(STORE)
    },
  })
  return dbPromise
}

/** 브라우저 스토리지는 기본 best-effort(LRU 삭제 가능) → 첫 저장 성공 시 1회만 승격 요청 */
function requestPersistence(): void {
  if (persistenceRequested) return
  persistenceRequested = true
  if (typeof navigator === 'undefined') return
  const promise = navigator.storage?.persist?.()
  if (promise) void promise.catch(() => {}) // 결과(승격 여부)는 UI 흐름에 영향 없음
}

const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory']

const STAT_KEYS: (keyof OfficerStats)[] = ['str', 'ldr', 'int', 'agi', 'luck']

/**
 * 장비 1점 정규화 — v2까지는 문자열 id, v3부터는 인스턴스({itemId, level, exp}).
 * 문자열이면 Lv1 인스턴스로 승계한다. 형식이 아예 아니면 null(해당 슬롯/창고 칸만 버린다).
 */
function normalizeInstance(value: unknown): EquipInstance | null {
  if (typeof value === 'string') return { itemId: value, level: 1, exp: 0 }
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.itemId !== 'string') return null
  const def = EQUIPMENT[raw.itemId]
  const max = def ? (def.isTreasure ? EQUIP_MAX_LEVEL_TREASURE : EQUIP_MAX_LEVEL_NORMAL) : EQUIP_MAX_LEVEL_TREASURE
  const level = typeof raw.level === 'number' && Number.isFinite(raw.level) ? Math.trunc(raw.level) : 1
  const exp = typeof raw.exp === 'number' && Number.isFinite(raw.exp) ? Math.trunc(raw.exp) : 0
  return {
    itemId: raw.itemId,
    level: Math.min(Math.max(1, level), max),
    exp: Math.min(Math.max(0, exp), EQUIP_EXP_PER_LEVEL - 1),
  }
}

/**
 * 장비 맵 정규화 — 알려진 슬롯 + 정규화 가능한 값만 남긴다.
 * 미등록 장비 id를 여기서 걸러내지 않는 이유: 데이터 개편으로 사라진 id는 battle/campaign 쪽이
 * 조용히 무시하도록 만들어 뒀고, 세이브를 통째로 거부하는 편이 훨씬 나쁜 결과이기 때문.
 */
function normalizeEquipment(value: unknown): EquipmentMap {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const map: EquipmentMap = {}
  for (const slot of EQUIP_SLOTS) {
    const instance = normalizeInstance(raw[slot])
    if (instance) map[slot] = instance
  }
  return map
}

/** 열매로 오른 능력치 보정 — 유한한 숫자만 남긴다 (v2 이전 세이브에는 없다) */
function normalizeStatBonus(value: unknown): Partial<OfficerStats> {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const bonus: Partial<OfficerStats> = {}
  for (const key of STAT_KEYS) {
    const amount = raw[key]
    if (typeof amount === 'number' && Number.isFinite(amount)) bonus[key] = Math.trunc(amount)
  }
  return bonus
}

/**
 * 저장된 JSON은 신뢰할 수 없다 (수동 편집/구버전) — 구조 검사 후에만 통과.
 * v1(장비/군자금 이전)·v2(무구성장 이전) 세이브는 거부하지 않고 v3로 **승계 마이그레이션**한다:
 *  - v1 → 군자금 = 초기치, 창고 = 빈 목록, 각 부대의 장비 = 빈 슬롯. 성장치(레벨/경험치)는 살린다.
 *  - v2 → 장비/창고의 문자열 id를 Lv1 인스턴스로, 열매 목록·능력치 보정은 빈 값으로 채운다.
 * 병과 착용 제한 정화는 버전과 무관하게 항상 수행한다.
 */
export function validateCampaign(data: unknown): CampaignState | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = data as Record<string, unknown>
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) return null
  const legacy = raw.version === 1 // v1 = 장비/경제 도입 이전
  if (typeof raw.nodeId !== 'string') return null
  if (!Array.isArray(raw.roster) || !Array.isArray(raw.clearedStages)) return null
  if (!raw.clearedStages.every((s) => typeof s === 'string')) return null

  // v2+ 전용 필드 — v1 세이브에는 아예 없으므로 기본값을 채워 승계한다
  let gold = INITIAL_GOLD
  let inventory: EquipInstance[] = []
  if (!legacy) {
    if (typeof raw.gold !== 'number' || !Number.isFinite(raw.gold)) return null
    if (!Array.isArray(raw.inventory)) return null
    const instances = raw.inventory.map(normalizeInstance)
    if (instances.some((i) => i === null)) return null // 창고 칸이 장비도 아니면 세이브가 깨진 것
    gold = raw.gold
    inventory = instances as EquipInstance[]
  }

  // v3 전용 필드 — 없으면 빈 목록으로 승계. 문자열 아닌 항목이 섞이면 깨진 세이브로 본다.
  let fruits: string[] = []
  if (raw.fruits !== undefined) {
    if (!Array.isArray(raw.fruits) || !raw.fruits.every((f) => typeof f === 'string')) return null
    fruits = [...(raw.fruits as string[])]
  }

  const roster: RosterEntry[] = []
  for (const item of raw.roster) {
    if (typeof item !== 'object' || item === null) return null
    const entry = item as Record<string, unknown>
    if (typeof entry.officerId !== 'string') return null
    if (typeof entry.level !== 'number' || !Number.isFinite(entry.level)) return null
    if (typeof entry.exp !== 'number' || !Number.isFinite(entry.exp)) return null
    // 착용 규칙 강화 이전 세이브 정화: 병과 착용 불가 장비(예: 곽가의 목검)는 창고로 되돌린다.
    // 미등록 id는 기존 방침대로 슬롯에 남긴다(읽기 쪽이 조용히 무시).
    const equipment = legacy ? {} : normalizeEquipment(entry.equipment)
    for (const slot of EQUIP_SLOTS) {
      const instance = equipment[slot]
      if (instance && EQUIPMENT[instance.itemId] && !canEquip(entry.officerId, instance.itemId)) {
        delete equipment[slot]
        inventory.push(instance) // 성장분(레벨/경험치)은 잃지 않고 창고로
      }
    }
    roster.push({
      officerId: entry.officerId,
      level: entry.level,
      exp: entry.exp,
      equipment,
      statBonus: normalizeStatBonus(entry.statBonus),
    })
  }

  return {
    version: 3,
    nodeId: raw.nodeId,
    roster,
    clearedStages: raw.clearedStages as string[],
    gold,
    inventory,
    fruits,
  }
}

function stageNameOf(campaign: CampaignState): string {
  const node = currentNode(campaign)
  if (!node) return ''
  if (node.type === 'story') return node.title
  return STAGES.find((s) => s.id === node.stageId)?.name ?? node.stageId
}

function writeMeta(campaign: CampaignState): void {
  if (typeof localStorage === 'undefined') return
  const meta: SaveMeta = { nodeId: campaign.nodeId, stageName: stageNameOf(campaign), savedAt: Date.now() }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // 메타는 부가 정보 — 용량 초과/프라이버시 모드에서 실패해도 본체 저장은 유효
  }
}

export async function saveCampaign(campaign: CampaignState): Promise<void> {
  const handle = db()
  if (!handle) return
  const instance = await handle
  await instance.put(STORE, campaign, AUTO_SLOT)
  writeMeta(campaign)
  requestPersistence()
}

export async function loadCampaign(): Promise<CampaignState | null> {
  const handle = db()
  if (!handle) return null
  const instance = await handle
  return validateCampaign(await instance.get(STORE, AUTO_SLOT))
}

/** 동기 — 타이틀 화면 첫 렌더에서 "이어하기" 표시 판단용 */
export function loadSaveMeta(): SaveMeta | null {
  if (typeof localStorage === 'undefined') return null
  const text = localStorage.getItem(META_KEY)
  if (!text) return null
  try {
    const meta = JSON.parse(text) as Record<string, unknown>
    if (typeof meta.nodeId !== 'string' || typeof meta.stageName !== 'string') return null
    if (typeof meta.savedAt !== 'number') return null
    return { nodeId: meta.nodeId, stageName: meta.stageName, savedAt: meta.savedAt }
  } catch {
    return null
  }
}

export async function clearSave(): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(META_KEY)
  const handle = db()
  if (!handle) return
  const instance = await handle
  await instance.delete(STORE, AUTO_SLOT)
}
