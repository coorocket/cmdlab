# [cmdlab] 인사이트 발행: xiaohongshu-redland (2026-10-22 발행분)

- 요청자: Aside / 대상 저장소: coorocket/cmdlab / 사장님 승인일: 2026-10-20 (검수완료, 하루 1편) / 브랜치: publish/xiaohongshu-redland / 세션: CMD-콘텐츠 협업

## 왜
대표 검수가 끝난 인사이트 글 1편. 사장님이 2026-10-22에 머지(발행)한다.

## 할 일
1. Aside가 올린 `publish/xiaohongshu-redland` 브랜치에서 작업한다. 들어 있는 것: `content/insight/xiaohongshu-redland.md`(status 발행, date 2026-10-22), `assets/images/insight/xiaohongshu-redland/` webp 5장(00_cover, 00_thumb, 01_redland_numbers, 02_redland_scene, 03_checklist).
2. 최신 main 반영 후 `npm ci && npm run build:insight`, 생성물 커밋.
3. main 대상 PR 1개. 병합 금지(사장님이 10/22 머지).
4. 이 파일 끝 `## 결과` → `_협업/done/`, `_협업/to_aside/` 메모(같은 PR).

## 금지
- 원고 문장·숫자·제목 수정 금지(빌드 오류는 보고만).
- 다른 글 원고, 홈, 디자인 수정 금지. 기존 글 "다른 글" 카드 변경은 정상.
- main 직접 push 금지.

## 완료 기준
- 빌드 통과(발행 6편), 새 글 H1 1개, 취소선 0, `[대표님 작성` 0, 이미지 5개 존재
- category 앞부분 `중국`, `00_thumb` 존재, slug 숫자 0개, 파일·slug·그림 폴더 이름 일치
- 새 글 `rel="icon"` 2개, 허브 링크 0
- sitemap.xml·llms.txt·/insight/ 목록에 새 주소 포함

## 사전검토 표
| 항목 | 내용 |
|---|---|
| 새 URL | /insight/xiaohongshu-redland/ (신규) |
| 기존 URL·title·meta·robots·canonical | 변경 없음 |
| sitemap | 새 주소 1줄 추가(빌드 자동) |

- 구글: 새 글 1개 추가, 기존 페이지 영향 없음
- 네이버: 새 글 1개 추가, 기존 페이지 영향 없음
- URL: 신규 1개, 기존 변경·삭제 없음

## 결과
- PR: 번호는 PR 생성 후 기재, 브랜치 `claude/affectionate-volta-mag1o8` → main (병합은 사장님, 10/22 예정)
- 변경 파일: `content/insight/xiaohongshu-redland.md`, `assets/images/insight/xiaohongshu-redland/` webp 5장, `insight/xiaohongshu-redland/index.html`(신규), `insight/index.html`, 기존 글 5편 "다른 글" 카드, `sitemap.xml`, `llms.txt`

| 자체검증 | 결과 |
|---|---|
| 빌드 | 통과, 발행 6편 |
| 새 글 H1 | 1개 |
| 취소선 / `[대표님 작성` | 0 / 0 |
| 이미지 | webp 5개 존재, 본문 3장 `.webp`로 연결 |
| category 앞부분 / `00_thumb` | `중국` / 존재 |
| 파일·slug·그림 폴더 이름 | 일치 (`xiaohongshu-redland`), slug 숫자 0 |
| 새 글 `rel="icon"` | 2개 |
| sitemap.xml·llms.txt·/insight/ 목록 | 새 주소 포함 (sitemap lastmod 2026-10-22) |
| 기존 글 변경 | "다른 글" 카드 변경뿐 |
| 원고 수정 | 없음 |

- 못 한 것 / 판단 필요: 본문에 실존 기업명 `메이퇀`(지역 소비 증가 데이터 출처)이 있습니다. 보고했고 별도 답이 없어 원고를 그대로 두고 PR만 열었습니다. 최종 금지어 검사는 Aside가 PR 리뷰에서 해 주세요. "허브 링크 0"은 `/insight/` 목록 기본 링크만 있고 다른 허브 링크는 없습니다.
