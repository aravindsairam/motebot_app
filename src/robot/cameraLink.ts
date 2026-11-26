// The camera link, kept for a while after the camera goes out of sight. A panel (Go to, Clean,
// Zones, Rooms) hides the camera behind the large map, and so does a look at another tab; when it
// comes back within KEEP_MS the same link is shown again, at once, instead of a new one being
// made. Kept longer than that, the PC would go on sending video that nobody sees.
//
// The timer is a plain one, outside React: a hidden tab is frozen and does not redraw, so a
// timer kept in a screen's state would not close the link until the tab was opened again.

import { type VideoLink, type VideoState, watchCamera } from './video';

export const KEEP_MS = 10_000;

type Open = (address: string, onState: (s: VideoState) => void) => VideoLink;

export interface CameraKeeper {
  /** Show the camera at `address`: `onState` hears its state at once, then each change. Returns
   *  the function to call when it goes out of sight. */
  show(address: string, onState: (s: VideoState) => void): () => void;
}

export function makeCameraKeeper(open: Open = watchCamera, keepMs = KEEP_MS): CameraKeeper {
  let link: { address: string; video: VideoLink; state: VideoState } | null = null;
  let viewer: ((s: VideoState) => void) | null = null;
  let closer: ReturnType<typeof setTimeout> | null = null;

  const stopCloser = () => {
    if (closer !== null) clearTimeout(closer);
    closer = null;
  };
  const drop = () => {
    stopCloser();
    link?.video.close();
    link = null;
  };

  return {
    show(address, onState) {
      stopCloser();
      if (link !== null && link.address !== address) drop();
      viewer = onState;
      if (link !== null) {
        onState(link.state); // the kept link: its picture is there already
      } else {
        const made: { address: string; video: VideoLink; state: VideoState } = {
          address,
          video: { close: () => {} },
          state: { kind: 'connecting' },
        };
        link = made;
        made.video = open(address, (s) => {
          if (link !== made) return; // no longer kept (and a closed link is silent anyway)
          made.state = s;
          if (s.kind === 'failed') link = null; // it closed itself: the next look makes a new one
          viewer?.(s);
        });
      }
      const shownTo = onState;
      return () => {
        if (viewer !== shownTo) return; // already replaced by a newer look
        viewer = null;
        if (link !== null) closer = setTimeout(drop, keepMs);
      };
    },
  };
}

export const cameraKeeper = makeCameraKeeper();
