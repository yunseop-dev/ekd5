// 탭3 이벤트 — 목록 + 폼 편집 + "JSON 소스" 토글 (설계 §6.2)
//
// 폼은 단순 액션(dialogue/buff/setTile/removeUnits/setBehavior/levelUpEnemies/giveItem/giveExp)까지만
// 그린다. choice 중첩 분기·duel·spawnUnits처럼 구조가 깊은 액션은 JSON 소스 모드로 안내한다
// (설계 §10 리스크 5의 안전판 — 폼이 전 액션을 커버하려 들면 범위가 폭발한다).

import { useEffect, useState } from 'react'
import { keyOf } from '../../core/movement'
import type {
  BattleEventDef,
  BuffStat,
  EventAction,
  EventTrigger,
  StageDef,
  StatusId,
  TerrainId,
  Vec2,
} from '../../core/types'
import { CONSUMABLES } from '../../data/consumables'
import { EQUIPMENT } from '../../data/equipment'
import { OFFICERS } from '../../data/officers'
import { STATUSES } from '../../data/statuses'
import { validateStageVerbose } from '../../data/stages/validateStage'
import { TERRAIN } from '../../data/terrain'
import { nextEventId, officerCounts, uniqueOfficerIds } from './draft'
import { EditorGrid, type GridMark } from './EditorGrid'
import { Field, FactionSelect, NumInput, OfficerSelect } from './fields'
import { PALETTE_TERRAINS, stageToJson } from './stageJson'

interface Props {
  draft: StageDef
  onChange: (next: StageDef) => void
}

const TRIGGER_TYPES: EventTrigger['type'][] = [
  'battleStart',
  'turnStart',
  'unitDefeated',
  'unitsMeet',
  'reachArea',
]

const TRIGGER_LABEL: Record<EventTrigger['type'], string> = {
  battleStart: '전투 개시',
  turnStart: '턴 시작 (지정 턴)',
  unitDefeated: '유닛 격파',
  unitsMeet: '두 유닛 인접 (일기토/설전)',
  reachArea: '지정 구역 도달',
}

const ACTION_TYPES: EventAction['type'][] = [
  'dialogue',
  'choice',
  'duel',
  'buff',
  'spawnUnits',
  'removeUnits',
  'inflictStatus',
  'setBehavior',
  'setTile',
  'levelUpEnemies',
  'giveItem',
  'giveExp',
]

const ACTION_LABEL: Record<EventAction['type'], string> = {
  dialogue: '대사',
  choice: '선택지',
  duel: '일기토/설전',
  buff: '버프',
  spawnUnits: '유닛 등장',
  removeUnits: '유닛 이탈',
  inflictStatus: '상태이상 부여',
  setBehavior: 'AI 행동 변경',
  setTile: '지형 변경',
  levelUpEnemies: '적 레벨업',
  giveItem: '아이템 지급',
  giveExp: '경험치 지급',
  giveGold: '군자금 지급',
  setVictory: '승리 조건 변경',
  setDefeat: '패배 조건 변경',
  setHazard: '불길 발생',
  dropItem: '아이템 드랍',
}

/** 폼으로 편집 가능한 액션 — 나머지는 JSON 소스 모드로 안내 */
const FORM_ACTIONS = new Set<EventAction['type']>([
  'dialogue',
  'buff',
  'removeUnits',
  'inflictStatus',
  'setBehavior',
  'setTile',
  'levelUpEnemies',
  'giveItem',
  'giveExp',
])

const BUFF_STATS: BuffStat[] = ['atk', 'def', 'mind', 'agi', 'morale']
const BUFF_LABEL: Record<BuffStat, string> = {
  atk: '공격력',
  def: '방어력',
  mind: '정신력',
  agi: '순발력',
  morale: '사기',
}

