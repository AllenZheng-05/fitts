import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Background } from './features/background/Background';
import { BackgroundBoundary } from './features/background/BackgroundBoundary';
import { syncKeysFromMain } from './lib/keys';
import { platform } from './lib/platform';
import './styles/index.css';

document.documentElement.classList.add(`platform-${platform()}`);
syncKeysFromMain();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <>
    {/* Outside StrictMode: its dev-only mount, unmount, remount frees the physics world
        that @react-three/rapier then reuses ("null pointer passed to rust"). */}
    <BackgroundBoundary>
      <Background />
    </BackgroundBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </>,
);
