// 스토리 대화 화면 — 전투 전/후 이벤트 (docs/research/campaign-ux.md 1부 §3 story 노드)
// 클릭 또는 Space/Enter로 한 줄씩 진행, 마지막 줄 이후 onDone. 우상단 건너뛰기 = 즉시 onDone.

import { useEffect, useState } from 'react'
import type { DialogueLine } from '../core/types'
import { OFFICERS } from '../data/officers'
import { CLASS_ICON } from './BattleBoard'
import './campaign.css' // .title-btn 재사용
import './deploy.css'

interface Props {
  title: string
  script: DialogueLine[]
  onDone: () => void
}

export function DialogueScreen({ title, script, onDone }: Props) {
  const [index, setIndex] = useState(0)

  // 스크립트가 교체되면 처음부터
  useEffect(() => {
    setIndex(0)
  }, [script])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Spacebar') return
      e.preventDefault()
      if (index + 1 < script.length) setIndex(index + 1)
      else onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, script.length, onDone])

  function advance() {
    if (index + 1 < script.length) setIndex(index + 1)
    else onDone()
  }

  const line = script[index]
  const officer = line?.speaker ? OFFICERS[line.speaker] : undefined
  const speakerName = officer?.name ?? line?.speaker ?? null
  // 장수 데이터에 없는 화자(병사/사자 등)는 이름 첫 글자로 대체
  const icon = officer ? (CLASS_ICON[officer.classId] ?? '?') : (speakerName?.[0] ?? '?')

  return (
    <div className="dialogue-screen" onClick={advance}>
      <div className="dialogue-top">
        <span className="dialogue-title">{title}</span>
        <span className="dialogue-progress">
          {Math.min(index + 1, script.length)} / {script.length}
        </span>
        <button
          className="title-btn dialogue-skip"
          onClick={(e) => {
            e.stopPropagation()
            onDone()
          }}
        >
          건너뛰기
        </button>
      </div>

      <div className={`dialogue-box${speakerName ? '' : ' narration'}`}>
        {speakerName && (
          <div className="dialogue-portrait-wrap">
            <div className="dialogue-portrait">{icon}</div>
            <div className="dialogue-speaker">{speakerName}</div>
          </div>
        )}
        <p className="dialogue-text">{line?.text ?? ''}</p>
        <span className="dialogue-next">▼</span>
      </div>
    </div>
  )
}