function newTrigger(type: EventTrigger['type'], firstIds: string[]): EventTrigger {
  switch (type) {
    case 'turnStart':
      return { type, turn: 2 }
    case 'unitDefeated':
      return { type, officerId: firstIds[0] ?? '' }
    case 'unitsMeet':
      return { type, a: firstIds[0] ?? '', b: firstIds[1] ?? '' }
    case 'reachArea':
      return { type, area: [], faction: 'player' }
    default:
      return { type: 'battleStart' }
  }
}

function newAction(type: EventAction['type'], firstIds: string[]): EventAction {
  switch (type) {
    case 'dialogue':
      return { type, lines: [{ speaker: firstIds[0] ?? null, text: '' }] }
    case 'choice':
      return {
        type,
        prompt: '어떻게 하시겠습니까?',
        speaker: firstIds[0] ?? null,
        options: [
          { text: '선택 1', actions: [] },
          { text: '선택 2', actions: [] },
        ],
      }
    case 'duel':
      return {
        type,
        a: firstIds[0] ?? '',
        b: firstIds[1] ?? '',
        lines: [],
        outcome: { draw: true },
      }
    case 'buff':
      return { type, target: 'playerAll', stat: 'atk', amount: 10, duration: 2 }
    case 'spawnUnits':
      return { type, units: [] }
    case 'removeUnits':
      return { type, officerIds: [] }
    case 'inflictStatus':
      return { type, officerIds: [], status: 'confusion' }
    case 'setBehavior':
      return { type, officerIds: [], behavior: 'pursue' }
    case 'setTile':
      return { type, cells: [], terrain: 'gate' }
    case 'levelUpEnemies':
      return { type, amount: 1 }
    case 'giveItem':
      return { type, itemId: Object.keys(EQUIPMENT)[0] ?? '', kind: 'equipment' }
    default:
      return { type: 'giveExp', target: firstIds[0] ?? '', amount: 50 }
  }
}

