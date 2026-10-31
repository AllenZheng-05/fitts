// Project detection for the folder field (SPEC-phase2 §4.1): main's real detection when the
// folder exists, otherwise the Phase 1 mock (so demo paths and e2e fixtures still work).
import type { Detection } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { TEST_BUILD } from '../dev';
import { detectFolder } from '../mock/detect';
import { bridge } from './bridge';

export function useDetection(folder: string): Detection | null {
  const mock = TEST_BUILD ? detectFolder(folder) : null;
  const [real, setReal] = useState<{ folder: string; detection: Detection | null } | null>(null);

  useEffect(() => {
    const site = bridge().site;
    const path = folder.trim();
    if (!site || !path) return;
    let current = true;
    const timer = setTimeout(() => {
      void site.detect(path).then((detection) => {
        if (current) setReal({ folder: path, detection });
      });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [folder]);

  // In the app, nothing shows until main has looked at the folder: answering with the mock first
  // let a quick "Open" save a Phase 1 fixture (a folder named "portfolio" became a fake Next.js
  // site). The mock stays the answer for folders main can't find, and outside Electron.
  // A release never answers with a fixture: a folder main can't read is simply not a project.
  if (!bridge().site) return TEST_BUILD ? mock : null;
  if (!real || real.folder !== folder.trim()) return null;
  return real.detection ?? (TEST_BUILD ? mock : null);
}
