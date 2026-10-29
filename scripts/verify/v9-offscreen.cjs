// V9: Electron offscreen rendering — paint rate at 1280×800, CPU cost, and that the CDP debugger
// and sendInputEvent work on an offscreen window. Run with the desktop app's Electron binary.
const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const OUT = join(__dirname, '..', '..', '.fitts-dev', 'verify');
const page = `<!doctype html><html><body style="margin:0;font:16px sans-serif">
<button id="b" style="position:absolute;left:100px;top:100px;width:120px;height:40px"
  onclick="this.textContent='clicked'">NEXT</button>
<input id="i" style="position:absolute;left:100px;top:200px">
<div id="spin" style="position:absolute;left:400px;top:300px;width:200px;height:200px;background:#3d5afe;
  animation:s 1s linear infinite"></div>
<style>@keyframes s{to{transform:rotate(360deg)}}</style></body></html>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  win.webContents.setFrameRate(30);
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));

  const results = {};
  let frames = 0;
  let jpegMs = 0;
  let lastSize = null;
  win.webContents.on('paint', (_e, _dirty, image) => {
    frames += 1;
    const t = performance.now();
    image.toJPEG(80);
    jpegMs += performance.now() - t;
    lastSize = image.getSize();
  });
  const cpu0 = process.cpuUsage();
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 5000));
  const secs = (Date.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  const metrics = app.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage }));
  results.paint = {
    fps: +(frames / secs).toFixed(1),
    frameSize: lastSize,
    avgJpegMs: +(jpegMs / Math.max(frames, 1)).toFixed(2),
    mainCpuPctOfOneCore: +(((cpu.user + cpu.system) / 1000 / (secs * 1000)) * 100).toFixed(1),
    processes: metrics,
  };

  // CDP on the offscreen window.
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    await dbg.sendCommand('DOM.enable');
    const { result } = await dbg.sendCommand('Runtime.evaluate', {
      expression: 'document.title + "|" + location.protocol',
      returnByValue: true,
    });
    const doc = await dbg.sendCommand('DOM.getDocument');
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#b',
    });
    const box = await dbg.sendCommand('DOM.getBoxModel', { nodeId });
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    // A CDP click on the button.
    const [x1, y1, , , x3, y3] = box.model.content;
    const cx = (x1 + x3) / 2;
    const cy = (y1 + y3) / 2;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await dbg.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: cx,
        y: cy,
        button: 'left',
        clickCount: 1,
      });
    }
    const after = await dbg.sendCommand('Runtime.evaluate', {
      expression: 'document.getElementById("b").textContent',
      returnByValue: true,
    });
    results.cdp = {
      ok: true,
      evaluate: result.value,
      box: box.model.content,
      screenshotBytes: Buffer.from(shot.data, 'base64').length,
      cdpClick: after.result.value,
    };
  } catch (e) {
    results.cdp = { ok: false, message: e.message };
  }

  // sendInputEvent: focus the input by clicking, then type characters.
  try {
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 150,
      y: 210,
      button: 'left',
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: 150,
      y: 210,
      button: 'left',
      clickCount: 1,
    });
    for (const ch of 'hi') win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await new Promise((r) => setTimeout(r, 300));
    const v = await win.webContents.executeJavaScript('document.getElementById("i").value');
    results.sendInputEvent = { ok: v === 'hi', typed: v };
  } catch (e) {
    results.sendInputEvent = { ok: false, message: e.message };
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'v9-offscreen.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  app.quit();
});
