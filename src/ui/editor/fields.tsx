// 에디터 공용 입력 조각 — 탭마다 같은 폼(장수/진영/레벨/장비)을 다시 쓰기 때문에 뽑아 둔다.

import type { ReactNode } from 'react'
import type { EquipSlot, Faction, StageUnitDef } from '../../core/types'
import { EQUIPMENT } from '../../data/equipment'
import { OFFICERS } from '../../data/officers'

const FACTION_LABEL: Record<Faction, string> = { player: '아군', enemy: '적', ally: '우군' }
const SLOT_LABEL: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', accessory: '보조구' }
const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory']

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ed-field">
      <span className="ed-field-label">{label}</span>
      {children}
    </label>
  )
}

export function NumInput({
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => {
        const text = e.target.value
        if (text === '') return onChange(undefined)
        const n = Number(text)
        onChange(Number.isFinite(n) ? Math.trunc(n) : undefined)
      }}
    />
  )
}

export function OfficerSelect({
  value,
  onChange,
  ids,
  narrationLabel,
}: {
  value: string | null
  onChange: (id: string | null) => void
  /** 후보 제한 (이벤트 참조는 스테이지 내 유일 장수만) */
  ids?: string[]
  /** 지정 시 "화자 없음(내레이션)" 항목을 추가하고 null을 허용 */
  narrationLabel?: string
}) {
  const list = ids ?? Object.keys(OFFICERS)
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
      {narrationLabel !== undefined && <option value="">{narrationLabel}</option>}
      {narrationLabel === undefined && value !== null && !list.includes(value) && (
        <option value={value}>{value} (목록 밖)</option>
      )}
      {list.map((id) => (
        <option key={id} value={id}>
          {OFFICERS[id]?.name ?? id} ({id})
        </option>
      ))}
    </select>
  )
}

export function FactionSelect({ value, onChange }: { value: Faction; onChange: (f: Faction) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Faction)}>
      {(['player', 'enemy', 'ally'] as Faction[]).map((f) => (
        <option key={f} value={f}>
          {FACTION_LABEL[f]}
        </option>
      ))}
    </select>
  )
}

/** 유닛 1기의 전체 폼 — 유닛 탭(배치)과 메타 탭(증원)이 공유한다 */
export function StageUnitFields({
  unit,
  onChange,
  showPos = true,
}: {
  unit: StageUnitDef
  onChange: (next: StageUnitDef) => void
  showPos?: boolean
}) {
  const patch = (part: Partial<StageUnitDef>) => onChange({ ...unit, ...part })

  return (
    <div className="ed-form">
      <Field label="장수">
        <OfficerSelect value={unit.officerId} onChange={(id) => id && patch({ officerId: id })} />
      </Field>
      <Field label="진영">
        <FactionSelect value={unit.faction} onChange={(faction) => patch({ faction })} />
      </Field>
      {showPos && (
        <div className="ed-row">
          <Field label="x">
            <NumInput value={unit.pos.x} onChange={(x) => patch({ pos: { ...unit.pos, x: x ?? 0 } })} min={0} />
          </Field>
          <Field label="y">
            <NumInput value={unit.pos.y} onChange={(y) => patch({ pos: { ...unit.pos, y: y ?? 0 } })} min={0} />
          </Field>
        </div>
      )}
      <Field label="레벨 (비우면 장수 기본)">
        <NumInput value={unit.level} onChange={(level) => patch({ level })} min={1} placeholder="기본" />
      </Field>
      <Field label="AI 행동">
        <select
          value={unit.behavior ?? ''}
          onChange={(e) =>
            patch({ behavior: e.target.value === '' ? undefined : (e.target.value as 'guard' | 'pursue') })
          }
        >
          <option value="">기본 (추격)</option>
          <option value="pursue">pursue — 추격</option>
          <option value="guard">guard — 사거리 진입까지 대기</option>
        </select>
      </Field>
      <div className="ed-row ed-checks">
        <label>
          <input
            type="checkbox"
            checked={unit.isLeader === true}
            onChange={(e) => patch({ isLeader: e.target.checked || undefined })}
          />
          주인공 (격파 시 패배)
        </label>
        <label>
          <input
            type="checkbox"
            checked={unit.isBoss === true}
            onChange={(e) => patch({ isBoss: e.target.checked || undefined })}
          />
          보스 (defeatBoss 대상)
        </label>
      </div>
      <div className="ed-equip">
        {EQUIP_SLOTS.map((slot) => {
          const current = unit.equipment?.[slot]
          const currentId = typeof current === 'string' ? current : current?.itemId
          return (
            <Field key={slot} label={SLOT_LABEL[slot]}>
              <select
                value={currentId ?? ''}
                onChange={(e) => {
                  const next = { ...(unit.equipment ?? {}) } as Record<string, string>
                  if (e.target.value === '') delete next[slot]
                  else next[slot] = e.target.value
                  patch({ equipment: Object.keys(next).length > 0 ? next : undefined })
                }}
              >
                <option value="">없음 (장수 기본)</option>
                {Object.values(EQUIPMENT)
                  .filter((eq) => eq.slot === slot)
                  .map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
              </select>
            </Field>
          )
        })}
      </div>
    </div>
  )
}
