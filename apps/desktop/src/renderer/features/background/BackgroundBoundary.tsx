import { Component, type ReactNode } from 'react';

/**
 * The shape field is decoration. If WebGL or the physics engine fails, drop the shapes and
 * keep the app: without this, an error inside the canvas unmounts the whole React tree.
 */
export class BackgroundBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('Background shapes turned off after an error:', error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
