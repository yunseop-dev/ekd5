// 출진 준비 화면 — 원작의 "출진 부대 선택" (docs/research/campaign-ux.md 1부 §2)
// 좌: 로스터(선택 순서 뱃지) / 중앙: 맵 미리보기(출진 슬롯 = 선택 순서) / 우: 출진 카드.
// 강제출진 장수는 자동 선택 + 선두 고정 + 해제 불가.

import { useMemo, useState } from 'react'
import type { RosterEntry } from '../core/campaign'
import { classIdOf } from '../core/campaign'
import { keyOf } from '../core/movement'
import type { StageDef, UnitClassDef } from '../core/types'
import { CLASSES } from '../data/classes'
import { OFFICERS } from '../data/officers'
import { TERRAIN } from '../data/terrain'
import { CLASS_ICON } from './BattleBoard'
// .panel-box(battle.css) / .roster-row·.sortie-btn·.title-btn(campaign.css) 재사용
import './battle.css'
import './campaign.css'
import './deploy.css'

const PREVIEW_TILE = 16

/** ①②③… 최대 20까지. 넘으면 그냥 숫자. */
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
const circled = (n: number): string => (n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : String(n))

type SortMode = 'default' | 'level' | 'class'

const SORT_LABEL: Record<SortMode, string> = {
  default: '기본',
  level: '레벨순',
  class: '병과순',
}

const CLASS_ORDER = Object.keys(CLASSES)

/** 2차 병과(v0.8)는 CLASS_ICON(1차 6종)에 없다 — 같은 계열(category) 아이콘으로 폴백 */
const CATEGORY_ICON: Record<string, string> = {
  lord: '主',
  cavalry: '騎',
  infantry: '步',
  archer: '弓',
  strategist: '策',
  support: '風',
}
const classIcon = (cls: UnitClassDef): string =>
  CLASS_ICON[cls.id] ?? CATEGORY_ICON[cls.category] ?? '?'

interface Props {
  stage: StageDef
  roster: RosterEntry[]
  onConfirm: (deployment: string[]) => void
  onBack: () => void
}

