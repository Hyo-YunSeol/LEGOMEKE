# LEGO LIFE v6.10.34 · 사천성 PC 그림 표시·캐시 수정

기준: `lego-life-game-v6.10.33-RUMMI-UX-FIX.zip`

## 적용
- 사천성 5개 테마(네온시티/바다탐험/캠핑데이/음악축제/우주연구소) 총 100개 SVG 타일의 시스템 이모지 폰트 의존성을 제거. 각 SVG 안에 자체 PNG 그림 데이터를 넣어 Windows/macOS 환경에서 동일한 그림이 표시되도록 변경. 기존 타일 ID, 파일 경로, 게임판 규칙은 유지.
- `public/sw.js`가 사라진 옛 테마(`life/nature/fantasy/sea/tech`) 100개를 캐싱하려던 설정을 실제 새 테마(`neon/ocean/camp/music/space`) 100개로 수정.
- 정적 파일 버전을 `6101340`으로 갱신해 이전 그림 캐시를 강제로 분리. HTML, 앱, 서비스워커, 작업자 버전, 테스트 일치.
- 사천성 화면 진입 시 전체 100개 테마를 무조건 선로딩하던 부분을 진행 중인 방의 테마 20개만 선로딩하도록 축소.
- SVG 자체 포함 이미지 및 서비스워커 실제 파일 존재 여부 검증 테스트 추가.
- `scripts/check-rework.mjs`의 오래된 사천성 테마 검증 항목 수정.

## 유지
- 대전 테트리스, 교미 결과 문구, 게임 규칙, 포인트, 랭킹, 전직/진화 규칙, 사천성 셔플 기능은 이번 변경에 포함하지 않음.
- 교미 결과 문구 50개는 별도 검토용 텍스트 파일로 추출했으며, 코드에서는 변경하지 않음.

## 로컬 검증
- `npm run check` · JavaScript 106개 구문 통과
- `npm run smoke:deploy` 통과
- `npm test` · 424개 테스트 통과
- 서비스워커 캐시 파일 218개 모두 존재 확인
- PC Chromium에서 타일 SVG 이미지 4종 로드 및 실제 그림 렌더링 확인
- `npm run test:browser`, `npm run lint`: 필요한 npm 의존성(jsdom, eslint)을 오프라인 환경에서 설치할 수 없어 미실행
- 실제 Cloudflare 배포 및 실제 Windows PC 실사용 검증은 수행하지 않음
