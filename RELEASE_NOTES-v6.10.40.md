# LEGO LIFE GAME v6.10.40 — 윷놀이 방 생성/PC 아이콘 핫픽스

기준: 사용자가 첨부한 **v6.10.39-YUTNORI-FULL** 프로젝트 전체.

## 원인 확인 및 수정

- **`POST /api/yut/rooms`는 기존 v6.10.39 소스 내에 이미 정상 구현되어 있습니다.** 기존 로컬 통합 테스트에서도 HTTP 201로 정상 방 생성됩니다. 따라서 실제 서비스의 `API 경로를 찾을 수 없습니다.`는 정적 프런트엔드와 서버 Worker가 서로 다른 배포 버전이었을 가능성이 높습니다(실서비스 환경의 버전 미확인으로 확정 불가).
- 새 클라이언트는 **방 생성 버튼 제출 전에** `/healthz`에서 실행 중인 Worker 버전 및 `features.yutnori`를 확인합니다. 이전 버전이면 생성 요청을 보내지 않고 **서버 전체를 재배포하라는 한국어 안내**가 나옵니다. API가 없는 서버로 POST를 무한 재시도하거나 계정·방 상태를 건드리지 않습니다.
- `/healthz` 및 `/api/health`에 **`6.10.40-yutnori` 및 `features.yutnori: true`** 배포 검증값을 추가했습니다. 서버가 새 버전인데도 경로가 잘못됐으면 윷놀이 전용 오류 메시지로 원인을 구분합니다.
- PC에서 깨질 수 있는 `🪵` 이모지를 단체게임 선택 버튼에서 제거하고, 운영체제/폰트에 의존하지 않는 **자체 SVG 윷가락 그림**으로 바꿨습니다. 나머지 윷놀이 이름 앞에는 호환성 좋은 `🎯`를 사용합니다.
- 정적 자산 `index.html`, `app.js`, CSS, 서비스 워커, 이미지 URL 버전을 **6101400**으로 일괄 업데이트해 이전 서비스 워커가 캐시하던 코드를 불러오지 않게 했습니다.
- 규칙, 포인트, DB, 계정, 기존 방 수, 랭킹, 다른 게임 기능은 의도적으로 변경하지 않았습니다.

## 실제 배포 방법 (필수)

1. 이 ZIP 압축을 해제합니다. `wrangler.jsonc`가 있는 폴더에서 터미널을 엽니다.
2. 개발 PC에서 Node.js 22 이상으로 `npm ci` 실행 후 `npm run deploy:cloudflare`를 실행합니다. 또는 기존 Wrangler 설치 환경에서 `npx wrangler deploy`를 사용할 수 있습니다.
3. **`public/`만 업로드하지 마세요.** `src/worker.js`, `src/game/yutnori.js`, `src/durable-store.js`, `wrangler.jsonc`를 포함해 프로젝트 루트에서 Workers 전체 배포해야 합니다. `GAME_ROOM` Durable Object 바인딩이 유지되어야 사용자 데이터도 이어집니다.
4. 배포 성공 후 `npm run verify:live`로 실제 공개 서버의 `/healthz`, `/api/health`가 **`6.10.40-yutnori`**라고 답하는지 확인합니다. 필요하면 페이지를 강력 새로고침합니다.

## 검증

- `npm run build`: JavaScript 문법/정적 배포 검증 통과
- `npm test`: 기존 게임과 새 윷놀이 API/배포검증 테스트 **460건 모두 통과**
- Worker 최상위 요청(`/api/yut/rooms`) → Durable Object → 윷놀이 방 생성 HTTP 201 검증
- 구형 Worker 감지 시 생성 차단, PC SVG 아이콘 관련 회귀 테스트

**실제 Cloudflare 계정에 배포하지 않았습니다.** 파일을 다운로드하는 것만으로 현재 운영 중인 웹사이트의 서버 코드는 바뀌지 않습니다.
