/**
 * 한국어 조사 선택 — UI 문장 조립의 단일 출처.
 *
 * 원작 한국어판은 「~을(를)」 같은 병기 표기를 쓰지 않고 받침에 맞는 조사를 골라 쓴다.
 * 화면마다 같은 규칙을 다시 쓰지 않도록 여기 모아 둔다 (전투 정보 패널·이벤트 오버레이 공용).
 *
 * 판정 기준은 **마지막 글자의 종성(받침)** 하나뿐이다. 한글이 아닌 글자(숫자·라틴·한자)로
 * 끝나면 받침 없음으로 취급한다 — 데이터가 전부 한글 이름이라 실제로 걸리지 않는 폴백이다.
 */

/** 마지막 글자의 종성 코드(0 = 받침 없음). 한글 음절이 아니면 null */
function jongseong(word: string): number | null {
  if (word.length === 0) return null
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return null
  return code % 28
}

/** 받침이 있는가 (한글이 아니면 false) */
function hasJong(word: string): boolean {
  const jong = jongseong(word)
  return jong !== null && jong !== 0
}

/**
 * 로 / 으로 — "중기병으로" / "군사로".
 * ㄹ 받침(종성 8)은 예외적으로 '로'를 쓴다 ("장달로", "관철로").
 */
export function euroRo(word: string): string {
  const jong = jongseong(word) ?? 0
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`
}

/** 을 / 를 — "적장을" / "군사를" */
export function eulReul(word: string): string {
  return `${word}${hasJong(word) ? '을' : '를'}`
}

/** 이 / 가 — "관우가" / "장합이" */
export function iGa(word: string): string {
  return `${word}${hasJong(word) ? '이' : '가'}`
}
