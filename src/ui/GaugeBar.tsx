// 사실-가상 게이지 (docs/research/campaign-ux.md 1부 §5)
// 합 100 고정 — 왼쪽 파랑=가상(100-gauge), 오른쪽 빨강=사실(gauge).
// 원작 확정: 한쪽이 85 이상이면 열세측(15 이하)이 노란색으로 변해 분기 임박을 알린다.

import './campaign.css'

/** 열세측 노랑 전환 임계 — 우세 85 이상 = 열세 15 이하 */
export const GAUGE_WARN_THRESHOLD = 85

interface Props {
  /** 0~100. 높을수록 사실(빨강), 낮을수록 가상(파랑) */
  gauge: number
}

export function GaugeBar({ gauge }: Props) {
  const fact = Math.max(0, Math.min(100, Math.round(gauge)))
  const fiction = 100 - fact
  // 우세측이 85 이상이면 반대(열세)측만 노랑
  const factWarn = fiction >= GAUGE_WARN_THRESHOLD
  const fictionWarn = fact >= GAUGE_WARN_THRESHOLD

  return (
    <span className="gauge-bar" title={`가상 ${fiction} · 사실 ${fact}`}>
      <span className="gauge-label fiction">가상</span>
      <span
        className="gauge-track"
        role="img"
        aria-label={`사실-가상 게이지 — 가상 ${fiction}, 사실 ${fact}`}
      >
        <span
          className={`gauge-seg fiction${fictionWarn ? ' warn' : ''}`}
          style={{ width: `${fiction}%` }}
        />
        <span
          className={`gauge-seg fact${factWarn ? ' warn' : ''}`}
          style={{ width: `${fact}%` }}
        />
      </span>
      <span className="gauge-label fact">사실</span>
    </span>
  )
}
