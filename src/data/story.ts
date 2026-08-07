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
}
