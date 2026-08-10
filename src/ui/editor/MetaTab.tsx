// 탭4 메타 — id/이름/날씨/승리 조건/보너스 경험치/증원/전리품

import type { ReinforcementDef, StageDef, VictoryCondition, Weather } from '../../core/types'
import { CONSUMABLES } from '../../data/consumables'
import { EQUIPMENT } from '../../data/equipment'
import { OFFICERS } from '../../data/officers'
import { CUSTOM_PREFIX } from './draft'
import { Field, NumInput, OfficerSelect, StageUnitFields } from './fields'

interface Props {
  draft: StageDef
  onChange: (next: StageDef) => void
}

const VICTORY_TYPES: VictoryCondition['type'][] = ['annihilation', 'defeatBoss', 'reachPoint', 'surviveTurns']
const VICTORY_LABEL: Record<VictoryCondition['type'], string> = {
  annihilation: '적 전멸',
  defeatBoss: '보스 격파',
  reachPoint: '지점 도달',
  surviveTurns: 'N턴 생존',
}

const LOOT_LABEL = {
  victory: '승리 시',
  bossKill: '보스 격파 시',
  allySurvived: '우군 생존 시',
} as const

function newVictory(type: VictoryCondition['type']): VictoryCondition {
  switch (type) {
    case 'reachPoint':
      return { type, pos: { x: 0, y: 0 } }
    case 'surviveTurns':
      return { type, turns: 8 }
    case 'defeatBoss':
      return { type }
    default:
      return { type: 'annihilation' }
  }
}

