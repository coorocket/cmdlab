# CMD.LAB GitHub Pages 배포용 정적 사이트

## 폴더 구조

```text
cmdlab-site/
├── index.html
├── .nojekyll
├── assets/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
└── README.md
```

## GitHub Pages 배포 방법 (초보자용)

1. 이 폴더 전체를 GitHub 저장소 루트에 업로드합니다.
2. GitHub 저장소 `Settings` > `Pages`로 이동합니다.
3. `Build and deployment`에서 `Source`를 `Deploy from a branch`로 선택합니다.
4. 브랜치는 `main`(또는 `master`), 폴더는 `/ (root)`를 선택 후 저장합니다.
5. 1~3분 후 표시되는 사이트 URL로 접속합니다.

## 포함된 동작

- 모바일 메뉴 열기/닫기
- Solution 탭 전환 (China / Vietnam)
- FAQ 아코디언 펼침/접힘

## 인사이트(/insight/) 글 발행

`content/insight/<slug>.md` 1개 = 글 1편. `npm run build:insight` 로 `insight/`, `sitemap.xml`, `llms.txt` 를 생성한다(생성물도 커밋). status 가 `발행`으로 시작하는 글만 만든다. `[대표님 작성` 같은 미작성 표시가 남아 있으면 빌드가 실패한다.

1. Aside가 `_협업/to_code/` 에 "인사이트 발행: <slug>" 요청서 + `cmdlab_콘텐츠/20_발행대기/<폴더>/` 에 확정 md·png 전달
2. md 를 `content/insight/<slug>.md` 로 복사(status: 발행), `scripts/img2webp.sh <png폴더> <slug>` 로 그림 변환(00_cover 필수), `npm run build:insight`, `python3 -m http.server 8765` 로 미리보기
3. 데스크톱·모바일 스크린샷 확인 후 사용자 "배포해" → push (main push = 즉시 라이브)
4. 첫 글 발행 때 `index.html` 헤더의 `data-insight-nav` 링크에서 `hidden` 제거
5. `_협업/to_aside/` 에 "발행 완료 + URL" 메모

### 인사이트 CTA 지침

`npm run build:insight` 가 아래 1·2·4를 검사하고(어기면 빌드 실패), 3·5는 자동으로 처리한다.

1. **끝 CTA 필수**: 본문 끝(출처 앞)에 `---` 로 구분한 CTA 블록 1개 — 굵은 질문 한 줄 + 설명 + `[무료 진단 신청 →](링크)`. 없으면 빌드 실패.
2. **링크는 category와 맞춤**: `중국` → `/?country=CN#contact`, `베트남` → `/?country=VN#contact`, `공통` → `/#contact`. 다르면 빌드 실패.
3. **체크리스트 뒤 인라인 CTA**: 글의 마지막 번호 목록(체크리스트) 바로 뒤에 한 줄 CTA를 자동 삽입한다. 문구를 바꾸려면 front matter 에 `cta_inline: "..."` 를 쓴다. 번호 목록이 없으면 경고만 나온다.
4. **문구는 글 주제에 맞춤 / 외부 추천 링크는 CTA 뒤**: CTA 질문은 글이 다루는 행동에 맞춰 쓴다(예: 수출바우처 글은 "내년 수출바우처, 해외 마케팅 어디부터 쓸지 정하셨나요?"). chinanow 같은 추천(`?ref=`) 링크가 본문에 있으면 빌드 실패 — 출처 목록 끝에 둔다.
5. **트래킹 라벨**: 하단 버튼 `service_cta_click` / `insight_<slug>_end`, 인라인 `insight_<slug>_inline`, 보조 링크 `insight_<slug>_link`, 헤더 `hero_cta_click` / `insight_header`, 푸터 `insight_footer`. 외부 이동은 `insight_cta_click`(chinanow_referral / chinanow_original).
