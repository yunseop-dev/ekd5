# 웹 기반 SRPG (영걸전/파이어 엠블렘 스타일) 기술 조사 보고서

> 조사일: 2026-08-06. GitHub API로 스타/최근 커밋을 직접 확인, npm 레지스트리에서 최신 버전 확인.

---

## 1. 오픈소스 웹 SRPG/택틱스 엔진 및 게임

### 1차 참고 대상 (활발히 유지되는 대형 프로젝트)

| 저장소 | 스타 | 기술 스택 | 최근 푸시 | 비고 |
|---|---|---|---|---|
| [nkzw-tech/athena-crisis](https://github.com/nkzw-tech/athena-crisis) | ★1,969 | TypeScript + **React/DOM+CSS** (WebGL 아님) | 2026-07 | Advance Wars 계열 상용 턴제 택틱스. MIT 오픈코어(코드 공개, 아트/캠페인 비공개). `athena`(맵 상태) / `apollo`(게임 상태·액션) 패키지 분리 구조가 교과서적. **이 장르 최고의 레퍼런스** |
| [boardgameio/boardgame.io](https://github.com/boardgameio/boardgame.io) | ★12,391 | TypeScript, v0.50.2 | 2026-08 | 게임 엔진이 아니라 **턴제 게임 상태 관리** 프레임워크(페이즈, 턴 순서, undo, 봇, 멀티플레이). 렌더러(Phaser/Pixi/React)와 조합 가능 |

### 소규모 참고용

| 저장소 | 스타 | 스택 | 최근 푸시 | 비고 |
|---|---|---|---|---|
| [chessmasterhong/WaterEmblem](https://github.com/chessmasterhong/WaterEmblem) | ★119 | JS, ImpactJS | 2015 | 웹 파이어 엠블렘 클론. FE 메커닉 구현 참고용 |
| [tranchikhang/MedievalWar](https://github.com/tranchikhang/MedievalWar) | ★40 | JS, Phaser 3 | 2021 | FE 스타일 턴제 전략, Phaser 3 구조 참고 |
| [semibran/tactics](https://github.com/semibran/tactics) | ★32 | 순수 JS Canvas | 2018 | 미니멀 택틱스 RPG |
| [sviridoff/tactical-rpg](https://github.com/sviridoff/tactical-rpg) | ★28 | TypeScript | 2021 | FE Heroes 클론 시도, [데모](https://sviridoff.github.io/tactical-rpg) |
| [DonColon/vigilans-nexum](https://github.com/DonColon/vigilans-nexum) | ★4 | TypeScript | 2026-01 | FE에서 영감받은 택틱스 RPG, 최근 활동 |
| [MRyutaro/react-srpg-map](https://github.com/MRyutaro/react-srpg-map) | ★0 | TypeScript/React | 2024-09 | React SRPG 맵 라이브러리 (일본) |
| [mattbgold/phaser-tbs](https://github.com/mattbgold/phaser-tbs) | ★12 | TS + Phaser | 2017 | 턴제 전략 |

### 조조전/영걸전 관련

- [wateret/mengde](https://github.com/wateret/mengde) ★28 — **조조전에서 영감받은 턴제 RPG 엔진**. 단 C++라서 웹이 아님 (2021 중단).
- [ysm1180/ThreeKingdoms-Caocao](https://github.com/ysm1180/ThreeKingdoms-Caocao) ★12 (C, "조조전 리뉴얼") + 동일 개발자의 [JojoLandEditor](https://github.com/ysm1180/JojoLandEditor) (C#, 조조전 지형편집기) — 네이티브 리버스엔지니어링 계열.
- **결론: 조조전/영걸전의 웹 포트나 웹 팬 리메이크 오픈소스는 사실상 존재하지 않음.** 한국 조조전 MOD 커뮤니티는 Windows 전용 에디터 기반, 넥슨의 조조전 온라인도 서비스 종료. → **직접 만들 가치가 있는 공백 영역.**
- 참고: 상용 툴 [SRPG Studio](https://store.steampowered.com/app/857320/SRPG_Studio/)(Windows, JS 스크립팅), RPG Maker MZ용 SRPG Gear 플러그인 — 노코드 대안이지만 커스터마이징·웹 최적화 한계.

---

## 2. 엔진/프레임워크 선택 비교

| 선택지 | 최신 버전 | 장점 | 단점 | SRPG 적합도 |
|---|---|---|---|---|
| **Phaser** | **4.2.1** | Tiled JSON 타일맵 로더 내장, 스프라이트 애니·씬·입력·오디오·터치 올인원. HTML5 커뮤니티 최대 | 번들 ~1.2MB. UI 메뉴는 직접 구현 또는 DOM 오버레이 필요 | ◎ |
| **PixiJS** | 8.19.0 | 최속 2D 렌더러, ~450KB, 자유도 최고 | 타일맵·씬·입력·게임루프 전부 직접 구현 | ○ |
| **DOM/React (+CSS)** | React 19 | **Athena Crisis가 상용 수준으로 증명.** SRPG는 프레임당 갱신이 적은 UI-heavy 장르라 DOM으로 충분. 메뉴/대화창/상태창이 그냥 React 컴포넌트. 접근성·반응형·터치 공짜 | 유닛 수백 개 + 파티클 연출엔 한계 | ◎ (턴제 특성상 궁합 최상) |
| **순수 Canvas** | - | 의존성 0 | 전부 수제작 | △ |
| **Godot 4 HTML5** | 4.x | 에디터·애니메이션 툴 완비 | **wasm 최소 15–30MB**, 모바일 웹 로딩·iOS Safari 이슈 | △ (웹 우선이면 비추천) |
| 기타 | Excalibur 0.32.0, KAPLAY 3001.0.19 | TS 친화 경량 엔진 | 커뮤니티 소규모 | ○ |

최근(2024–2026) 실전 선택: **Athena Crisis = React+DOM+CSS**, itch.io HTML5 택틱스 다수 = Phaser 또는 Godot. "격자 + 메뉴가 절반인 게임"은 전투 보드 Canvas + 메뉴 DOM 하이브리드가 일반적이고, 전부 DOM으로 가는 Athena Crisis 노선도 검증됨.

---

## 3. 핵심 알고리즘

- **이동 범위 계산**: 지형 코스트가 있는 SRPG는 **다익스트라(균일 코스트면 BFS)로 시작점에서 이동력 이내의 모든 칸 탐색**. [Red Blob Games 인터랙티브 튜토리얼](https://www.redblobgames.com/x/2037-dijkstra-movement/)이 결정판. 병종별 지형 코스트는 `cost(unitClass, terrain)` 함수화. ZOC도 코스트 함수에 흡수 가능.
- **A\* 경로 탐색**: 목적지 확정 후 실제 이동 경로용. 라이브러리: [easystarjs](https://github.com/prettymuchbryce/easystarjs) 0.4.4, [pathfinding](https://github.com/qiao/PathFinding.js) 0.4.18. 단 SRPG 규모(맵 20×30)에선 직접 구현 100줄이면 충분하고, 이동 범위 다익스트라의 `cameFrom` 맵을 재사용하면 A*가 따로 필요 없는 경우가 많음.
- **공격 범위 오버레이**: 이동 가능 칸 집합의 각 칸에서 무기 사거리만큼 맨해튼 거리 확장 → 합집합(파랑=이동, 빨강=공격). "최소 사거리 2"는 거리 필터로 처리.
- **여러 턴 예상 경로**: Unciv 개발자의 [multi-turn pathfinding 글](https://yairm210.medium.com/multi-turn-pathfinding-7136bd0bdaf0).
- **턴 순서**: 영걸전/FE는 **페이즈제**(아군 전원 → 적군 전원)라 구현이 가장 단순. boardgame.io는 phase/turn order 추상화 기본 제공.
- **적 AI**: 표준은 **유틸리티 스코어링 + 위협 맵**. ① 각 적 유닛이 (도달 가능 칸 × 공격 가능 대상) 조합 열거 → ② `점수 = 예상 데미지 − 예상 반격 데미지 + 킬 보너스 + 지형 방어 보너스 − 노출 페널티` 채점 → ③ 최고점 실행. 위협 맵(각 칸이 몇 명의 적에게 공격받는지)을 미리 계산해 노출 페널티에 사용. 참고: [Game Developer — Designing AI Algorithms For Turn-Based Strategy Games](https://www.gamedeveloper.com/design/designing-ai-algorithms-for-turn-based-strategy-games), [Strategy AI: Threat evaluation devlog](https://lazykitty.itch.io/ex-nihilo/devlog/76498/strategy-ai-threat-evaluation). 영걸전식 "일정 범위 진입 전까지 대기" AI는 유닛별 `behavior: guard | pursue | rout` 플래그로 데이터화.

---

## 4. 데이터 주도 설계 (캠페인 SRPG)

- **권장 구조** (Athena Crisis 패키지 분리 + 조조전 MOD 에디터 데이터 분리 벤치마킹):
  - `units.json` — 병종 정의(성장률, 이동력, 지형코스트 테이블, 승급트리)
  - `characters.json` — 네임드 장수(초기 스탯, 소속, 초상화 키)
  - `maps/stage01.json` — Tiled 내보내기(지형 레이어 + 오브젝트 레이어에 배치/증원 마커)
  - `scenarios/stage01.json` — 승리/패배 조건, 유닛 배치, **이벤트 트리거 목록** `{ trigger: {type:"turnStart"|"unitDefeated"|"regionEnter"|"hpBelow", ...}, actions: [dialogue|spawn|moveCamera|setFlag|branch] }`
  - `story/` — 대화 스크립트. 분기는 플래그 기반 스테이지 그래프 `{ next: [{if: "flag", goto: "stage05a"}, {goto:"stage05b"}] }`
- **대화/분기 스크립팅**: [inkjs](https://github.com/y-lohse/inkjs) (ink 공식 JS 포트, 웹 통합 가장 성숙) 또는 [Yarn Spinner](https://yarnspinner.dev/). 단순 선형+플래그 분기 수준이면 자체 JSON DSL이 가벼움.
- **맵 에디터**: **[Tiled](https://dinogame.gg/blog/how-to-use-tiled-level-design/)가 안전한 기본값** — Phaser가 Tiled JSON 네이티브 로드, 커스텀 프로퍼티(지형 타입, 방어 보너스)를 타일에 부여 가능. [LDtk](https://ldtk.io/docs/game-dev/loading/)는 UX 현대적이나 생태계 젊음(Tiled 포맷 내보내기 가능). 장기적으로 자체 웹 에디터(React 스테이지 에디터)를 만들면 커뮤니티 모딩까지 열 수 있음.

---

## 5. 에셋 (⚠️ Koei 원본 그래픽·음악·초상화는 저작권물 — 사용 불가. 추출 에셋도 마찬가지)

- [OpenGameArt CC0 Tiles & Tilesets 컬렉션](https://opengameart.org/content/cc0-tiles-tilesets), [CC0/OGA-BY Pixel Art 컬렉션](https://opengameart.org/content/cc0oga-by-pixel-art) — 지형 타일 조달처.
- [itch.io "chinese" 태그 에셋](https://itch.io/game-assets/tag-chinese) — 무협/선협 스프라이트, 중국 전통 타일셋 등 삼국지 톤 자료 실존. [CC0 tilemap 태그](https://itch.io/game-assets/assets-cc0/tag-tilemap) 140+종.
- [Kenney](https://opengameart.org/content/all-cc0-uploader-kenney) — 전부 CC0, 1-bit 탑다운 RPG 팩 등. 프로토타입용 최적.
- 현실적 전략: 프로토타입은 Kenney/CC0 타일 + 단색 유닛 토큰 → 삼국지풍 픽셀아트(장수 초상, 병종 스프라이트)는 커미션 또는 자체 제작. 중국풍 무장 스프라이트의 완성 CC0 세트는 드묾 — 가장 큰 에셋 비용.

---

## 6. 저장/영속성

- **단일 플레이어에 백엔드 불필요.** 브라우저 저장으로 충분:
  - 세이브 슬롯·전역 플래그: **IndexedDB** — 래퍼로 [idb](https://github.com/jakearchibald/idb) 8.0.3(경량) 또는 [Dexie](https://dexie.org) 4.4.4. localStorage는 5–10MB 동기 API라 부적합.
  - [웹 게임 세이브 모범 사례](https://bugnet.io/blog/game-save-best-practices-web): 세이브에 **스키마 버전** 포함, `navigator.storage.persist()` 축출 방지, 모바일에선 `visibilitychange`에서 자동 저장, **JSON 파일 내보내기/가져오기 버튼 제공**.
  - 턴제 특성상 세이브 = "스테이지 ID + RNG 시드 + 액션 로그"(이벤트 소싱)도 가능 — 용량 최소화 + 리플레이 공짜 (boardgame.io 모델).
- 클라우드 세이브·랭킹이 필요해지면 Supabase/Firebase 추가.

---

## 종합 권고

1. **아키텍처**: Athena Crisis 모델 벤치마킹 — **게임 로직을 렌더러와 완전 분리된 순수 TypeScript 패키지**(맵 상태 / 액션·이펙트)로 만들고 렌더러는 교체 가능하게. 로직이 순수 함수면 AI 시뮬레이션·테스트·리플레이 공짜.
2. **렌더링**: A안 Phaser 4.2 + React 오버레이 / **B안 React+DOM 올인 (Athena Crisis 방식)** — 턴제 SRPG는 B로 충분히 상용 품질. React 익숙하면 B가 생산성 높음. Godot HTML5 비추천.
3. **알고리즘**: 다익스트라 이동범위 + 맨해튼 사거리 확장 + 페이즈제 턴 + 유틸리티 스코어링 AI. 외부 라이브러리 없이 직접 구현 가능한 규모.
4. **데이터**: Tiled(맵) + 자체 JSON 스키마(유닛/시나리오/이벤트) + 필요 시 inkjs. 처음부터 데이터 주도 설계 → 모딩 확장성.
5. **저장**: idb(IndexedDB) + 버전 넘버 + 파일 내보내기. 백엔드 없이 시작.
