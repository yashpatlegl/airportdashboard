/**
 * Renders the architecture diagram HTML files to high-resolution PNGs.
 *
 * Usage:  node render.mjs [file1.html file2.html ...]
 * Default: renders every NN-*.html in this directory.
 *
 * Requires a Chrome/Chromium binary (set CHROME env var to override).
 */
import { spawn } from 'node:child_process';
import { readdir, writeFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..');
const SCALE = Number(process.env.SCALE || 2);
const CHROME =
  process.env.CHROME || '/opt/playwright/chromium-1232/chrome-linux64/chrome';

const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : (await readdir(here)).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();

const port = 9333 + Math.floor(Math.random() * 400);
const profile = await mkdtemp(join(tmpdir(), 'chrome-render-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  '--allow-file-access-from-files',
  'about:blank',
]);
chrome.stderr.on('data', () => {});

const version = await waitFor(async () => {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  return res.json();
});

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((ok, err) => {
  ws.onopen = ok;
  ws.onerror = err;
});

let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, err } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? err(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  } else if (msg.method) {
    events.push(msg);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((ok, err) => {
    const id = ++msgId;
    pending.set(id, { ok, err });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

for (const file of files) {
  const url = `file://${join(here, file)}`;
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 900,
    deviceScaleFactor: SCALE,
    mobile: false,
  }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await waitForEvent('Page.loadEventFired', sessionId);
  await new Promise((r) => setTimeout(r, 350)); // let fonts settle

  const { result } = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('.canvas') || document.body;
      const r = c.getBoundingClientRect();
      return JSON.stringify({ w: Math.ceil(r.width), h: Math.ceil(r.height) });
    })()`,
    returnByValue: true,
  }, sessionId);
  const { w, h } = JSON.parse(result.value);

  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: SCALE,
    mobile: false,
  }, sessionId);
  await new Promise((r) => setTimeout(r, 200));

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: SCALE },
  }, sessionId);

  const out = join(outDir, basename(file).replace(/\.html$/, '.png'));
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log(`${basename(out)}  ${w}x${h} css  ->  ${w * SCALE}x${h * SCALE} px`);

  await send('Target.closeTarget', { targetId });
}

ws.close();
chrome.kill();

async function waitFor(fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('timed out waiting for Chrome');
}

async function waitForEvent(method, sessionId, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const idx = events.findIndex(
      (e) => e.method === method && (!sessionId || e.sessionId === sessionId),
    );
    if (idx >= 0) return events.splice(idx, 1)[0];
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`timed out waiting for ${method}`);
}
