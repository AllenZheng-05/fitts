// Project detection for the folder field (SPEC-phase2 §4.1): main's real detection when the
// folder exists, otherwise the Phase 1 mock (so demo paths and e2e fixtures still work).
import type { Detection } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { detectFolder } from '../mock/detect';
import { bridge } from './bridge';

export function useDetection(folder: string): Detection | null {
  const mock = detectFolder(folder);
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

  const realForThis = real && real.folder === folder.trim() ? real.detection : null;
  return realForThis ?? mock;
}
