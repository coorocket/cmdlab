# [cmdlab] 인사이트 발행: 2026-lazada-tmall-brands

- 요청자: Aside / 대상 저장소: coorocket/cmdlab / 사장님 승인일: 2026-10-20 ("오늘 인사이트에 포스팅") / 브랜치 접두어: publish/

## 왜
대표 검수가 끝난 인사이트 글 1편을 오늘(2026-10-20) 발행한다.

## 할 일
1. 원고 브랜치 `publish/2026-lazada-tmall-brands`(Aside가 올림)를 기준으로 작업한다. 들어 있는 것: `content/insight/2026-lazada-tmall-brands.md`(status 발행, date 2026-10-20), `assets/images/insight/2026-lazada-tmall-brands/` webp 5장(00_cover, 00_thumb, 01_lazada_numbers, 02_lazada_scene, 03_checklist).
2. 최신 main을 반영한 뒤 `npm ci && npm run build:insight` 실행, 생성물(insight/, sitemap.xml, llms.txt)까지 커밋한다.
3. main으로 가는 PR을 만든다. 병합은 하지 않는다(사장님이 머지).
4. 이 파일 끝에 `## 결과`를 적고 `_협업/done/`으로 옮기고, `_협업/to_aside/`에 결과 메모를 같은 PR에 넣는다.

## 금지
- 원고 문장·숫자 수정 금지(빌드 오류가 나면 수정하지 말고 보고).
- 다른 글 원고, 홈, 디자인, 다른 저장소 수정 금지. 기존 글 "다른 글" 카드가 바뀌는 것은 정상.
- main 직접 push 금지.

## 완료 기준 (자체검증)
- 빌드 성공, 새 글 H1 1개, 취소선 0, `[대표님 작성` 0, 이미지 5개 경로 존재
- category 앞부분 `베트남` 확인, `00_thumb` 존재 확인
- 금지어 검사: 인수인계 문서 4장 목록으로 검사(목록은 저장소 밖)
- sitemap.xml, llms.txt, /insight/ 목록에 새 주소 포함

## 사전검토 표
| 항목 | 내용 |
|---|---|
| 새 URL | /insight/2026-lazada-tmall-brands/ (신규, 기존 URL 변경 없음) |
| title/meta | 새 글 것만 추가. 기존 페이지 변경 없음 |
| sitemap | 새 주소 1줄 추가(빌드 자동) |
| robots/canonical/리다이렉트 | 변경 없음 |

- 구글: 새 글 1개 추가, 기존 페이지 영향 없음
- 네이버: 새 글 1개 추가, 기존 페이지 영향 없음
- URL: 신규 1개, 기존 URL 변경·삭제 없음


## 결과
- PR: 브랜치 `publish/2026-lazada-tmall-brands` → main (PR 번호는 to_aside 메모 참고). **머지하면 즉시 라이브입니다.**
- 변경 파일: 원고 `content/insight/2026-lazada-tmall-brands.md`(수정 없음), 그림 webp 5장(수정 없음), 생성물 `insight/2026-lazada-tmall-brands/index.html`, `insight/index.html`, `sitemap.xml`, `llms.txt`, 기존 글 3편 페이지의 "다른 글" 카드(정상 변경), 이 요청서(done 이동), `_협업/to_aside/` 메모
- 자체검증

| 항목 | 결과 |
|---|---|
| `npm ci && npm run build:insight` | 통과 (4편 생성) |
| 새 글 H1 | 1개 |
| 취소선 | 0 |
| `[대표님 작성` | 0 |
| 이미지 5개 경로 | 5개 모두 존재 (본문 3 + cover + thumb) |
| og:image | `00_cover.webp` 지정됨 |
| category 앞부분 | 베트남 |
| `00_thumb` | 존재 |
| sitemap.xml / llms.txt / 목록 | 새 주소 포함 |
| date | 2026-10-20 |
| 실존 브랜드·인물 이름 점검 | 아래 참고 |

- 못 한 것 / 판단 필요:
  - **금지어 검사 미실시:** 요청서가 가리킨 인수인계 문서 4장 목록이 클라우드 세션에 없습니다. 최종 금지어 검사는 Aside가 PR 리뷰와 라이브 확인 때 해 주세요.
  - **이름 점검:** 원고에 알리바바·티몰·라자다·쇼피·알리익스프레스·차이냐오, 출처 기관(21세기경제보도, DBS, Cube Asia, 모멘텀웍스)이 나옵니다. 플랫폼·출처 표기이고 파트너사·인물 실명은 보이지 않았습니다. 그림 alt는 일반 설명문입니다.
  - 라이브 접속 확인은 클라우드 세션에서 막혀 있어 하지 못했습니다. 머지 후 확인이 필요합니다.
