// 전투 중 대사 = 맵 위 말풍선 (v1.2, 원작 한국어판 스크린샷 판독)
//
// 원작 확정 사양:
//   · 전투 대사는 전면 화면이 아니라 **전장 위 크림색 말풍선**이다 (맵이 계속 보인다).
//   · 화자 이름은 창 **밖** 좌상단에 파란 글자 — 창 안에 넣지 않는다.
//   · 꼬리 삼각형이 화자 타일을 지목하고, 초상은 화자가 맵 좌/우 어디 있느냐에 따라 좌우로 바뀐다.
//   · 본문은 최대 3줄.
//
// 이 파일은 **표시 전용**이다 — 판정·상태 변화는 전부 코어(events.ts / battle.ts)에 있고,
// 여기서는 좌표 계산과 줄 진행만 한다. 좌표는 BattleBoard와 TILE 상수를 공유한다(단일 출처).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { livingUnits } from '../core/battle'
import type { BattleState, DialogueLine, Vec2 } from '../core/types'
import { OFFICERS } from '../data/officers'
import { CLASS_ICON, TILE } from './BattleBoard'
import './battle.css'

/** 말풍선 폭 상한 — 원작 창은 맵 폭의 절반 남짓이다 */
const MAX_W = 300
/** 창과 화자 타일 사이 간격 (꼬리가 들어가는 자리) */
const GAP = 10
/** 보드 경계 여백 */
const EDGE = 8
/** 꼬리가 창 모서리를 넘지 않게 하는 최소 여백 */
const TAIL_INSET = 14
/** 창 밖 좌상단 이름 라벨이 창 위로 차지하는 높이 */
const NAME_H = 20
/** 타일 중심 오프셋 / 타일 안쪽 높이 (TILE = 44px 타일 + 1px gap) */
const TILE_MID = 22
const TILE_INNER = 44

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** 보드 픽셀 폭 — 마지막 열 뒤에는 gap이 없다 */
export const boardPixelWidth = (cols: number): number => cols * TILE - 1
/** 보드 픽셀 높이 */
export const boardPixelHeight = (rows: number): number => rows * TILE - 1

/** 화자 초상 아이콘 — 병과 한자. 장수 데이터에 없는 화자(병사·사자 등)는 이름 첫 글자 */
function iconOf(officerId: string, displayName: string): string {
  const officer = OFFICERS[officerId]
  if (officer) return CLASS_ICON[officer.classId] ?? '?'
  return displayName[0] ?? '?'
}

interface BubbleProps {
  /** 화자 타일. null = 내레이션 또는 화자가 전장에 없음 → 보드 하단 중앙 폴백(꼬리 없음) */
  anchor: Vec2 | null
  boardW: number
  boardH: number
  speakerName: string | null
  portraitIcon: string | null
  text: string
  onAdvance: () => void
}

export function SpeechBubble({
  anchor,
  boardW,
  boardH,
  speakerName,
  portraitIcon,
  text,
  onAdvance,
}: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  /**
   * 창 높이 실측값. 위로 띄우려면 높이를 먼저 알아야 하는데 본문 줄 수는 폭·글자에 따라 달라진다 —
   * 첫 프레임은 visibility:hidden으로 레이아웃만 잡고, 실측 후 제자리에 드러낸다.
   */
  const [h, setH] = useState(0)

  const w = Math.min(MAX_W, boardW - EDGE * 2)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = el.offsetHeight
    setH((prev) => (prev === next ? prev : next))
  }, [text, w, portraitIcon, speakerName])

  const cols = Math.max(1, Math.round((boardW + 1) / TILE))

  let left: number
  let top: number
  let tailX: number | null = null
  let flipped = false
  let portraitRight = false

  if (anchor) {
    const ax = anchor.x * TILE + TILE_MID // 화자 타일 중심 x
    const ty = anchor.y * TILE // 화자 타일 상단
    const by = ty + TILE_INNER // 화자 타일 하단
    left = clamp(ax - w / 2, EDGE, boardW - w - EDGE)
    // 창이 보드 경계에 밀려도 꼬리는 화자를 계속 지목한다 (창 기준 상대 좌표)
    tailX = clamp(ax - left, TAIL_INSET, w - TAIL_INSET)
    top = ty - h - GAP
    // 이름 라벨 자리까지 못 들어가면 타일 아래로 뒤집는다 (맵 최상단 화자)
    if (top - NAME_H < 4) {
      flipped = true
      top = by + GAP
    }
    portraitRight = anchor.x >= cols / 2
  } else {
    left = Math.max(EDGE, (boardW - w) / 2)
    top = Math.max(NAME_H + 4, boardH - h - GAP)
  }

  const classes = [
    'speech-bubble',
    flipped ? 'flip' : '',
    portraitRight ? 'portrait-right' : '',
    speakerName ? '' : 'narration',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={ref}
      className={classes}
      style={{ left, top, width: w, visibility: h > 0 ? 'visible' : 'hidden' }}
      onClick={(e) => {
        e.stopPropagation()
        onAdvance()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onAdvance()
      }}
    >
      {/* 화자 이름 — 창 밖 좌상단 파란 글자 (원작 확정) */}
      {speakerName && <span className="sb-name">{speakerName}</span>}
      <div className="sb-win">
        <div className="sb-row">
          {portraitIcon && <div className="sb-portrait">{portraitIcon}</div>}
          <p className="sb-text">{text}</p>
        </div>
        <span className="sb-next" aria-hidden="true">
          ▼
        </span>
      </div>
      {tailX !== null && <span className="sb-tail" style={{ left: tailX }} aria-hidden="true" />}
    </div>
  )
}

