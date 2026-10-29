import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import { loadWindowState, saveWindowState } from './window-state';

// Sizes are the web content area, so the 1440×900 design frame and the layout guard
// mean the same thing on every platform (see docs/DECISIONS.md).
export const DEFAULT_SIZE = { width: 1440, height: 900 } as const;
export const MIN_SIZE = { width: 1200, height: 720 } as const;

const PAPER = '#FBFAF7';
/** The Fitts app icon (Logos3 option D on its tile), in place of Electron's default. */
export const ICON_PATH = join(__dirname, '../../resources/icon.png');
const isMac = process.platform === 'darwin';

export function createMainWindow(): BrowserWindow {
  const saved = loadWindowState();

  const win = new BrowserWindow({
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    useContentSize: true,
    center: true,
    resizable: true,
    show: false,
    title: 'Fitts',
    icon: ICON_PATH,
    backgroundColor: PAPER,
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 24 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // minWidth/minHeight constrain the outer window; add the frame so content stays ≥ 1200×720.
  const [outerW = 0, outerH = 0] = win.getSize();
  const [contentW = 0, contentH = 0] = win.getContentSize();
  const frame = { width: outerW - contentW, height: outerH - contentH };
  win.setMinimumSize(MIN_SIZE.width + frame.width, MIN_SIZE.height + frame.height);

  if (saved.bounds) win.setContentBounds(saved.bounds);
  else fitDefaultSize(win, frame);
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  trackWindowState(win, saved.bounds);
  lockDownNavigation(win);

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

/** Opens at 1440×900, shrunk to fit smaller screens (never below the minimum), centered. */
function fitDefaultSize(win: BrowserWindow, frame: { width: number; height: number }): void {
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  const width = Math.min(DEFAULT_SIZE.width, workArea.width - frame.width);
  const height = Math.min(DEFAULT_SIZE.height, workArea.height - frame.height);
  win.setContentSize(Math.max(width, MIN_SIZE.width), Math.max(height, MIN_SIZE.height));
  win.center();
}

function trackWindowState(win: BrowserWindow, initial: Rectangle | undefined): void {
  let normalBounds = initial;
  let timer: NodeJS.Timeout | undefined;

  const save = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const maximized = win.isMaximized() || win.isFullScreen();
    if (!maximized) normalBounds = win.getContentBounds();
    saveWindowState({ bounds: normalBounds, maximized });
  };
  const saveSoon = (): void => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };

  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  win.on('close', () => {
    clearTimeout(timer);
    save();
  });
}

// Phase 1 never leaves the app: no new windows, no navigation away from the bundle.
function lockDownNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
}
