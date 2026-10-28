import { app, screen, type Rectangle } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WindowState {
  bounds?: Rectangle;
  maximized?: boolean;
}

const file = (): string => join(app.getPath('userData'), 'window-state.json');

export function loadWindowState(): WindowState {
  try {
    const state = JSON.parse(readFileSync(file(), 'utf8')) as WindowState;
    // Drop saved bounds that no longer land on a connected display.
    if (state.bounds && !isOnSomeDisplay(state.bounds)) delete state.bounds;
    return state;
  } catch {
    return {};
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    writeFileSync(file(), JSON.stringify(state));
  } catch {
    // Losing the window position is harmless.
  }
}

function isOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: area }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapX >= 100 && overlapY >= 100;
  });
}
