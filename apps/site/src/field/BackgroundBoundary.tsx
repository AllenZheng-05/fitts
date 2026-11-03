import { Component, type ReactNode } from 'react';

/**
 * The shape field is decoration. If WebGL or the physics engine fails, drop the shapes and
 * keep the page (and its still image): an error inside the canvas would unmount the page.
 */
export class BackgroundBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('Background shapes turned off after an error:', error);
    this.props.onError?.();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
