레고 키우기 v6.4.0 최종 프로젝트

1. Node.js 22 이상을 사용합니다.
2. 기존 Cloudflare 게임을 업데이트할 경우 wrangler.jsonc의 Worker name `lego`와 Durable Object 구성을 그대로 유지합니다.
3. npm install
4. npm run verify
5. npm run deploy:cloudflare
6. 배포 후 /healthz에서 6.4.0-final을 확인합니다.

v6.4.0 핵심 추가:
- 개인게임 전체 합산 게임 하루 30회
- 사과게임 10×10 / 2분 / 서버 검증 정산 / 최고점 TOP 5
- 낚시 게임 하루 20회
- 오목 15×15 실시간 1:1 / 최대 3방 / 관전 / 판돈 / 30초 턴 / 금수 / 재대결 / TOP 5
- 라이어게임 읽기 전용 관전 및 게임 종료 전 비밀정보 서버 차단
- 회원가입 본인 닉네임 안내문

중요: 자동 테스트와 정적 검증은 통과시키지만, 실제 Cloudflare 운영 계정과 실제 iPhone/Android 기기에서의 최종 네트워크·터치 동작은 배포 후 직접 한 번 확인하세요.
