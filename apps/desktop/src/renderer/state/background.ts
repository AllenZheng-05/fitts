import { create } from 'zustand';

interface BackgroundState {
  /** A BeforeAfterSlider divider is being dragged: the shape field pauses (§6.12). */
  sliderDragging: boolean;
}

export const useBackground = create<BackgroundState>(() => ({ sliderDragging: false }));