export function MetaTab({ draft, onChange }: Props) {
  const victory = draft.victory
  const reinforcements = draft.reinforcements
  const loot = draft.loot ?? []
  const officerIds = [...new Set(draft.units.map((u) => u.officerId))]

  const patchVictory = (i: number, next: VictoryCondition) =>
    onChange({ ...draft, victory: victory.map((v, j) => (j === i ? next : v)) })
  const patchReinforcement = (i: number, next: ReinforcementDef) =>
    onChange({ ...draft, reinforcements: reinforcements.map((r, j) => (j === i ? next : r)) })

  return (
    <div className="ed-tab ed-tab-meta">
      <div className="panel-box">
        <h3>기본 정보</h3>
        <Field label={`스테이지 id (${CUSTOM_PREFIX} 접두 필수)`}>
          <input
            value={draft.id}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const id = raw.startsWith(CUSTOM_PREFIX) ? raw : `${CUSTOM_PREFIX}${raw.replace(/^custom-?/, '')}`
              onChange({ ...draft, id })
            }}
          />
        </Field>
        <Field label="이름">
          <input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="날씨">
          <select value={draft.weather} onChange={(e) => onChange({ ...draft, weather: e.target.value as Weather })}>
            <option value="clear">맑음</option>
            <option value="rain">비 (화계 약화)</option>
          </select>
        </Field>
        <Field label="2차 조건 보너스 경험치">
          <NumInput value={draft.bonusExp} onChange={(bonusExp) => onChange({ ...draft, bonusExp })} min={0} />
        </Field>
      </div>

      <div className="panel-box">
        <h3>승리 조건 ({victory.length})</h3>
        <p className="ed-hint">첫 항목이 1차 조건, 이후는 2차 조건(달성 시 보너스 경험치)입니다.</p>
        {victory.map((v, i) => (
          <div key={i} className="ed-card">
            <div className="ed-row">
              <select value={v.type} onChange={(e) => patchVictory(i, newVictory(e.target.value as typeof v.type))}>
                {VICTORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VICTORY_LABEL[t]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="title-btn ed-mini ed-danger"
                onClick={() => onChange({ ...draft, victory: victory.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
            {v.type === 'reachPoint' && (
              <div className="ed-row">
                <Field label="x">
                  <NumInput value={v.pos.x} onChange={(x) => patchVictory(i, { ...v, pos: { ...v.pos, x: x ?? 0 } })} min={0} />
                </Field>
                <Field label="y">
                  <NumInput value={v.pos.y} onChange={(y) => patchVictory(i, { ...v, pos: { ...v.pos, y: y ?? 0 } })} min={0} />
                </Field>
                <Field label="지정 유닛 (비우면 주인공)">
                  <input
                    value={v.unitId ?? ''}
                    onChange={(e) => patchVictory(i, { ...v, unitId: e.target.value || undefined })}
                  />
                </Field>
              </div>
            )}
            {v.type === 'surviveTurns' && (
              <Field label="턴">
                <NumInput value={v.turns} onChange={(turns) => patchVictory(i, { ...v, turns: turns ?? 1 })} min={1} />
              </Field>
            )}
          </div>
        ))}
        <button
          type="button"
          className="title-btn"
          onClick={() => onChange({ ...draft, victory: [...victory, { type: 'annihilation' }] })}
        >
          + 조건 추가
        </button>
      </div>

      <div className="panel-box">
        <h3>증원 ({reinforcements.length})</h3>
        {reinforcements.map((r, i) => (
          <div key={i} className="ed-card">
            <div className="ed-row">
              <select
                value={r.trigger.type}
                onChange={(e) =>
                  patchReinforcement(i, {
                    ...r,
                    trigger: e.target.value === 'turnStart' ? { type: 'turnStart', turn: 3 } : { type: 'unitDefeated', unitId: '' },
                  })
                }
              >
                <option value="turnStart">턴 시작</option>
                <option value="unitDefeated">유닛 격파</option>
              </select>
              {r.trigger.type === 'turnStart' ? (
                <Field label="턴">
                  <NumInput
                    value={r.trigger.turn}
                    onChange={(turn) => patchReinforcement(i, { ...r, trigger: { type: 'turnStart', turn: turn ?? 1 } })}
                    min={1}
                  />
                </Field>
              ) : (
                <Field label="전투 유닛 id (예: u3_caocao)">
                  <input
                    value={r.trigger.unitId}
                    onChange={(e) =>
                      patchReinforcement(i, { ...r, trigger: { type: 'unitDefeated', unitId: e.target.value } })
                    }
                  />
                </Field>
              )}
              <button
                type="button"
                className="title-btn ed-mini ed-danger"
                onClick={() => onChange({ ...draft, reinforcements: reinforcements.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
            {r.units.map((u, j) => (
              <div key={j} className="ed-card">
                <StageUnitFields
                  unit={u}
                  onChange={(next) => patchReinforcement(i, { ...r, units: r.units.map((x, k) => (k === j ? next : x)) })}
                />
                <button
                  type="button"
                  className="title-btn ed-mini ed-danger"
                  onClick={() => patchReinforcement(i, { ...r, units: r.units.filter((_, k) => k !== j) })}
                >
                  이 증원 유닛 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              className="title-btn"
              onClick={() =>
                patchReinforcement(i, {
                  ...r,
                  units: [...r.units, { officerId: 'yellowInfantry', faction: 'enemy', pos: { x: 0, y: 0 } }],
                })
              }
            >
              + 증원 유닛
            </button>
          </div>
        ))}
        <button
          type="button"
          className="title-btn"
          onClick={() =>
            onChange({
              ...draft,
              reinforcements: [...reinforcements, { trigger: { type: 'turnStart', turn: 3 }, units: [] }],
            })
          }
        >
          + 증원 추가
        </button>
      </div>

      <div className="panel-box">
        <h3>전리품 ({loot.length})</h3>
        {loot.map((entry, i) => {
          const patch = (next: (typeof loot)[number]) =>
            onChange({ ...draft, loot: loot.map((l, j) => (j === i ? next : l)) })
          return (
            <div key={i} className="ed-card">
              <div className="ed-row">
                <select
                  value={entry.trigger}
                  onChange={(e) => patch({ ...entry, trigger: e.target.value as keyof typeof LOOT_LABEL })}
                >
                  {(Object.keys(LOOT_LABEL) as (keyof typeof LOOT_LABEL)[]).map((t) => (
                    <option key={t} value={t}>
                      {LOOT_LABEL[t]}
                    </option>
                  ))}
                </select>
                <select value={entry.itemId} onChange={(e) => patch({ ...entry, itemId: e.target.value })}>
                  <optgroup label="장비">
                    {Object.values(EQUIPMENT).map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="도구">
                    {Object.values(CONSUMABLES).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button
                  type="button"
                  className="title-btn ed-mini ed-danger"
                  onClick={() => onChange({ ...draft, loot: loot.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
              {entry.trigger === 'allySurvived' && (
                <Field label="생존해야 하는 우군">
                  <OfficerSelect
                    value={entry.officerId ?? null}
                    ids={officerIds}
                    narrationLabel="— 선택 —"
                    onChange={(officerId) => patch({ ...entry, officerId: officerId ?? undefined })}
                  />
                </Field>
              )}
            </div>
          )
        })}
        <button
          type="button"
          className="title-btn"
          onClick={() =>
            onChange({
              ...draft,
              loot: [...loot, { trigger: 'victory', itemId: Object.keys(EQUIPMENT)[0] ?? '' }],
            })
          }
        >
          + 전리품 추가
        </button>
        <p className="ed-hint">
          우군 생존 보상은 지정 장수({officerIds.map((id) => OFFICERS[id]?.name ?? id).slice(0, 3).join(', ')}…)가
          승리 시 살아 있어야 지급됩니다.
        </p>
      </div>
    </div>
  )
}
