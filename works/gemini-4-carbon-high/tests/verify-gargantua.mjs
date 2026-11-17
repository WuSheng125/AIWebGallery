import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const outDir = 'C:\\Users\\65776\\.gemini\\tmp\\gemini-4-carbon-high\\screenshots';
fs.mkdirSync(outDir, { recursive: true });

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const edgePath = edgeCandidates.find((p) => fs.existsSync(p)) || edgeCandidates[0];
const url = process.env.TEST_URL || 'http://127.0.0.1:4173/';

async function isServerReady(targetUrl) {
  try {
    const res = await fetch(targetUrl);
    return res.ok;
  } catch {
    return false;
  }
}

let previewProc = null;
if (!(await isServerReady(url))) {
  previewProc = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    { stdio: 'ignore' }
  );
  for (let i = 0; i < 30; i++) {
    if (await isServerReady(url)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

let exitCode = 0;
try {
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 940 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  const errors = [];
  const warnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Verify canvas is mounted and full viewport
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox || canvasBox.width < 800 || canvasBox.height < 500) {
    throw new Error(`Invalid WebGL canvas dimensions: ${JSON.stringify(canvasBox)}`);
  }

  // 1. Default Gargantua with UI
  await page.screenshot({ path: path.join(outDir, 'v3_1_default_ui.png') });

  // 2. Pure Cinema View (hide HUD via H key)
  await page.keyboard.press('h');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, 'v3_2_gargantua_cinema.png') });

  // Restore HUD
  await page.keyboard.press('h');
  await page.waitForTimeout(300);

  // 3. Test mouse drag orbit + wheel zoom
  const beforeTelemetry = await page.locator('.telemetry-grid').innerText();
  await page.mouse.move(650, 470);
  await page.mouse.down();
  await page.mouse.move(410, 350, { steps: 18 });
  await page.mouse.up();
  await page.mouse.wheel(0, -260);
  await page.waitForTimeout(900);
  const afterTelemetry = await page.locator('.telemetry-grid').innerText();
  if (beforeTelemetry === afterTelemetry) {
    throw new Error('Expected observer telemetry to update after mouse zoom/orbit');
  }
  await page.screenshot({ path: path.join(outDir, 'v3_3_orbited_zoomed.png') });

  // 4. Test Kerr Astrophysics preset
  await page.getByText('天体物理写实 · 极速克尔').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'v3_4_kerr_doppler.png') });

  // 5. Test Einstein Ring pure lensing preset
  await page.getByText('爱因斯坦环 · 纯引力透镜').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'v3_5_einstein_ring.png') });

  // 6. Test Quasar electric blue preset
  await page.getByText('高能类星体 · 电蓝等离子').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'v3_6_quasar_blue.png') });

  // 7. Test Retrograde spin slider interaction (-0.75)
  const spinSlider = page.locator('input.gargantua-slider').nth(1);
  await spinSlider.fill('-0.75');
  await spinSlider.dispatchEvent('change');
  await page.waitForTimeout(850);
  await page.screenshot({ path: path.join(outDir, 'v3_7_retrograde_slider.png') });

  // 8. Test Crimson Tide preset
  await page.getByText('红巨星潮汐瓦解 · 赤金余烬').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, 'v3_8_crimson_tide.png') });

  console.log('CANVAS_BOX:', JSON.stringify(canvasBox));
  console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
  console.log('CONSOLE_WARNINGS:', JSON.stringify(warnings));

  await browser.close();

  if (errors.length > 0) {
    exitCode = 1;
  }
} finally {
  if (previewProc) {
    previewProc.kill();
  }
}

process.exit(exitCode);