interface PlayerProps {
  lines: DialogueLine[]
  state: BattleState
  /** 상단 얇은 라벨 — 스테이지 이름 또는 「일기토 · A vs B」 */
  title?: string
  onDone: () => void
}

/**
 * 말풍선 대사 재생기 — 줄마다 화자를 전장 생존 유닛에서 찾아 앵커를 잡는다.
 * 클릭 / Space / Enter / 우클릭으로 한 줄씩 진행하고, 마지막 줄 이후 onDone.
 */
export function BubbleDialoguePlayer({ lines, state, title, onDone }: PlayerProps) {
  const [index, setIndex] = useState(0)

  // 스크립트가 교체되면 처음부터 (EventOverlay가 key로 remount하지만 방어적으로 함께 둔다)
  useEffect(() => {
    setIndex(0)
  }, [lines])

  function advance() {
    if (index + 1 < lines.length) setIndex(index + 1)
    else onDone()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Spacebar') return
      // 건너뛰기 버튼에 포커스가 있으면 브라우저가 그 버튼을 누른다 — 줄 진행까지 겹치지 않는다
      if (document.activeElement instanceof HTMLButtonElement) return
      e.preventDefault()
      if (index + 1 < lines.length) setIndex(index + 1)
      else onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, lines.length, onDone])

  const boardW = boardPixelWidth(state.map.width)
  const boardH = boardPixelHeight(state.map.height)

  const line = lines[index]
  const speakerId = line?.speaker ?? null
  const officer = speakerId ? OFFICERS[speakerId] : undefined
  const speakerName = officer?.name ?? speakerId ?? null
  const portraitIcon = speakerId && speakerName ? iconOf(speakerId, speakerName) : null
  // 화자가 전장에 없으면(등장 전·이탈 후·내레이션) 앵커 없음 → 하단 중앙 폴백
  const unit = speakerId ? livingUnits(state).find((u) => u.officerId === speakerId) : undefined

  return (
    <>
      {/* 보드 전체를 덮는 진행 판정막 — 클릭/우클릭이 곧 「다음」이다 */}
      <div
        className="sb-catcher"
        onClick={advance}
        onContextMenu={(e) => {
          e.preventDefault()
          advance()
        }}
      />
      <div className="sb-topbar">
        {title && <span className="sb-title">{title}</span>}
        <span className="sb-progress">
          {Math.min(index + 1, lines.length)} / {lines.length}
        </span>
        <button
          type="button"
          className="sb-skip"
          onClick={(e) => {
            e.stopPropagation()
            onDone()
          }}
        >
          건너뛰기
        </button>
      </div>
      <SpeechBubble
        anchor={unit ? unit.pos : null}
        boardW={boardW}
        boardH={boardH}
        speakerName={speakerName}
        portraitIcon={portraitIcon}
        text={line?.text ?? ''}
        onAdvance={advance}
      />
    </>
  )
}
