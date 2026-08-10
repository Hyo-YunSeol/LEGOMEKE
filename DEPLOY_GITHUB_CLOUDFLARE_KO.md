# GitHub · Cloudflare 배포

## GitHub 저장소 구조

저장소 첫 화면에 아래 항목이 바로 보여야 합니다.

```text
package.json
package-lock.json
wrangler.jsonc
public/
src/
tests/
scripts/
```

ZIP 파일 자체나 `lego-life-game-v6.4.7-final-complete/` 같은 바깥 폴더만 올리지 말고, 위 파일과 폴더가 저장소 루트에 바로 오도록 업로드합니다.

## Cloudflare 설정

1. Workers & Pages → GitHub 저장소 연결
2. Worker 이름: `legomeke`
3. Production branch: `main`
4. Build command: `npm run verify`
5. Deploy command: `npx wrangler deploy`
6. Root directory / Path: 저장소 루트라면 비워 둠
7. 저장 후 배포

`wrangler.jsonc`의 Worker 이름도 `legomeke`로 맞춰져 있습니다.

## 운영자 설정

Worker → Settings → Variables and Secrets에 아래 값을 추가합니다.

```text
ADMIN_USER_IDS=user_xxx
```

여러 운영자는 쉼표로 구분합니다.

## 배포 확인

```text
https://<주소>/healthz
```

정상 배포 버전:

```text
6.4.7-final
```

이전 버전이 보이면 배포 이력에서 최신 배포 성공 여부를 먼저 확인한 뒤 브라우저 사이트 데이터/서비스워커 캐시를 갱신합니다.
