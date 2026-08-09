// 스토리 스크립트 — 캠페인 story 노드의 대사 본문.
// 원작 서장 톤: 이동 없는 회의장 + 장수 얼굴 그래픽 + 짧은 대사 4~10마디
// (docs/research/campaign-ux.md 1부 §5, §7). 화자는 OFFICERS 키, null = 내레이션.
// scriptId는 CAMPAIGN_NODES의 story 노드 scriptId와 1:1로 맞춘다.

import type { DialogueLine } from '../core/types'

export const STORY_SCRIPTS: Record<string, DialogueLine[]> = {
  // s00 — 의용군 결성 (개전)
  intro: [
    { speaker: null, text: '중평 원년. 하늘이 어지러워 황건의 무리가 천하를 뒤덮었다.' },
    { speaker: null, text: '조정은 각 주군에 의병을 모으라 명하고, 진류의 조조 또한 격문에 응했다.' },
    { speaker: 'caocao', text: '역적의 무리가 관을 넘본다는데, 관군은 아직도 성문만 지키고 있다.' },
    { speaker: 'xiahoudun', text: '맹덕, 이미 향리의 장정 오천이 모였소. 명만 내리시오.' },
    { speaker: 'caocao', text: '좋다. 원소의 회신을 기다릴 새가 없다. 우리가 먼저 움직인다.' },
    { speaker: 'guojia', text: '적은 수만이라 하나 오합지졸입니다. 강을 등지고 흩어져 있으니 먼저 강가의 선봉을 치십시오.' },
    { speaker: 'dianwei', text: '앞장은 제가 서겠습니다.' },
    { speaker: 'caocao', text: '전군, 출진하라!' },
  ],

  // s01 — 강가 승전 후, 관문 방어 명령
  afterStage01: [
    { speaker: null, text: '강가의 황건 선봉은 무너졌다. 조조의 이름이 처음으로 관군에 알려졌다.' },
    { speaker: 'xiahoudun', text: '적의 시체가 강을 메웠소. 이만하면 첫 싸움치고는 넉넉하지.' },
    { speaker: 'caocao', text: '방심할 것 없다. 선봉이 깨졌다면 본대가 움직인다.' },
    { speaker: null, text: '이윽고 조정의 사자가 격문을 들고 진영에 이르렀다.' },
    { speaker: 'guojia', text: '북쪽 관문을 지키라는 명입니다. 원군은 여드레 뒤에나 닿는다 합니다.' },
    { speaker: 'dianwei', text: '성문은 좁습니다. 제가 문을 막고 서면 열 배라도 들이지 못할 것입니다.' },
    { speaker: 'xunyu', text: '성채 위에 궁병과 책사를 올리십시오. 좁은 곳에 몰아넣고 위에서 치면 됩니다.' },
    { speaker: 'caocao', text: '여드레다. 한 놈도 관을 넘기지 마라.' },
  ],

  // s02 — 황건 본진(장각) 발견과 결전 결의
  afterStage02: [
    { speaker: null, text: '관문은 끝내 열리지 않았다. 황건의 파도는 성벽 앞에서 부서졌다.' },
    { speaker: 'xiahouyuan', text: '패주하는 무리를 쫓다 산길 너머에서 진채를 보았습니다. 깃발이 온통 누렇습니다.' },
    { speaker: 'guojia', text: '본진입니다. 대현량사 장각이 직접 그 성채에 있습니다.' },
    { speaker: 'caocao', text: '장각이라. 요술로 사람을 모아 천하를 어지럽힌 자가 이 산중에 있었군.' },
    { speaker: 'xunyu', text: '길이 하나뿐입니다. 남쪽에서 협곡을 거쳐야 하고, 좌우 산길은 기병이 돌아 나올 수 있습니다.' },
    { speaker: 'xiahoudun', text: '협곡이든 성채든 상관없소. 목을 베면 끝나는 일이오.' },
    { speaker: 'guojia', text: '옳습니다. 졸병은 두어도 좋습니다 — 장각을 베면 무리는 스스로 흩어집니다.' },
    { speaker: 'caocao', text: '이번 싸움으로 황건은 끝난다. 전군, 산을 넘어라!' },
  ],

  // s10 — 제1부 개막. 동탁 전횡과 반동탁 연합 결성
  coalition: [
    { speaker: null, text: '황건이 스러진 자리에, 서량에서 올라온 동탁이 낙양을 틀어쥐었다.' },
    { speaker: null, text: '황제를 갈아치우고 태후를 죽인 그 손에, 조정은 숨소리조차 내지 못했다.' },
    { speaker: 'caocao', text: '역적 하나를 치우니 더 큰 역적이 들어앉았군. 격문을 띄웠다.' },
    { speaker: 'xunyu', text: '열여덟 진의 제후가 응했습니다. 맹주는 원소, 선봉은 손견입니다.' },
    { speaker: 'xiahoudun', text: '열여덟이라. 머릿수는 좋은데 저마다 딴 주머니를 차고 있소.' },
    { speaker: 'guojia', text: '동탁은 사수관에 화웅을 세웠습니다. 관 앞에서 이미 제후의 장수 넷이 베였습니다.' },
    { speaker: 'dianwei', text: '그럼 다섯 번째는 제가 서겠습니다.' },
    { speaker: 'caocao', text: '문은 하나뿐이다. 화웅을 관 뒤로 몰아넣고, 문이 열리거든 단숨에 들어간다.' },
  ],

  // s11 — 사수관 함락 후 호로관(여포)
  toHulao: [
    { speaker: null, text: '사수관이 열렸다. 화웅의 목이 연합의 진문에 걸렸다.' },
    { speaker: 'xiahouyuan', text: '관을 넘었는데도 제후들은 술잔만 돌리고 있습니다. 진군할 기색이 없습니다.' },
    { speaker: 'guojia', text: '동탁이 호로관으로 물러났습니다. 이번에는 여포가 직접 나섰습니다.' },
    { speaker: 'xunyu', text: '여포입니다. 방천화극에 적토마, 사람으로 셈할 상대가 아닙니다.' },
    { speaker: 'xiahoudun', text: '사람이든 귀신이든 창에 찔리면 피가 나오오.' },
    { speaker: 'caocao', text: '길이 좁다. 여포는 저 협로로 혼자 밀고 내려올 것이다 — 그게 저자의 성미다.' },
    { speaker: 'guojia', text: '오히려 기회입니다. 좁은 목에 가두고 여럿이 에워싸십시오.' },
    { speaker: 'caocao', text: '여포만 꺾으면 관은 스스로 닫힌다. 전군, 협로로!' },
  ],

  // s12 — c01에서 회군을 고른 갈래
  retreat: [
    { speaker: 'caocao', text: '…멈춘다. 전군, 말머리를 돌려라.' },
    { speaker: 'xiahoudun', text: '맹덕! 저 불길이 보이지 않소? 지금이 아니면 언제란 말이오!' },
    { speaker: 'caocao', text: '보인다. 그러니 멈추는 것이다. 우리 군만으로 형양의 좁은 길을 지날 수는 없다.' },
    { speaker: 'guojia', text: '옳은 판단입니다. 서영이 이미 길목에 매복을 깔았다는 보고가 있었습니다.' },
    { speaker: 'xunyu', text: '연합은 어차피 흩어집니다. 남는 것은 우리 군의 병력뿐입니다.' },
    { speaker: null, text: '낙양은 사흘 밤을 탔다. 조조의 군세는 그 불빛을 등지고 물러났다.' },
    { speaker: 'caocao', text: '오늘 쫓지 못한 것은 훗날 갚는다. 반드시 갚는다.' },
  ],

  // s13 — 제1부 종장 (게이지 분기 문구는 표시 계층 몫)
  chapterEnd: [
    { speaker: null, text: '동탁은 장안으로 옮겨 앉았고, 반동탁 연합은 한 해를 넘기지 못하고 흩어졌다.' },
    { speaker: 'xunyu', text: '맹주부터가 제 땅을 늘리는 데 바빴습니다. 처음부터 한마음이었던 적이 없습니다.' },
    { speaker: 'guojia', text: '그래도 얻은 것이 있습니다. 이제 천하는 조조라는 이름을 압니다.' },
    { speaker: 'xiahoudun', text: '이름값은 창으로 지키는 거요. 병사를 더 모읍시다.' },
    { speaker: 'caocao', text: '연합은 끝났다. 이제부터는 남의 격문이 아니라 내 깃발로 움직인다.' },
    { speaker: 'dianwei', text: '어디로 가든 앞장은 제 자리입니다.' },
    { speaker: 'caocao', text: '연주로 간다. 땅을 얻고, 군을 기르고, 다시 낙양을 본다.' },
    { speaker: null, text: '— 제1부 「패왕 탄생」 완 —' },
  ],
}
