// The robot's camera over WebRTC. The app posts its offer to http://<PC>:8080/offer (the
// vacuum_video node) and receives the video: no outside servers, so it works on a home network
// without internet. The PC answers with all its candidates at once, so the offer is sent only
// once this phone has gathered its own. Video only.

import { MediaStream, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';

export const VIDEO_PORT = 8080;
const GATHER_LIMIT_MS = 2000; // candidates on a home network come within milliseconds
const ANSWER_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 10_000;

/** The video's offer address, on the same PC as the gateway. `address` as the store keeps it:
 *  the host, with ":port" when the gateway's port is not the usual one. */
export function offerUrl(address: string): string | null {
  const m = /^([A-Za-z0-9.-]+)(:\d{1,5})?$/.exec(address.trim());
  return m ? `http://${m[1]}:${VIDEO_PORT}/offer` : null;
}

export type VideoState =
  | { kind: 'connecting' }
  | { kind: 'playing'; streamUrl: string }
  | { kind: 'failed'; why: string };

export interface VideoLink {
  close(): void;
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s`)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, GATHER_LIMIT_MS); // send what there is
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
  });
}

/** Start watching. `onState` hears connecting, then playing (with the stream to show) or failed. */
export function watchCamera(address: string, onState: (s: VideoState) => void): VideoLink {
  let closed = false;
  const pc = new RTCPeerConnection({ iceServers: [] });
  const report = (s: VideoState) => {
    if (!closed) onState(s);
  };
  const fail = (why: string) => {
    report({ kind: 'failed', why });
    close();
  };
  function close() {
    if (closed) return;
    closed = true;
    pc.close();
  }

  pc.addEventListener('track', (e: { track: unknown; streams?: MediaStream[] }) => {
    const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track as never]);
    report({ kind: 'playing', streamUrl: stream.toURL() });
  });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed') fail('the video connection failed');
    else if (pc.connectionState === 'disconnected') fail('the video connection was lost');
  });

  report({ kind: 'connecting' });
  void (async () => {
    const url = offerUrl(address);
    if (url === null) return fail(`cannot tell the PC's address from '${address}'`);
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      await pc.setLocalDescription(await pc.createOffer({}));
      await gathered(pc);
      if (closed) return;
      const local = pc.localDescription;
      if (!local) return fail('no offer was made');
      const response = await withTimeout(
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: local.sdp, type: local.type }) }),
        ANSWER_TIMEOUT_MS,
        'the video answer',
      );
      const body = await response.json();
      if (!response.ok) return fail(typeof body?.error === 'string' ? body.error : `the PC answered ${response.status}`);
      if (closed) return;
      await pc.setRemoteDescription(new RTCSessionDescription(body));
      setTimeout(() => {
        if (!closed && pc.connectionState !== 'connected') fail(`no video within ${CONNECT_TIMEOUT_MS / 1000} s`);
      }, CONNECT_TIMEOUT_MS);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      fail(/network request failed/i.test(text) ? `cannot reach ${url} (is the robot software running?)` : text);
    }
  })();

  return { close };
}
