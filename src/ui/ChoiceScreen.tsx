// 선택지 화면 — 원작 조조전 실측 패턴 (docs/research/deploy-dialogue-ux.md §2 / 권고 6)
// 초상 왼쪽 + 번호 옵션 세로 스택 + 선택 항목 전체폭 파란 하이라이트 바(커서 모델).
// 커서 모델: 마우스 호버 = 커서 이동, 클릭 = 확정 / 키보드 ↑↓ = 커서, Enter·Space = 확정.
// 원작은 게이지 증감량을 표시하지 않는다 → gaugeDelta 는 받지도 보여주지도 않는다.

import { useEffect, useState } from 'react'
import { OFFICERS } from '../data/officers'
import { CLASS_ICON } from './BattleBoard'
import './campaign.css'
import './deploy.css' // .dialogue-screen / .dialogue-box 톤 재사용

interface Props {
  title: string
  prompt: string
  /** officerId — DialogueScreen 과 동일하게 병과 아이콘 초상. null 이면 초상 없음 */
  speaker: string | null
  options: { text: string }[]
  onPick: (index: number) => void
}

export function ChoiceScreen({ title, prompt, speaker, options, onPick }: Props) {
  const [cursor, setCursor] = useState(0)

  // 선택지가 교체되면 커서를 처음으로
  useEffect(() => {
    setCursor(0)
  }, [options])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (options.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => (c + 1) % options.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => (c - 1 + options.length) % options.length)
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        onPick(cursor)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, options.length, onPick])

  const officer = speaker ? OFFICERS[speaker] : undefined
  const speakerName = officer?.name ?? speaker ?? null
  // 장수 데이터에 없는 화자(병사/사자 등)는 이름 첫 글자로 대체 — DialogueScreen 과 동일 규칙
  const icon = officer ? (CLASS_ICON[officer.classId] ?? '?') : (speakerName?.[0] ?? '?')

  return (
    <div className="dialogue-screen choice-screen">
      <div className="dialogue-top">
        <span className="dialogue-title">{title}</span>
        <span className="choice-hint">↑↓ 선택 · Enter 결정</span>
      </div>

      <div className="dialogue-box choice-box">
        {speakerName && (
          <div className="dialogue-portrait-wrap">
            <div className="dialogue-portrait">{icon}</div>
            <div className="dialogue-speaker">{speakerName}</div>
          </div>
        )}
        <div className="choice-body">
          <p className="choice-prompt">{prompt}</p>
          <div
            className="choice-options"
            role="listbox"
            aria-label="선택지"
            aria-activedescendant={`choice-opt-${cursor}`}
          >
            {options.map((o, i) => (
              <button
                key={i}
                id={`choice-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === cursor}
                tabIndex={-1}
                className={`choice-option${i === cursor ? ' active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => onPick(i)}
              >
                <span className="choice-num">{i + 1}.</span>
                <span className="choice-option-text">{o.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
