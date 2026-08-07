// 전면 알림 배너 — 페이즈 전환 / 승패 / 공지 공용 슬롯
// (docs/research/campaign-ux.md 2부 §1, Athena Crisis hera/ui/Banner.tsx 실측 스펙)
// 진입 방향 자체가 진영 신호: 아군 좌→우, 적군 우→좌

import { useEffect, useRef, type CSSProperties } from 'react'

export interface BannerProps {
  text: string
  color: 'player' | 'enemy' | 'ally' | 'gold' // gold = 승리/공지
  direction: 'left' | 'right' // 진입 방향 (아군 좌→우, 적 우→좌)
  durationScale?: number // 1 = 보통, 0.25 = 빠름
  onDone: () => void
}

/** 기준 시간 단위 (Athena Crisis AnimationSpeed = 180ms) */
const BASE = 180
const ENTER_MS = Math.round(BASE * 1.2) // ≈220ms
const HOLD_MS = Math.round(BASE * 2.8) // ≈500ms
const EXIT_MS = BASE // 180ms

export function Banner({ text, color, direction, durationScale = 1, onDone }: BannerProps) {
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const enter = ENTER_MS * durationScale
  const hold = HOLD_MS * durationScale
  const exit = EXIT_MS * durationScale

  // onDone 은 정확히 한 번만 (타이머 만료 / 클릭 스킵 경쟁 방지)
  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }

  useEffect(() => {
    const timer = setTimeout(finish, enter + hold + exit)
    return () => clearTimeout(timer)
  }, [enter, hold, exit])

  const style = {
    '--banner-enter': `${enter}ms`,
    '--banner-exit': `${exit}ms`,
    '--banner-out-delay': `${enter + hold}ms`,
  } as CSSProperties

  return (
    <div
      className="banner-overlay"
      style={style}
      onClick={finish}
      onContextMenu={(e) => {
        e.preventDefault()
        finish()
      }}
    >
      <div
        className={`banner-band banner-${color} banner-from-${direction}`}
        role="status"
        aria-live="polite"
      >
        <span className="banner-text">{text}</span>
      </div>
    </div>
  )
}
