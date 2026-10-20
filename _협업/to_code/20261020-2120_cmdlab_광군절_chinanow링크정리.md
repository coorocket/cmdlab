# [cmdlab] 광군절 글 chinanow 링크 정리 (원문 링크 추천 코드 + 안내 문장 삭제)

- 요청자: Aside / 대상 저장소: coorocket/cmdlab / 사장님 지시일: 2026-10-20 / 브랜치 접두어: content/ / 세션: CMD-콘텐츠 협업

## 왜
- '소재가 된 원문' 링크에 추천 코드가 없어, 이 링크로 들어가 구독하면 추천으로 잡히지 않는다(Aside 확인: 기사 주소에 `?ref=` 를 붙여도 추천 코드가 저장됨).
- 사장님 지시로 출처 목록의 추천 링크 안내 문장을 삭제한다.

## 할 일 (`content/insight/2026-china-double11.md` 만 수정)
1. 출처 목록 "소재 참고" 줄의 원문 링크 주소 끝에 `?ref=coorocket` 를 붙인다.
   - 전: `https://www.chinanow.cc/ko/article/10910/...시작됐다)`
   - 후: `https://www.chinanow.cc/ko/article/10910/...시작됐다?ref=coorocket)` (기존 퍼센트 인코딩 경로는 그대로)
2. 같은 줄 끝의 아래 문장을 통째로 지운다.
   `이 링크는 추천 링크이며, 이 링크로 구독하시면 시엠디랩이 소정의 혜택을 받을 수 있습니다. 구독 비용은 달라지지 않습니다.`
3. 도입부 '이 글에 대하여' 상자의 마지막 문장을 바꾼다(지운 안내를 가리키므로).
   - 전: `chinanow 링크와 추천 링크 안내는 출처 목록 끝에 있습니다.`
   - 후: `chinanow 링크는 출처 목록 끝에 있습니다.`
4. `npm ci && npm run build:insight` 실행, 생성물 커밋, main 대상 PR 1개.
5. 이 파일 끝 `## 결과` → `_협업/done/`, `_협업/to_aside/` 메모(같은 PR).

## 금지
- 위 3곳 외 원고 수정 금지. front matter(`date`, `modified` 포함) 수정 금지.
- 빌드 스크립트·템플릿 수정 금지(빌드가 `ref=` 링크에 `rel="sponsored nofollow noopener"` 를 자동으로 붙임).
- 다른 글 수정 금지.

## 완료 기준
- `insight/2026-china-double11/index.html` 에서 chinanow 링크 2개 모두 `ref=coorocket` 포함, 둘 다 `rel="sponsored nofollow noopener"`, `data-track-label="chinanow_referral"`
- "소정의 혜택" 문구 0, "추천 링크 안내" 문구 0
- 본문(CTA 앞)에 `rel="sponsored` 0 (빌드 검사 통과)
- sitemap.xml, llms.txt 변경 0 (있으면 보고)

## 사전검토 표
| 항목 | 내용 |
|---|---|
| URL·title·meta·canonical·robots·sitemap | 변경 없음 |
| 바뀌는 것 | 기존 글 1편 출처 줄 링크 1개 주소(쿼리 추가)와 rel 속성, 문장 2곳 |

- 구글: 외부 링크 1개 rel이 sponsored로 바뀜, 순위 영향 없음
- 네이버: 영향 없음
- URL: 사이트 URL 변경 없음