export function DeployScreen({ stage, roster, onConfirm, onBack }: Props) {
  const slots = stage.playerSlots ?? []

  // 강제출진: 스테이지 정의 순서 유지 + 로스터에 실제로 있는 장수만
  const forced = useMemo(
    () => (stage.forcedOfficers ?? []).filter((id) => roster.some((r) => r.officerId === id)),
    [stage.forcedOfficers, roster],
  )

  const max = stage.deployMax ?? (slots.length || roster.length)
  const min = Math.min(stage.deployMin ?? Math.max(1, forced.length), max)

  // 강제 제외한 "직접 고른" 장수들 — 배열 순서 = 선택 순서
  const [picked, setPicked] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('default')
  /**
   * 「슬롯 순번 = 배치 위치」 인과를 보여주는 양방향 하이라이트 (원작 전술의 절반이 이 규칙이다 —
   * 2~3번째 자리는 선봉이라 방어가 높은 장수를 넣는다).
   * 로스터/출진 카드에 올리면 hoverOfficerId, 프리뷰 슬롯에 올리면 hoverSlotIndex 가 선다.
   */
  const [hoverOfficerId, setHoverOfficerId] = useState<string | null>(null)
  const [hoverSlotIndex, setHoverSlotIndex] = useState<number | null>(null)

  const deployment = useMemo(() => [...forced, ...picked.filter((id) => !forced.includes(id))], [forced, picked])

  // v0.8: 표시 병과는 승급 결과(RosterEntry.classId)를 따른다 — OFFICERS.classId 는 원 병과
  const entryById = useMemo(() => new Map(roster.map((r) => [r.officerId, r])), [roster])
  const classOfOfficer = (officerId: string): UnitClassDef | null => {
    const entry = entryById.get(officerId)
    return entry ? (CLASSES[classIdOf(entry)] ?? null) : null
  }

  const orderOf = (officerId: string): number => deployment.indexOf(officerId) + 1 // 0 = 미선택

  function toggle(officerId: string) {
    if (forced.includes(officerId)) return // 잠금 — 해제 불가
    setPicked((prev) => {
      if (prev.includes(officerId)) return prev.filter((id) => id !== officerId)
      if (forced.length + prev.length >= max) return prev // 정원 초과
      return [...prev, officerId]
    })
  }

  /** 우클릭 = 마지막 비강제 선택 해제 */
  function undoLast() {
    setPicked((prev) => prev.slice(0, -1))
  }

  const sortedRoster = useMemo(() => {
    const forcedRows = forced
      .map((id) => roster.find((r) => r.officerId === id))
      .filter((r): r is RosterEntry => !!r)
    const rest = roster.filter((r) => !forced.includes(r.officerId))
    const sorted = [...rest]
    if (sortMode === 'level') {
      sorted.sort((a, b) => b.level - a.level || a.officerId.localeCompare(b.officerId))
    } else if (sortMode === 'class') {
      const rank = (r: RosterEntry) => CLASS_ORDER.indexOf(classIdOf(r))
      sorted.sort((a, b) => rank(a) - rank(b) || b.level - a.level)
    }
    return [...forcedRows, ...sorted]
  }, [roster, forced, sortMode])

  // 맵 미리보기 인덱스
  const slotIndexByCell = useMemo(() => {
    const m = new Map<string, number>()
    slots.forEach((pos, i) => m.set(keyOf(pos), i))
    return m
  }, [slots])

  const enemyCells = useMemo(() => {
    const s = new Set<string>()
    for (const u of stage.units) if (u.faction === 'enemy') s.add(keyOf(u.pos))
    return s
  }, [stage.units])

  /**
   * 지금 강조할 슬롯/장수 — 어느 쪽에서 hover가 들어왔든 같은 한 쌍으로 수렴시킨다.
   * (장수 → 슬롯 / 슬롯 → 장수 양방향이 한 계산으로 처리된다)
   */
  const hoverPairSlot =
    hoverSlotIndex ??
    (hoverOfficerId && deployment.includes(hoverOfficerId) ? deployment.indexOf(hoverOfficerId) : null)
  const hoverPairOfficer =
    hoverOfficerId ?? (hoverSlotIndex === null ? null : (deployment[hoverSlotIndex] ?? null))

  const { width, height, tiles } = stage.map
  const count = deployment.length
  const ok = count >= min && count <= max
  const reason = count < min ? `최소 ${min}부대 필요` : null

  return (
    <div
      className="deploy-screen"
      onContextMenu={(e) => {
        e.preventDefault()
        undoLast()
      }}
    >
      <header className="deploy-header">
        <h2>출진 준비</h2>
        <span className="deploy-stage-name">{stage.name}</span>
        <span className="deploy-hint">
          클릭 = 선택/해제 · 슬롯 클릭 = 해제 · 우클릭 = 마지막 선택 해제
        </span>
      </header>

      <div className="deploy-grid">
        {/* ① 로스터 */}
        <section className="panel-box deploy-roster">
          <h3>부대 ({roster.length})</h3>
          <div className="sort-tabs">
            {(['default', 'level', 'class'] as SortMode[]).map((mode) => (
              <button
                key={mode}
                className={`sort-tab${sortMode === mode ? ' active' : ''}`}
                onClick={() => setSortMode(mode)}
              >
                {SORT_LABEL[mode]}
              </button>
            ))}
          </div>
          <div className="roster-list">
            {sortedRoster.map((r) => {
              const officer = OFFICERS[r.officerId]
              const cls = CLASSES[classIdOf(r)]
              const order = orderOf(r.officerId)
              const isForced = forced.includes(r.officerId)
              return (
                <button
                  key={r.officerId}
                  className={[
                    'roster-row',
                    'deploy-row',
                    order > 0 ? 'selected' : '',
                    isForced ? 'locked' : '',
                    hoverPairOfficer === r.officerId ? 'hover-linked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggle(r.officerId)}
                  onMouseEnter={() => setHoverOfficerId(r.officerId)}
                  onMouseLeave={() => setHoverOfficerId(null)}
                  title={
                    isForced
                      ? '강제 출진 — 해제할 수 없습니다'
                      : order > 0
                        ? `출진 슬롯 ${order} — 클릭하면 해제`
                        : undefined
                  }
                >
                  <span className="roster-icon f-player">{classIcon(cls)}</span>
                  <span className="roster-name">{officer.name}</span>
                  <span className={`roster-class${cls.tier > 1 ? ' promoted' : ''}`}>{cls.name}</span>
                  <span className="roster-level">Lv {r.level}</span>
                  <span className="deploy-badge">
                    {order > 0 ? circled(order) : ''}
                    {isForced ? <span className="lock-mark">🔒</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ② 맵 미리보기 */}
        <section className="panel-box deploy-preview">
          <h3>
            배치 미리보기 — {width}×{height}
          </h3>
          <div className="preview-scroll">
            <div
              className="preview-map"
              style={{ gridTemplateColumns: `repeat(${width}, ${PREVIEW_TILE}px)` }}
            >
              {Array.from({ length: height }, (_, y) =>
                Array.from({ length: width }, (_, x) => {
                  const key = keyOf({ x, y })
                  const terrain = TERRAIN[tiles[y][x]]
                  const slotIndex = slotIndexByCell.get(key)
                  const occupantId = slotIndex === undefined ? undefined : deployment[slotIndex]
                  const occupant = occupantId ? OFFICERS[occupantId] : undefined
                  const isLocked = occupantId ? forced.includes(occupantId) : false
                  return (
                    <div
                      key={key}
                      className={[
                        'dp-tile',
                        `dt-${terrain.id}`,
                        // 슬롯 칸에만 hover/클릭 반응을 준다 (일반 지형은 정보 표시뿐)
                        slotIndex === undefined ? '' : 'is-slot',
                        slotIndex !== undefined && slotIndex === hoverPairSlot ? 'slot-hl' : '',
                        occupantId && !isLocked ? 'slot-clickable' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ width: PREVIEW_TILE, height: PREVIEW_TILE }}
                      onMouseEnter={
                        slotIndex === undefined ? undefined : () => setHoverSlotIndex(slotIndex)
                      }
                      onMouseLeave={slotIndex === undefined ? undefined : () => setHoverSlotIndex(null)}
                      // 채워진 슬롯 클릭 = 그 장수 선택 해제 (강제 출진은 잠금 유지)
                      onClick={occupantId ? () => toggle(occupantId) : undefined}
                      title={
                        slotIndex === undefined
                          ? `${terrain.name} (${x},${y})`
                          : occupant
                            ? `출진 슬롯 ${slotIndex + 1} — ${occupant.name}${isLocked ? ' (강제 출진 — 해제 불가)' : ' · 클릭하면 해제'}`
                            : `출진 슬롯 ${slotIndex + 1} — 비어 있음`
                      }
                    >
                      {slotIndex !== undefined && (
                        <span className={`dp-slot${occupant ? ' filled' : ''}`}>
                          {(() => {
                            if (!occupantId || !occupant) return slotIndex + 1
                            const cls = classOfOfficer(occupantId)
                            return cls ? classIcon(cls) : '?'
                          })()}
                        </span>
                      )}
                      {enemyCells.has(key) && <span className="dp-enemy" />}
                    </div>
                  )
                }),
              )}
            </div>
          </div>
          <div className="preview-legend">
            <span>
              <i className="lg-slot filled" /> 배치됨
            </span>
            <span>
              <i className="lg-slot" /> 빈 슬롯
            </span>
            <span>
              <i className="lg-enemy" /> 적 부대
            </span>
          </div>
          {slots.length === 0 && <p className="dim">이 스테이지에는 출진 위치 데이터가 없습니다.</p>}
        </section>

        {/* ③ 출진 카드 */}
        <section className="panel-box deploy-confirm">
          <h3>출진 부대</h3>
          <div className={`deploy-count${ok ? '' : ' bad'}`}>
            출진 {count} / {min === max ? min : `${min}~${max}`}
          </div>
          {/* 순번이 곧 맵 위치라는 사실 — 원작 전술의 절반이 여기서 결정된다 */}
          <p className="deploy-vanguard-hint">앞 순번이 최전선에 섭니다</p>
          <ol className="deploy-order">
            {deployment.map((id, i) => (
              <li
                key={id}
                className={hoverPairOfficer === id ? 'hover-linked' : undefined}
                onMouseEnter={() => setHoverOfficerId(id)}
                onMouseLeave={() => setHoverOfficerId(null)}
                title={`출진 슬롯 ${i + 1} — 미리보기에서 위치를 확인하세요`}
              >
                <span className="deploy-order-no">{circled(i + 1)}</span>
                {OFFICERS[id].name}
                {(() => {
                  const cls = classOfOfficer(id)
                  return (
                    <span className={`roster-class${cls && cls.tier > 1 ? ' promoted' : ''}`}>
                      {' '}
                      {cls?.name ?? ''}
                    </span>
                  )
                })()}
                {forced.includes(id) && <span className="lock-mark">🔒</span>}
              </li>
            ))}
            {count === 0 && <li className="dim">선택된 부대가 없습니다.</li>}
          </ol>
          {reason && <p className="deploy-reason">{reason}</p>}
          {count >= max && <p className="dim">정원이 모두 찼습니다 (최대 {max}부대).</p>}
          <button className="sortie-btn" disabled={!ok} onClick={() => onConfirm(deployment)}>
            출진
          </button>
          <button className="title-btn deploy-back" onClick={onBack}>
            돌아가기
          </button>
        </section>
      </div>
    </div>
  )
}
