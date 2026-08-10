// 앱 내 스테이지 에디터 (개발 모드 전용 진입 — 설계 §6)
//
// 저장은 IndexedDB 'saves' 스토어의 'stage:<id>' 키(DB_VERSION 1 불변), 내보내기는 스테이지 JSON 스키마
// (맵 = 문자 그리드)라서 산출물을 src/data/stages/json/에 그대로 넣을 수 있다.
// MVP 제외: 되돌리기(undo), 캠페인 노드 편집, 밸런스 자동 시뮬 (설계 §6.2 말미).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { StageDef } from '../../core/types'
import { STAGES } from '../../data/stages'
import { validateStageVerbose } from '../../data/stages/validateStage'
import { deleteCustomStage, loadCustomStages, saveCustomStage } from '../../app/persistence'
import '../battle.css'
import '../campaign.css'
import { CUSTOM_PREFIX, forkStage, newDraft } from './draft'
import './editor.css'
import { EventsTab } from './EventsTab'
import { MapTab } from './MapTab'
import { MetaTab } from './MetaTab'
import { stageJsonText, stageToJson } from './stageJson'
import { UnitsTab } from './UnitsTab'

interface Props {
  /** 이어서 편집할 draft (플레이테스트에서 돌아온 경우) */
  initial?: StageDef
  /** 검증을 통과한 스테이지로 즉시 전투 시작 */
  onPlaytest: (stage: StageDef) => void
  /** 나가기 — 현재 draft를 넘겨 App이 보관한다 */
  onExit: (draft: StageDef) => void
}

type Tab = 'map' | 'units' | 'events' | 'meta'

const TAB_LABEL: Record<Tab, string> = { map: '① 맵', units: '② 유닛', events: '③ 이벤트', meta: '④ 메타' }

function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function EditorScreen({ initial, onPlaytest, onExit }: Props) {
  const [draft, setDraft] = useState<StageDef>(() => (initial ? structuredClone(initial) : newDraft()))
  const [tab, setTab] = useState<Tab>('map')
  const [customStages, setCustomStages] = useState<StageDef[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // 검증은 데이터 계층 단일 출처 — 에디터는 오류 문장을 그대로 보여준다
  const parse = useMemo(() => validateStageVerbose(stageToJson(draft)), [draft])
  const savedIds = customStages.map((s) => s.id)

  useEffect(() => {
    void loadCustomStages().then(setCustomStages)
  }, [])

  function replaceDraft(next: StageDef, message: string) {
    setDraft(next)
    setStatus(message)
  }

  function pickSource(value: string) {
    if (value === '') return
    if (value === '__new__') {
      if (!window.confirm('편집 중인 내용을 버리고 새로 만들까요?')) return
      replaceDraft(newDraft(), '새 스테이지를 만들었습니다.')
      return
    }
    const source = STAGES.find((s) => s.id === value) ?? customStages.find((s) => s.id === value)
    if (!source) return
    if (!window.confirm(`편집 중인 내용을 버리고 '${source.name}'을 불러올까요?`)) return
    replaceDraft(forkStage(source), `'${source.name}'을 편집 시작점으로 복제했습니다.`)
  }

  async function save() {
    try {
      await saveCustomStage(draft)
      setCustomStages(await loadCustomStages())
      setStatus(`저장했습니다 — ${draft.id}`)
    } catch (e) {
      setStatus(`저장 실패: ${(e as Error).message}`)
    }
  }

  async function remove() {
    if (!savedIds.includes(draft.id)) return
    if (!window.confirm(`저장된 '${draft.id}'을 삭제할까요? (편집 중인 내용은 남습니다)`)) return
    await deleteCustomStage(draft.id)
    setCustomStages(await loadCustomStages())
    setStatus(`삭제했습니다 — ${draft.id}`)
  }

  function exportJson() {
    const text = stageJsonText(draft)
    downloadJson(`${draft.id || 'custom-stage'}.json`, text)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(
        () => setStatus('JSON을 내려받고 클립보드에도 복사했습니다.'),
        () => setStatus('JSON을 내려받았습니다 (클립보드 복사는 실패).'),
      )
    } else {
      setStatus('JSON을 내려받았습니다.')
    }
  }

  async function importJson(file: File) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch (e) {
      setStatus(`JSON 파싱 실패: ${(e as Error).message}`)
      return
    }
    const result = validateStageVerbose(parsed)
    if (!result.stage) {
      setStatus(`불러오기 실패 — ${result.errors.slice(0, 3).join(' / ')}`)
      return
    }
    replaceDraft(forkStage(result.stage), `'${result.stage.name}'을 불러왔습니다.`)
  }

  function playtest() {
    if (!parse.stage) {
      setStatus('검증 오류를 먼저 고쳐야 플레이테스트할 수 있습니다.')
      return
    }
    onPlaytest(parse.stage)
  }

  return (
    <div className="editor-screen">
      <header className="ed-header">
        <h2>스테이지 에디터</h2>
        {/* 항상 플레이스홀더로 되돌린다 — 같은 항목을 다시 골라 재복제할 수 있어야 한다 */}
        <select className="ed-source" value="" onChange={(e) => pickSource(e.target.value)}>
          <option value="">편집 시작점 선택…</option>
          <option value="__new__">＋ 새로 만들기</option>
          <optgroup label="번들 스테이지 복제">
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </optgroup>
          {customStages.length > 0 && (
            <optgroup label="커스텀 스테이지">
              {customStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <button type="button" className="title-btn" onClick={() => void save()}>
          저장
        </button>
        <button type="button" className="title-btn" onClick={exportJson}>
          JSON 내보내기
        </button>
        <button type="button" className="title-btn" onClick={() => fileInput.current?.click()}>
          불러오기
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importJson(file)
          }}
        />
        <button type="button" className="sortie-btn" disabled={!parse.stage} onClick={playtest}>
          플레이테스트
        </button>
        {savedIds.includes(draft.id) && (
          <button type="button" className="title-btn ed-danger" onClick={() => void remove()}>
            저장 삭제
          </button>
        )}
        <button type="button" className="title-btn" onClick={() => onExit(draft)}>
          ← 나가기
        </button>
      </header>

      <div className="ed-statusbar">
        <span className="ed-id">
          {draft.id} · {draft.name} · {draft.map.width}×{draft.map.height} · 유닛 {draft.units.length}기 · 이벤트{' '}
          {draft.events?.length ?? 0}개
        </span>
        {parse.stage ? (
          <span className="ed-ok">검증 통과</span>
        ) : (
          <span className="ed-error-count">검증 오류 {parse.errors.length}건</span>
        )}
        {status && <span className="ed-status">{status}</span>}
        {!draft.id.startsWith(CUSTOM_PREFIX) && <span className="ed-warn">id에 {CUSTOM_PREFIX} 접두가 필요합니다</span>}
      </div>

      {parse.errors.length > 0 && (
        <ul className="ed-issues">
          {parse.errors.slice(0, 12).map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
          {parse.errors.length > 12 && <li>… 외 {parse.errors.length - 12}건</li>}
        </ul>
      )}

      <nav className="ed-tabs">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`title-btn${tab === t ? ' ed-selected' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === 'map' && <MapTab draft={draft} onChange={setDraft} notify={setStatus} />}
      {tab === 'units' && <UnitsTab draft={draft} onChange={setDraft} />}
      {tab === 'events' && <EventsTab draft={draft} onChange={setDraft} />}
      {tab === 'meta' && <MetaTab draft={draft} onChange={setDraft} />}
    </div>
  )
}
