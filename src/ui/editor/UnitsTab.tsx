// 탭2 유닛 — 셀 클릭 배치/선택 + 사이드 폼, 출진 슬롯 지정 모드, deployMin/Max·forcedOfficers

import { useState } from 'react'
import { keyOf } from '../../core/movement'
import type { Faction, StageDef, StageUnitDef, Vec2 } from '../../core/types'
import { OFFICERS } from '../../data/officers'
import { EditorGrid, type GridMark } from './EditorGrid'
import { Field, FactionSelect, NumInput, OfficerSelect, StageUnitFields } from './fields'

interface Props {
  draft: StageDef
  onChange: (next: StageDef) => void
}

type Mode = 'unit' | 'slots'

export function UnitsTab({ draft, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('unit')
  const [selected, setSelected] = useState<number | null>(null)
  const [newFaction, setNewFaction] = useState<Faction>('enemy')

  const unit = selected !== null ? draft.units[selected] : undefined
  const slots = draft.playerSlots ?? []

  const marks = new Map<string, GridMark>()
  for (const u of draft.units) {
    marks.set(keyOf(u.pos), {
      label: (OFFICERS[u.officerId]?.name ?? u.officerId).slice(0, 1),
      className: `ed-mark-${u.faction}`,
    })
  }
  if (mode === 'slots') {
    slots.forEach((pos, i) => marks.set(keyOf(pos), { label: String(i + 1), className: 'ed-mark-slot' }))
  }

  function handleCell(pos: Vec2) {
    if (mode === 'slots') {
      const at = slots.findIndex((p) => p.x === pos.x && p.y === pos.y)
      const next = at >= 0 ? slots.filter((_, i) => i !== at) : [...slots, pos]
      onChange({ ...draft, playerSlots: next.length > 0 ? next : undefined })
      return
    }
    const at = draft.units.findIndex((u) => u.pos.x === pos.x && u.pos.y === pos.y)
    if (at >= 0) {
      setSelected(at)
      return
    }
    const created: StageUnitDef = { officerId: 'yellowInfantry', faction: newFaction, pos }
    onChange({ ...draft, units: [...draft.units, created] })
    setSelected(draft.units.length)
  }

  function patchUnit(next: StageUnitDef) {
    if (selected === null) return
    onChange({ ...draft, units: draft.units.map((u, i) => (i === selected ? next : u)) })
  }

  function deleteUnit() {
    if (selected === null) return
    onChange({ ...draft, units: draft.units.filter((_, i) => i !== selected) })
    setSelected(null)
  }

  const playerOfficers = [...new Set(draft.units.filter((u) => u.faction === 'player').map((u) => u.officerId))]
  const forced = draft.forcedOfficers ?? []

  return (
    <div className="ed-tab ed-tab-units">
      <div className="ed-main">
        <div className="ed-row ed-modes">
          <button
            type="button"
            className={`title-btn${mode === 'unit' ? ' ed-selected' : ''}`}
            onClick={() => setMode('unit')}
          >
            유닛 배치
          </button>
          <button
            type="button"
            className={`title-btn${mode === 'slots' ? ' ed-selected' : ''}`}
            onClick={() => setMode('slots')}
          >
            출진 슬롯 지정 ({slots.length})
          </button>
          {mode === 'unit' && (
            <Field label="새 유닛 진영">
              <FactionSelect value={newFaction} onChange={setNewFaction} />
            </Field>
          )}
        </div>
        <p className="ed-hint">
          {mode === 'unit'
            ? '빈 칸 클릭 = 유닛 추가, 유닛 클릭 = 선택. 오른쪽 폼에서 수정합니다.'
            : '클릭한 순서가 출진 슬롯 순서(①②③…)입니다. 이미 지정된 칸을 다시 누르면 해제됩니다.'}
        </p>
        <EditorGrid
          map={draft.map}
          marks={marks}
          selectedKey={unit ? keyOf(unit.pos) : null}
          picked={mode === 'slots' ? new Set(slots.map(keyOf)) : undefined}
          onCellDown={handleCell}
        />
      </div>

      <div className="ed-side">
        <div className="panel-box">
          <h3>선택한 유닛</h3>
          {unit ? (
            <>
              <StageUnitFields unit={unit} onChange={patchUnit} />
              <button type="button" className="title-btn ed-danger" onClick={deleteUnit}>
                이 유닛 삭제
              </button>
            </>
          ) : (
            <p className="ed-hint">맵에서 유닛을 고르거나 빈 칸을 클릭해 추가하세요.</p>
          )}
        </div>

        <div className="panel-box">
          <h3>출진 준비</h3>
          <div className="ed-row">
            <Field label="deployMin">
              <NumInput value={draft.deployMin} onChange={(deployMin) => onChange({ ...draft, deployMin })} min={1} />
            </Field>
            <Field label="deployMax">
              <NumInput value={draft.deployMax} onChange={(deployMax) => onChange({ ...draft, deployMax })} min={1} />
            </Field>
          </div>
          <p className="ed-hint">
            출진 슬롯 {slots.length}칸. 비우면 units의 player 배치를 그대로 쓰는 자유 전투 경로가 됩니다.
          </p>
          <h3>강제 출진 (순서 포함)</h3>
          <ol className="ed-list">
            {forced.map((id, i) => (
              <li key={`${id}-${i}`}>
                {OFFICERS[id]?.name ?? id}
                <button
                  type="button"
                  className="title-btn ed-mini"
                  onClick={() => onChange({ ...draft, forcedOfficers: forced.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <Field label="추가">
            <OfficerSelect
              value={null}
              ids={playerOfficers}
              narrationLabel="— 선택 —"
              onChange={(id) => id && onChange({ ...draft, forcedOfficers: [...forced, id] })}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
