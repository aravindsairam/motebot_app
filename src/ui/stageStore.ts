// Which view is large on the main screen, the map or the camera, whether the small corner window
// is shown, and which corner it was dragged to. Tap the corner window to swap them. The corner is
// kept while the app runs, not after it is closed.

import { create } from 'zustand';

import type { Corner } from './corner';

export interface StageState {
  big: 'map' | 'camera';
  cornerShown: boolean;
  corner: Corner;
}

export const useStage = create<StageState>(() => ({ big: 'map', cornerShown: true, corner: 'bottomLeft' }));

export function setCorner(corner: Corner): void {
  useStage.setState({ corner });
}

export function swapViews(): void {
  useStage.setState((s) => ({ big: s.big === 'map' ? 'camera' : 'map' }));
}

export function showCorner(shown: boolean): void {
  useStage.setState({ cornerShown: shown });
}
