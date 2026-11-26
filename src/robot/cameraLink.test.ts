jest.mock('react-native-webrtc', () => ({}));

import { makeCameraKeeper } from './cameraLink';
import type { VideoState } from './video';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** A stand-in for watchCamera: counts the links made and closed, and lets a test say what they do. */
function fakeOpen() {
  const links: Array<{ address: string; closed: boolean; say: (s: VideoState) => void }> = [];
  const open = (address: string, onState: (s: VideoState) => void) => {
    const link = { address, closed: false, say: (s: VideoState) => !link.closed && onState(s) };
    links.push(link);
    onState({ kind: 'connecting' });
    return {
      close: () => {
        link.closed = true;
      },
    };
  };
  return { open, links };
}

const playing: VideoState = { kind: 'playing', streamUrl: 'stream-1' };

describe('the camera link', () => {
  it('is kept a while after the camera goes out of sight, and shown again at once', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    const heard: VideoState[] = [];
    let hide = keeper.show('pc', (s) => heard.push(s));
    links[0].say(playing);
    hide(); // a panel opens
    jest.advanceTimersByTime(9_000);
    hide = keeper.show('pc', (s) => heard.push(s)); // and closes
    expect(links).toHaveLength(1);
    expect(links[0].closed).toBe(false);
    expect(heard).toEqual([{ kind: 'connecting' }, playing, playing]);
    hide();
  });

  it('is closed once out of sight for longer', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    const hide = keeper.show('pc', () => {});
    links[0].say(playing);
    hide();
    jest.advanceTimersByTime(10_000);
    expect(links[0].closed).toBe(true);
    keeper.show('pc', () => {});
    expect(links).toHaveLength(2); // a new one
  });

  it('tells nobody while out of sight, and the latest state when seen again', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    const heard: VideoState[] = [];
    const hide = keeper.show('pc', (s) => heard.push(s));
    hide();
    links[0].say(playing); // arrives while hidden
    expect(heard).toEqual([{ kind: 'connecting' }]);
    keeper.show('pc', (s) => heard.push(s));
    expect(heard).toEqual([{ kind: 'connecting' }, playing]);
  });

  it('makes a new link after a failed one', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    const heard: VideoState[] = [];
    const hide = keeper.show('pc', (s) => heard.push(s));
    links[0].say({ kind: 'failed', why: 'lost' });
    expect(heard[1]).toEqual({ kind: 'failed', why: 'lost' });
    hide();
    keeper.show('pc', () => {});
    expect(links).toHaveLength(2);
  });

  it('closes the old link at once for another PC', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    keeper.show('pc', () => {})();
    keeper.show('other-pc', () => {});
    expect(links[0].closed).toBe(true);
    expect(links[1].address).toBe('other-pc');
  });

  it('keeps a newer look when an older one says it is gone', () => {
    const { open, links } = fakeOpen();
    const keeper = makeCameraKeeper(open, 10_000);
    const hideOld = keeper.show('pc', () => {});
    const heard: VideoState[] = [];
    keeper.show('pc', (s) => heard.push(s));
    hideOld(); // late, after the newer look began
    jest.advanceTimersByTime(20_000);
    expect(links[0].closed).toBe(false);
    links[0].say(playing);
    expect(heard).toContainEqual(playing);
  });
});
