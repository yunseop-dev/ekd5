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

  // ---------- 제2부 「연주에서 서주로」 ----------

  // s20 — 제2부 개막. 청주 황건 잔당 토벌 (원작 1장 후반부의 시작)
  chapter2Intro: [
    { speaker: null, text: '연합이 흩어진 이듬해. 조조는 연주에 들어앉아 스스로 군을 먹였다.' },
    { speaker: null, text: '그 연주로, 청주에서 살아남은 황건의 무리 수십만이 밀려 내려왔다.' },
    { speaker: 'xunyu', text: '청주에서 올라온 황건 잔당입니다. 두목은 관해, 머릿수만 헤아려도 우리의 열 배입니다.' },
    { speaker: 'caocao', text: '열 배라. 그런데 그자들은 처자식을 짐수레에 싣고 다닌다지.' },
    { speaker: 'guojia', text: '그렇습니다. 싸우러 온 군대가 아니라 먹을 땅을 찾아 흐르는 무리입니다.' },
    { speaker: 'xiahoudun', text: '그럼 두목만 꺾으면 나머지는 무릎을 꿇겠군.' },
    { speaker: 'caocao', text: '항복한 자는 죽이지 않는다. 쓸 만한 장정은 내 군에 넣는다 — 청주병이다.' },
    { speaker: 'caocao', text: '구릉을 등지고 진을 편다. 관해를 잡아라!' },
  ],

  // s21 — 조숭 피살. 서주 침공의 도화선 (c02 선택지 직전)
  fatherDeath: [
    { speaker: null, text: '청주병 삼십만이 조조의 깃발 아래로 들어왔다. 연주는 처음으로 조조의 땅이 되었다.' },
    { speaker: null, text: '그 소식을 듣고, 낭야에 피해 있던 아버지 조숭이 아들을 찾아 길을 나섰다.' },
    { speaker: 'xiahouyuan', text: '…맹덕. 서주 경계에서 태공의 행렬이 습격을 받았습니다. 한 사람도 남지 않았습니다.' },
    { speaker: 'caocao', text: '누구냐.' },
    { speaker: 'xiahouyuan', text: '도겸의 부장이 이끄는 군사였다 합니다. 재물을 노렸다는 말도 있습니다.' },
    { speaker: 'xunyu', text: '주공, 사람을 보내 사실을 먼저 확인하십시오. 지금 군을 내면 명분이 흐려집니다.' },
    { speaker: 'xiahoudun', text: '명분이라니. 서주를 통째로 갈아엎어도 모자란 일이오!' },
    { speaker: 'caocao', text: '아니다. 나는 서주의 백성을 도륙할 생각이 없다 — 창을 받을 자는 도겸 하나다.' },
  ],

  // s22 — 연주로 회군해 복양의 여포와 맞선다
  // (c02에서 화친을 고른 갈래에서도 자연스럽게 이어져야 하므로 서주 전투 결과를 단정하지 않는다)
  puyangBetrayal: [
    { speaker: null, text: '조조의 군세는 서주를 등지고 북으로 말머리를 돌렸다. 연주가 남의 손에 있었다.' },
    { speaker: 'xunyu', text: '장막이 배신했습니다. 여포를 연주목으로 맞아들여 성 대부분이 넘어갔습니다.' },
    { speaker: 'caocao', text: '여포. 호로관의 그 사내가 이제 남의 땅을 얻어 앉았군.' },
    { speaker: 'guojia', text: '판을 짠 것은 여포가 아니라 진궁입니다. 우리 군이 남쪽에 묶인 틈을 정확히 노렸습니다.' },
    { speaker: 'xiahoudun', text: '근거지를 잃으면 군이 굶소. 다른 것은 다 뒤로 미뤄야 하오.' },
    { speaker: 'caocao', text: '그렇다. 땅은 다시 얻을 수 있으나 연주는 다시 얻을 수 없다.' },
    { speaker: 'xunyu', text: '여포는 복양에 들어 성을 등지고 있습니다. 시가지에서 기병을 상대하게 됩니다.' },
    { speaker: 'caocao', text: '좋다. 좁은 거리에서는 적토마도 달릴 곳이 없다. 복양으로!' },
  ],

  // ---------- 제3부 「허도 천도」 (v1.2 — 원작 미구현 4전투 구간) ----------

  // s30 — 천자 동천. 낙양 황폐 + 헌제 구출 결의 (+ 허저 합류가 여기로 앞당겨졌다)
  emperorFlight: [
    { speaker: null, text: '복양에서 여포를 밀어낸 그해, 장안에서 사람이 왔다. 천자의 사자였다.' },
    { speaker: 'xunyu', text: '이각과 곽사가 서로 창을 겨눈 틈에 폐하께서 궁을 나오셨습니다. 지금 낙양 서쪽 들에 계십니다.' },
    { speaker: 'caocao', text: '낙양이라. …….동탁이 태운 그 낙양에 궁이 남아 있을 리가 없다.' },
    { speaker: 'xiahouyuan', text: '남아 있지 않습니다. 성도 종묘도 재입니다. 백관이 담벼락 아래에서 잠을 잔다 합니다.' },
    { speaker: 'guojia', text: '주공, 이것은 명분입니다. 천자를 모시는 자가 곧 천하의 격문을 쓰는 자입니다.' },
    { speaker: 'xiahoudun', text: '맹덕, 이각의 군세는 얼마 되지 않소. 지금 가면 잡소.' },
    { speaker: null, text: '그때 진문 앞에, 소 한 마리를 거꾸로 끌고 온 거인이 무릎을 꿇었다.' },
    { speaker: 'xuChu', text: '갈파의 허저입니다. 폐하를 모시러 간다면, 그 수레 앞은 제가 서겠습니다.' },
    { speaker: 'caocao', text: '좋다. 전군 서쪽으로 — 폐하를 이 들판에서 하루도 더 재우지 않는다.' },
  ],

  // s31 — 허도 천도. 서황·만총 합류
  xuduCapital: [
    { speaker: null, text: '천자의 수레는 동쪽 길로 빠져나갔다. 이각의 깃발은 낙양 서쪽 들에 남았다.' },
    { speaker: 'xunyu', text: '낙양은 사람을 먹일 수 없습니다. 허(許)로 옮기십시오 — 물길이 있고 곡식이 있습니다.' },
    { speaker: 'caocao', text: '허도라. …….폐하께 여쭙되, 짐수레는 오늘 밤에 묶으시오.' },
    { speaker: null, text: '천도의 명이 내린 날, 이각 밑에 있던 장수 하나가 활을 들고 진문에 섰다.' },
    { speaker: 'xuHuang', text: '서황이오. 조공의 군을 한 번 겨뤄 보고 알았소 — 활을 둘 자리는 이쪽이오.' },
    { speaker: 'caocao', text: '서황. 그 활은 이각 밑에서 썩을 것이 아니었소. 내 우익을 맡으시오.' },
    { speaker: 'manChong', text: '만총입니다. 법을 세우는 일이라면 저를 쓰십시오 — 새 도읍에는 먼저 법이 서야 합니다.' },
    { speaker: 'caocao', text: '허도다. 이제부터 격문은 남의 손이 아니라 이 도읍에서 나간다.' },
  ],

  // s32 — 완성의 아침 (전위 생존 갈래)
  afterWan: [
    { speaker: null, text: '완성의 불은 새벽에 잦아들었다. 목책은 반쯤 타 무너져 있었다.' },
    { speaker: 'xunyu', text: '장수는 남쪽으로 물러났습니다. 우리 쪽 손실은 병력 삼분의 일입니다.' },
    { speaker: 'caocao', text: '…….안민이 갔다. 말을 내주고 자기가 뒤에 남았다.' },
    { speaker: 'dianwei', text: '조조님. 진문은 끝까지 넘기지 않았습니다. 이 몸도 아직 서 있습니다.' },
    { speaker: 'caocao', text: '전위. …….그 문을 버리라고 두 번 말했소. 다음에는 들으시오.' },
    { speaker: 'dianwei', text: '…….예. 다음에는 듣겠습니다.' },
    { speaker: 'xiahoudun', text: '맹덕, 우는 것은 뒤로 미루시오. 항복한 자를 그대로 둔 것은 우리 실수요.' },
    { speaker: 'caocao', text: '실수는 내 것이다. 갚는 것도 내 것이다 — 완성은 다시 온다.' },
  ],

  // s32 변이 — 전위가 완성에서 전사한 경우 (원작 "내 아들보다 전위가 아깝다" 톤)
  mourningDianwei: [
    { speaker: null, text: '완성의 불은 새벽에 잦아들었다. 진문 앞에 선 채로 굳은 시체가 하나 있었다.' },
    { speaker: 'xunyu', text: '…….전위 장군입니다. 적병이 그 앞으로 한 걸음도 지나가지 못했습니다.' },
    { speaker: 'caocao', text: '내려라. …….아니오. 내가 하겠소.' },
    { speaker: null, text: '조조는 손수 그 손에서 부러진 극을 빼냈다. 오래도록 아무 말도 하지 않았다.' },
    { speaker: 'caocao', text: '조앙도 갔고 안민도 갔다. …….내 아들이 죽은 것보다 전위가 아깝다.' },
    { speaker: 'xiahoudun', text: '맹덕. 그 말은 아드님께 못할 말이오.' },
    { speaker: 'caocao', text: '알고 있소. 그래도 그렇소. 아들은 다시 얻으나 전위는 다시 없소.' },
    { speaker: 'caocao', text: '해마다 이 자리에 제(祭)를 올린다. 전군, 머리를 숙여라.' },
  ],

  // s33 — 원술 참칭. 옥새와 황제 자칭
  yuanShuEmperor: [
    { speaker: null, text: '허도에 천자가 앉은 그해, 회남에서 또 하나의 조정이 열렸다는 소문이 올라왔다.' },
    { speaker: 'manChong', text: '원술이 수춘에서 황제를 자칭했습니다. 연호를 세우고 백관을 두었다 합니다.' },
    { speaker: 'caocao', text: '…….원술이. 그 손에 옥새가 있다더니 결국 머리에 얹었군.' },
    { speaker: 'guojia', text: '옥새는 손견의 것이었고, 손견의 것도 낙양에서 주운 것입니다. 주인이 없는 돌입니다.' },
    { speaker: 'xunyu', text: '주공, 이번에는 격문을 우리가 씁니다. 참칭은 천하가 다 아는 죄입니다.' },
    { speaker: 'xuHuang', text: '회남은 늪이 많습니다. 기병은 발이 무거워집니다 — 보병과 궁병을 앞에 세우십시오.' },
    { speaker: 'caocao', text: '여포에게도, 유비에게도, 손책에게도 격문을 보내시오. 이번엔 다 같이 간다.' },
    { speaker: 'caocao', text: '전군 남하한다. 수춘의 그 조정을 사흘 안에 접는다.' },
  ],

  // s23 — 유비의 구원 요청 + 허저 합류
  // (v1.2: 허저 합류 장면은 s30 천자 동천으로 앞당겨졌다 — 여기서는 이미 곁에 서 있는 것으로 읽는다)
  xuzhouRescue: [
    { speaker: null, text: '완성을 정리하고 허도로 돌아온 지 얼마 되지 않아, 남쪽에서 사자가 올라왔다.' },
    { speaker: 'xiahouyuan', text: '서주의 유비입니다 — 고순의 정예에 갇혔다 합니다.' },
    { speaker: 'guojia', text: '함진영입니다. 여포군에서 가장 두꺼운 부대가 유비군의 퇴로를 끊었습니다.' },
    { speaker: 'caocao', text: '유비라. 어제의 적을 오늘 구하러 가는 것이 우습긴 하나 — 고순을 잡을 기회다.' },
    { speaker: 'xunyu', text: '연주의 성 몇은 아직 여포의 깃발입니다. 고순을 꺾으면 그 깃발도 스스로 내려갑니다.' },
    { speaker: 'xuChu', text: '주공. 함진영은 방패가 두껍습니다 — 그 방패는 제가 엽니다.' },
    { speaker: 'caocao', text: '허저. 그대가 앞에 서면 나는 뒤를 보지 않아도 되오.' },
    { speaker: 'caocao', text: '남하한다. 이번에는 여포와 끝을 본다.' },
  ],

  // s24 — 하비 겨울 포위전 (원작 c14: 설원 + 강 + 다리 2개, 악천후로 화계 불가)
  xiapiSiege: [
    { speaker: null, text: '고순은 꺾였고, 여포는 남은 병력을 모아 하비성으로 물러났다.' },
    { speaker: null, text: '그 사이 겨울이 왔다. 성 앞의 들판은 눈에 덮이고 강은 살얼음을 물고 흘렀다.' },
    { speaker: 'chenGong', text: '(성루에서) 조조군은 먼 길을 왔다. 겨울 장기전은 저쪽에 불리하다 — 문을 닫고 버티면 된다.' },
    { speaker: 'xunyu', text: '진궁의 계산이 옳습니다. 눈 속에서 오래 끌면 우리 쪽 양식이 먼저 마릅니다.' },
    { speaker: 'guojia', text: '게다가 이 날씨에는 화계를 쓸 수 없습니다. 불이 붙지 않습니다.' },
    { speaker: 'caocao', text: '그럼 불 없이 한다. 강은 다리가 둘뿐이라 했지 — 그 둘만 잡으면 성은 갇힌다.' },
    { speaker: 'xuChu', text: '다리는 제가 앞에 섭니다. 성문까지 열어 드리겠습니다.' },
    { speaker: 'caocao', text: '길게 끌지 않는다. 눈이 더 깊어지기 전에 끝낸다.' },
  ],

  // s25 — 제2부 종장. 여포의 최후 + 장료 합류
  chapter2End: [
    { speaker: null, text: '눈에 덮인 하비의 성문이 안에서 열렸다. 포박된 여포가 조조 앞에 끌려 나왔다.' },
    { speaker: 'lüBu', text: '조공. 나를 살려 부린다면 천하에 당할 자가 없을 것이오.' },
    { speaker: 'caocao', text: '…네 말이 옳다. 그러나 너는 섬긴 주인마다 등을 찔렀다.' },
    { speaker: 'caocao', text: '데려가라. 진궁도 함께다.' },
    { speaker: null, text: '뒤이어 끌려온 장수는 무릎을 꿇지 않고 조조를 바라보았다.' },
    { speaker: 'zhangLiao', text: '나는 두 주인을 섬기지 않는다. 벨 것이면 지금 베라.' },
    { speaker: 'caocao', text: '…과연. 이 자의 결박을 풀어라. 오늘 하비에서 내가 얻은 것은 성이 아니라 사람이다.' },
    { speaker: null, text: '— 제2부 「연주에서 서주로」 완 —' },
  ],
}
