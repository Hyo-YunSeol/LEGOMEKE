import fs from 'node:fs';
const checks = [
  ['src/game/constants.js', 'BODY_ADVANCEMENTS'],
  ['src/game/engine.js', 'selectBodyAdvancement'],
  ['src/game/engine.js', 'bodyStages: bodyStageRanking(state, 5)'],
  ['src/worker.js', '/api/profile/body-advancement'],
  ['src/game/sichuan.js', "SICHUAN_THEME_KEYS = ['life', 'nature', 'fantasy']"],
  ['public/app.js', '체형도감 TOP 5'],
  ['public/app.js', 'function sichuanTheme('],
  ['public/styles.css', '.sichuan-cell img'],
  ['public/sw.js', "const VERSION = '6101240'"]
];
let failed = 0;
for (const [file, marker] of checks) {
  const ok = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(marker);
  console.log(ok ? 'OK ' : 'FAIL', file, marker);
  if (!ok) failed += 1;
}
for (const file of ['src/game/davinci.js', 'src/game/spot-difference.js', 'public/spot-difference-scene.js']) {
  const ok = !fs.existsSync(file);
  console.log(ok ? 'OK ' : 'FAIL', file, 'removed');
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
