// 능력치 열매 — 원작 확정 규칙: "3단계 장비를 Lv3에서 판매하면 능력치 열매가 나온다"
// (docs/research/equipment.md §1). 카테고리별 대응은 원작 그대로:
//   검→경험 / 창→무력 / 활→운 / 부채·보검→지력 / 갑옷→통솔 / 옷→민첩.
// 열매의 상승폭(+2)과 경험의 열매 획득량(+50)은 원작 미확보 — core/campaign.ts의 설계값.

import type { FruitDef } from '../core/types'

export const FRUITS: Record<string, FruitDef> = {
  strFruit: {
    id: 'strFruit',
    name: '무력의 열매',
    stat: 'str',
    description: '먹으면 팔에 힘이 붙는다. 무력이 오른다.',
  },
  ldrFruit: {
    id: 'ldrFruit',
    name: '통솔의 열매',
    stat: 'ldr',
    description: '먹으면 병사가 말을 잘 듣는다. 통솔이 오른다.',
  },
  intFruit: {
    id: 'intFruit',
    name: '지력의 열매',
    stat: 'int',
    description: '먹으면 머리가 맑아진다. 지력이 오른다.',
  },
  agiFruit: {
    id: 'agiFruit',
    name: '민첩의 열매',
    stat: 'agi',
    description: '먹으면 몸이 가벼워진다. 민첩이 오른다.',
  },
  luckFruit: {
    id: 'luckFruit',
    name: '운의 열매',
    stat: 'luck',
    description: '먹으면 하늘이 돕는다. 운이 오른다.',
  },
  expFruit: {
    id: 'expFruit',
    name: '경험의 열매',
    stat: 'exp',
    description: '먹으면 지난 싸움이 몸에 새겨진다. 경험치를 얻는다.',
  },
}

/**
 * 3단계 일반 장비 → Lv3 판매 시 나오는 열매 (equipment.md §1 매트릭스).
 * 카테고리 필드를 따로 두지 않고 id로 직접 매핑한다 — 3단계 장비는 카테고리당 하나뿐이고,
 * 새 3단계 장비를 추가하면 여기에도 등록해야 한다(데이터 정합 테스트가 누락을 잡는다).
 */
// 원작 확정(equipment.md 증보): tier 무관 — 만렙 일반 장비면 카테고리별 열매
export const FRUIT_ON_SELL: Record<string, string> = {
  // 검 → 경험
  woodSword: 'expFruit',
  bronzeSword: 'expFruit',
  ironSword: 'expFruit',
  // 창 → 무력
  woodSpear: 'strFruit',
  bronzeSpear: 'strFruit',
  ironSpear: 'strFruit',
  // 활 → 운
  woodBow: 'luckFruit',
  bronzeBow: 'luckFruit',
  ironBow: 'luckFruit',
  // 부채·보검 → 지력
  bambooFan: 'intFruit',
  whiteFeatherFan: 'intFruit',
  ironFan: 'intFruit',
  stoneGemSword: 'intFruit',
  bronzeGemSword: 'intFruit',
  ironGemSword: 'intFruit',
  // 갑옷 → 통솔
  leatherArmor: 'ldrFruit',
  bronzeArmor: 'ldrFruit',
  ironArmor: 'ldrFruit',
  // 옷 → 민첩
  clothRobe: 'agiFruit',
  silkRobe: 'agiFruit',
  battleRobe: 'agiFruit',
}