export function EventsTab({ draft, onChange }: Props) {
  const events = draft.events ?? []
  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null)
  const [actionIndex, setActionIndex] = useState<number | null>(null)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  const event = events.find((e) => e.id === selectedId)
  const uniqueIds = uniqueOfficerIds(draft)
  const allIds = [...officerCounts(draft).keys()]
  const action = event && actionIndex !== null ? event.actions[actionIndex] : undefined

  // JSON 소스 모드 진입/대상 변경 시 텍스트 재생성
  useEffect(() => {
    if (!jsonMode) return
    const current = (draft.events ?? []).find((e) => e.id === selectedId)
    setJsonText(current ? JSON.stringify(current, null, 2) : '')
    setJsonError(null)
    // draft를 의존성에 넣지 않는다: 폼/텍스트 편집으로 draft가 바뀔 때마다 커서가 튀기 때문
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonMode, selectedId])

  function setEvents(next: BattleEventDef[]) {
    onChange({ ...draft, events: next.length > 0 ? next : undefined })
  }

  function patchEvent(next: BattleEventDef) {
    setEvents(events.map((e) => (e.id === selectedId ? next : e)))
    if (next.id !== selectedId) setSelectedId(next.id)
  }

  function addEvent() {
    const id = nextEventId(draft)
    setEvents([...events, { id, trigger: { type: 'battleStart' }, actions: [] }])
    setSelectedId(id)
    setActionIndex(null)
  }

  function deleteEvent(id: string) {
    setEvents(events.filter((e) => e.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setActionIndex(null)
    }
  }

  function moveEvent(index: number, delta: number) {
    const to = index + delta
    if (to < 0 || to >= events.length) return
    const next = [...events]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    setEvents(next)
  }

  function patchAction(next: EventAction) {
    if (!event || actionIndex === null) return
    patchEvent({ ...event, actions: event.actions.map((a, i) => (i === actionIndex ? next : a)) })
  }

  function moveAction(index: number, delta: number) {
    if (!event) return
    const to = index + delta
    if (to < 0 || to >= event.actions.length) return
    const next = [...event.actions]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    patchEvent({ ...event, actions: next })
    setActionIndex(to)
  }

  // ---------- 좌표 픽커: 활성 대상은 선택된 액션(setTile) > 트리거(reachArea) ----------

  const pickCells: Vec2[] | null =
    action?.type === 'setTile'
      ? action.cells
      : event?.trigger.type === 'reachArea'
        ? event.trigger.area
        : null

  function togglePick(pos: Vec2) {
    if (!event || !pickCells) return
    const at = pickCells.findIndex((c) => c.x === pos.x && c.y === pos.y)
    const cells = at >= 0 ? pickCells.filter((_, i) => i !== at) : [...pickCells, pos]
    if (action?.type === 'setTile') patchAction({ ...action, cells })
    else if (event.trigger.type === 'reachArea') patchEvent({ ...event, trigger: { ...event.trigger, area: cells } })
  }

  const marks = new Map<string, GridMark>()
  for (const u of draft.units) {
    marks.set(keyOf(u.pos), {
      label: (OFFICERS[u.officerId]?.name ?? u.officerId).slice(0, 1),
      className: `ed-mark-${u.faction}`,
    })
  }

  // ---------- JSON 소스 ----------

  function applyJson(text: string) {
    setJsonText(text)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setJsonError(`JSON 문법 오류: ${(e as Error).message}`)
      return
    }
    const id = (parsed as { id?: unknown })?.id
    if (typeof id !== 'string' || id.trim() === '') {
      setJsonError('이벤트에 문자열 id가 필요합니다')
      return
    }
    const candidate: StageDef = {
      ...draft,
      events: events.map((e) => (e.id === selectedId ? (parsed as BattleEventDef) : e)),
    }
    const result = validateStageVerbose(stageToJson(candidate))
    const related = result.errors.filter((msg) => msg.includes(`(${id})`) || msg.includes(`'${id}'`))
    const shown = related.length > 0 ? related : result.errors
    if (shown.length > 0) {
      setJsonError(shown.join('\n'))
      return
    }
    setJsonError(null)
    onChange(candidate)
    if (id !== selectedId) setSelectedId(id)
  }

  return (
    <div className="ed-tab ed-tab-events">
      <div className="panel-box ed-events-list">
        <h3>이벤트 ({events.length})</h3>
        <ul className="ed-list">
          {events.map((e, i) => (
            <li key={e.id} className={e.id === selectedId ? 'ed-selected' : ''}>
              <button
                type="button"
                className="ed-list-main"
                onClick={() => {
                  setSelectedId(e.id)
                  setActionIndex(null)
                }}
              >
                <strong>{e.id}</strong>
                <span className="ed-hint">{TRIGGER_LABEL[e.trigger.type]}</span>
              </button>
              <button type="button" className="title-btn ed-mini" onClick={() => moveEvent(i, -1)}>
                ↑
              </button>
              <button type="button" className="title-btn ed-mini" onClick={() => moveEvent(i, 1)}>
                ↓
              </button>
              <button type="button" className="title-btn ed-mini ed-danger" onClick={() => deleteEvent(e.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="title-btn" onClick={addEvent}>
          + 이벤트 추가
        </button>
      </div>

      <div className="ed-main">
        <p className="ed-hint">
          {pickCells
            ? `좌표 픽커 활성 — 칸을 클릭해 ${action?.type === 'setTile' ? '지형 변경 대상' : '도달 구역'}을 토글합니다 (${pickCells.length}칸 선택됨)`
            : '지형 변경(setTile) 액션이나 구역 도달(reachArea) 트리거를 고르면 이 맵에서 칸을 찍을 수 있습니다.'}
        </p>
        <EditorGrid
          map={draft.map}
          marks={marks}
          picked={pickCells ? new Set(pickCells.map(keyOf)) : undefined}
          onCellDown={togglePick}
        />
      </div>

      <div className="ed-side">
        {!event ? (
          <div className="panel-box">
            <p className="ed-hint">이벤트를 선택하거나 새로 추가하세요.</p>
          </div>
        ) : (
          <>
            <div className="panel-box">
              <div className="ed-row">
                <h3>이벤트 편집</h3>
                <button
                  type="button"
                  className={`title-btn ed-mini${jsonMode ? ' ed-selected' : ''}`}
                  onClick={() => setJsonMode((v) => !v)}
                >
                  JSON 소스
                </button>
              </div>

              {jsonMode ? (
                <>
                  <textarea
                    className="ed-json"
                    spellCheck={false}
                    value={jsonText}
                    onChange={(e) => applyJson(e.target.value)}
                  />
                  {jsonError ? <pre className="ed-error">{jsonError}</pre> : <p className="ed-ok">검증 통과</p>}
                  <p className="ed-hint">
                    중첩 분기(choice), 일기토(duel), 유닛 등장(spawnUnits)은 여기서 편집합니다. 유효한 JSON일
                    때만 반영됩니다.
                  </p>
                </>
              ) : (
                <>
                  <Field label="이벤트 id (스테이지 내 유일)">
                    <input value={event.id} onChange={(e) => patchEvent({ ...event, id: e.target.value })} />
                  </Field>
                  <Field label="트리거">
                    <select
                      value={event.trigger.type}
                      onChange={(e) =>
                        patchEvent({
                          ...event,
                          trigger: newTrigger(e.target.value as EventTrigger['type'], uniqueIds),
                        })
                      }
                    >
                      {TRIGGER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TRIGGER_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <TriggerFields
                    trigger={event.trigger}
                    uniqueIds={uniqueIds}
                    onChange={(trigger) => patchEvent({ ...event, trigger })}
                  />
                </>
              )}
            </div>

            {!jsonMode && (
              <div className="panel-box">
                <h3>액션 ({event.actions.length})</h3>
                <ul className="ed-list">
                  {event.actions.map((a, i) => (
                    <li key={i} className={i === actionIndex ? 'ed-selected' : ''}>
                      <button type="button" className="ed-list-main" onClick={() => setActionIndex(i)}>
                        {i + 1}. {ACTION_LABEL[a.type]}
                        {!FORM_ACTIONS.has(a.type) && <span className="ed-hint"> (JSON)</span>}
                      </button>
                      <button type="button" className="title-btn ed-mini" onClick={() => moveAction(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="title-btn ed-mini" onClick={() => moveAction(i, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="title-btn ed-mini ed-danger"
                        onClick={() => {
                          patchEvent({ ...event, actions: event.actions.filter((_, j) => j !== i) })
                          setActionIndex(null)
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <Field label="액션 추가">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '') return
                      const created = newAction(e.target.value as EventAction['type'], uniqueIds)
                      patchEvent({ ...event, actions: [...event.actions, created] })
                      setActionIndex(event.actions.length)
                    }}
                  >
                    <option value="">— 선택 —</option>
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTION_LABEL[t]}
                        {FORM_ACTIONS.has(t) ? '' : ' (JSON 편집)'}
                      </option>
                    ))}
                  </select>
                </Field>

                {action &&
                  (FORM_ACTIONS.has(action.type) ? (
                    <ActionFields
                      action={action}
                      uniqueIds={uniqueIds}
                      allIds={allIds}
                      onChange={patchAction}
                    />
                  ) : (
                    <p className="ed-warn">
                      {ACTION_LABEL[action.type]} 액션은 구조가 깊어 폼으로 편집하지 않습니다. 위의{' '}
                      <strong>JSON 소스</strong> 버튼으로 전환해 편집하세요.
                    </p>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------- 트리거 필드 ----------

function TriggerFields({
  trigger,
  uniqueIds,
  onChange,
}: {
  trigger: EventTrigger
  uniqueIds: string[]
  onChange: (next: EventTrigger) => void
}) {
  switch (trigger.type) {
    case 'battleStart':
      return <p className="ed-hint">전투 시작 시 1회 발동합니다 (전략 선택은 여기에 choice를 붙입니다).</p>
    case 'turnStart':
      return (
        <Field label="턴">
          <NumInput value={trigger.turn} onChange={(turn) => onChange({ ...trigger, turn: turn ?? 1 })} min={1} />
        </Field>
      )
    case 'unitDefeated':
      return (
        <Field label="격파될 장수">
          <OfficerSelect
            value={trigger.officerId}
            ids={uniqueIds}
            onChange={(officerId) => officerId && onChange({ ...trigger, officerId })}
          />
        </Field>
      )
    case 'unitsMeet':
      return (
        <>
          <Field label="유닛 A">
            <OfficerSelect value={trigger.a} ids={uniqueIds} onChange={(a) => a && onChange({ ...trigger, a })} />
          </Field>
          <Field label="유닛 B">
            <OfficerSelect value={trigger.b} ids={uniqueIds} onChange={(b) => b && onChange({ ...trigger, b })} />
          </Field>
          <p className="ed-hint">인접 8방(체비쇼프 거리 1)에 들어오면 발동합니다.</p>
        </>
      )
    case 'reachArea':
      return (
        <>
          <Field label="진영">
            <FactionSelect value={trigger.faction} onChange={(faction) => onChange({ ...trigger, faction })} />
          </Field>
          <Field label="필요 유닛 수 (기본 1)">
            <NumInput value={trigger.count} onChange={(count) => onChange({ ...trigger, count })} min={1} />
          </Field>
          <p className="ed-hint">구역 {trigger.area.length}칸 — 왼쪽 맵에서 칸을 클릭해 지정합니다.</p>
        </>
      )
  }
}

// ---------- 액션 필드 (단순 액션 전용) ----------

function OfficerChecklist({
  ids,
  selected,
  onChange,
}: {
  ids: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="ed-checklist">
      {ids.map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={(e) => onChange(e.target.checked ? [...selected, id] : selected.filter((x) => x !== id))}
          />
          {OFFICERS[id]?.name ?? id}
        </label>
      ))}
    </div>
  )
}

function ActionFields({
  action,
  uniqueIds,
  allIds,
  onChange,
}: {
  action: EventAction
  uniqueIds: string[]
  allIds: string[]
  onChange: (next: EventAction) => void
}) {
  switch (action.type) {
    case 'dialogue':
      return (
        <div className="ed-lines">
          {action.lines.map((line, i) => (
            <div key={i} className="ed-line">
              <OfficerSelect
                value={line.speaker}
                narrationLabel="내레이션"
                onChange={(speaker) =>
                  onChange({ ...action, lines: action.lines.map((l, j) => (j === i ? { ...l, speaker } : l)) })
                }
              />
              <input
                value={line.text}
                placeholder="대사"
                onChange={(e) =>
                  onChange({
                    ...action,
                    lines: action.lines.map((l, j) => (j === i ? { ...l, text: e.target.value } : l)),
                  })
                }
              />
              <button
                type="button"
                className="title-btn ed-mini ed-danger"
                onClick={() => onChange({ ...action, lines: action.lines.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="title-btn"
            onClick={() => onChange({ ...action, lines: [...action.lines, { speaker: null, text: '' }] })}
          >
            + 대사 줄
          </button>
        </div>
      )
    case 'buff':
      return (
        <>
          <Field label="대상">
            <select
              value={action.target}
              onChange={(e) => onChange({ ...action, target: e.target.value })}
            >
              <option value="playerAll">아군 전체</option>
              {uniqueIds.map((id) => (
                <option key={id} value={id}>
                  {OFFICERS[id]?.name ?? id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="능력치">
            <select value={action.stat} onChange={(e) => onChange({ ...action, stat: e.target.value as BuffStat })}>
              {BUFF_STATS.map((s) => (
                <option key={s} value={s}>
                  {BUFF_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <div className="ed-row">
            <Field label="증감">
              <NumInput value={action.amount} onChange={(amount) => onChange({ ...action, amount: amount ?? 0 })} />
            </Field>
            <Field label="지속 턴">
              <NumInput
                value={action.duration}
                onChange={(duration) => onChange({ ...action, duration: duration ?? 1 })}
                min={1}
              />
            </Field>
          </div>
        </>
      )
    case 'removeUnits':
      return (
        <Field label="이탈시킬 장수">
          <OfficerChecklist
            ids={allIds}
            selected={action.officerIds}
            onChange={(officerIds) => onChange({ ...action, officerIds })}
          />
        </Field>
      )
    case 'inflictStatus':
      return (
        <>
          <Field label="대상 장수 (몹 일괄 지정 가능)">
            <OfficerChecklist
              ids={allIds}
              selected={action.officerIds ?? []}
              onChange={(officerIds) => onChange({ ...action, officerIds })}
            />
          </Field>
          <Field label="상태이상">
            <select
              value={action.status}
              onChange={(e) => onChange({ ...action, status: e.target.value as StatusId })}
            >
              {Object.values(STATUSES).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="ed-hint">명중 판정 없이 확정 부여됩니다 (원작 스크립트 연출).</p>
        </>
      )
    case 'setBehavior':
      return (
        <>
          <Field label="대상 장수 (비우면 적군 전체)">
            <OfficerChecklist
              ids={allIds}
              selected={action.officerIds ?? []}
              onChange={(officerIds) => onChange({ ...action, officerIds })}
            />
          </Field>
          <Field label="변경할 행동">
            <select
              value={action.behavior}
              onChange={(e) => onChange({ ...action, behavior: e.target.value as 'guard' | 'pursue' })}
            >
              <option value="pursue">pursue — 추격</option>
              <option value="guard">guard — 대기</option>
            </select>
          </Field>
        </>
      )
    case 'setTile':
      return (
        <>
          <Field label="바꿀 지형">
            <select
              value={action.terrain}
              onChange={(e) => onChange({ ...action, terrain: e.target.value as TerrainId })}
            >
              {PALETTE_TERRAINS.map((id) => (
                <option key={id} value={id}>
                  {TERRAIN[id].name}
                </option>
              ))}
            </select>
          </Field>
          <p className="ed-hint">대상 {action.cells.length}칸 — 왼쪽 맵에서 클릭해 지정합니다.</p>
        </>
      )
    case 'levelUpEnemies':
      return (
        <>
          <Field label="상승 레벨">
            <NumInput value={action.amount} onChange={(amount) => onChange({ ...action, amount: amount ?? 1 })} min={1} />
          </Field>
          <label className="ed-check">
            <input
              type="checkbox"
              checked={action.officerIds !== undefined}
              onChange={(e) => onChange({ ...action, officerIds: e.target.checked ? [] : undefined })}
            />
            대상을 지정한다 (해제 = 생존 적 전원)
          </label>
          {action.officerIds !== undefined && (
            <OfficerChecklist
              ids={allIds}
              selected={action.officerIds}
              onChange={(officerIds) => onChange({ ...action, officerIds })}
            />
          )}
        </>
      )
    case 'giveItem':
      return (
        <>
          <Field label="종류">
            <select
              value={action.kind}
              onChange={(e) => {
                const kind = e.target.value as 'equipment' | 'consumable'
                const first = kind === 'equipment' ? Object.keys(EQUIPMENT)[0] : Object.keys(CONSUMABLES)[0]
                onChange({ ...action, kind, itemId: first ?? '' })
              }}
            >
              <option value="equipment">장비</option>
              <option value="consumable">도구</option>
            </select>
          </Field>
          <Field label="아이템">
            <select value={action.itemId} onChange={(e) => onChange({ ...action, itemId: e.target.value })}>
              {Object.values(action.kind === 'equipment' ? EQUIPMENT : CONSUMABLES).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="ed-hint">전투 중에는 적재만 하고, 승리 시 캠페인이 회수합니다.</p>
        </>
      )
    case 'giveExp':
      return (
        <>
          <Field label="대상">
            <OfficerSelect
              value={action.target}
              ids={uniqueIds}
              onChange={(target) => target && onChange({ ...action, target })}
            />
          </Field>
          <Field label="경험치">
            <NumInput value={action.amount} onChange={(amount) => onChange({ ...action, amount: amount ?? 0 })} min={0} />
          </Field>
        </>
      )
    default:
      return null
  }
}
