# GitHub · Cloudflare 신규 배포

## 1. GitHub 저장소 구조

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

압축 폴더가 한 단계 더 들어가거나 ZIP 파일만 올라가면 안 됩니다.

## 2. Cloudflare Worker 생성

1. Workers & Pages → Create → Connect GitHub
2. 저장소 `Hyo-YunSeol/lego`, 브랜치 `main` 선택
3. Worker 이름 `lego`
4. Build command: `npm run verify`
5. Deploy command: `npx --yes wrangler@4.114.0 deploy`
6. Root directory / Path: 완전히 비움
7. 저장 후 배포

`package.json`의 `deploy:cloudflare` 스크립트도 같은 Wrangler 버전을 사용합니다.

## 3. 운영자 설정

1. 사이트에서 일반 계정을 먼저 생성합니다.
2. 기록 화면의 User ID를 확인합니다.
3. Worker → Settings → Variables and Secrets에 추가합니다.

```text
ADMIN_USER_IDS=user_xxx
```

여러 운영자는 쉼표로 구분합니다.

## 4. 배포 확인

```text
https://<주소>/healthz
```

정상 응답 버전:

```text
6.4.0-final
```

화면이 이전 버전이면 브라우저 사이트 데이터를 지우거나 서비스워커를 해제한 후 다시 접속합니다.
