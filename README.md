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
