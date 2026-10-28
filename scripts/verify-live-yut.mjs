// Run AFTER Cloudflare deploy. A correct static site with an old Worker is not a valid release.
const base = (process.argv[2] || 'https://legomeke.bbwlegolife.workers.dev').replace(/\/+$/, '');
const expectedVersion = '6.10.44-yut-forest';
let failed = false;
for (const path of ['/healthz', '/api/health']) {
  const url = `${base}${path}?verify=${Date.now()}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.version !== expectedVersion || body.features?.yutnori !== true) {
      console.error(`[ERROR] ${path}: HTTP ${response.status}, version=${body?.version ?? 'unknown'}, yutnori=${body?.features?.yutnori ?? 'not-installed'}`);
      failed = true;
    } else {
      console.log(`[OK] ${path}: ${body.version} / yutnori enabled`);
    }
  } catch (error) {
    failed = true;
    console.error(`[ERROR] ${path}: ${error.message}`);
  }
}
if (failed) {
  console.error('Cloudflare Worker 전체를 배포해야 합니다. 정적 파일(public)만 올리면 윷놀이 API가 설치되지 않습니다.');
  process.exitCode = 1;
} else {
  console.log('윷놀이 API 버전이 정상 배포되어 있습니다.');
}
