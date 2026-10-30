const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cache = process.env.NIKKE_CACHE_DIR || path.resolve(root, '..', 'codex temp', 'nikke-desktop');
const temp = path.join(cache, 'temp');
fs.mkdirSync(temp, { recursive: true });
const zbx = spawnSync(process.execPath,[path.join(root,'desktop-scripts/zbx-module.mjs')],{cwd:root,stdio:'inherit'});
if(zbx.status !== 0) process.exit(zbx.status ?? 1);
const notices = spawnSync(process.execPath, [path.join(root,'desktop-scripts/workshop-notices.mjs')], {cwd:root,stdio:'inherit'});
if(notices.status !== 0) process.exit(notices.status ?? 1);
for (const tool of ['core-dust', 'equipment-reroll']) {
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'), 'build',
  '--config', `tools/${tool}/vite.config.mjs`, '--configLoader', 'native',
], { cwd: root, stdio: 'inherit', env: { ...process.env, TEMP: temp, TMP: temp } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
}
const about = spawnSync(process.execPath, [path.join(root, 'desktop-scripts/prepare-about.mjs')], {cwd:root,stdio:'inherit'});
if (about.status !== 0) process.exit(about.status ?? 1);
