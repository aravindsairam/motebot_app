import { decodeFrame, encodeFrame, FrameError } from './framing';

describe('framing', () => {
  it('lays out the header like the gateway', () => {
    const frame = encodeFrame(1, 0x10, new Uint8Array([97, 98, 99]), 100);
    expect([...frame]).toEqual([1, 0x10, 0, 0, 0, 3, 97, 98, 99]);
  });

  it('round-trips a message longer than 64 KB', () => {
    const payload = new Uint8Array(76800).map((_, i) => i % 256);
    const frame = decodeFrame(encodeFrame(0, 0x81, payload, 1 << 20), 1 << 20);
    expect(frame.channel).toBe(0);
    expect(frame.type).toBe(0x81);
    expect(frame.payload).toEqual(payload);
  });

  it('reads from an ArrayBuffer, as the WebSocket delivers it', () => {
    const bytes = encodeFrame(1, 2, new Uint8Array([5]), 10);
    const frame = decodeFrame(bytes.buffer.slice(0) as ArrayBuffer, 10);
    expect([...frame.payload]).toEqual([5]);
  });

  it('reads a frame that sits inside a larger buffer', () => {
    const outer = new Uint8Array(20);
    outer.set(encodeFrame(1, 2, new Uint8Array([7, 8]), 10), 4);
    const frame = decodeFrame(outer.subarray(4, 12), 10);
    expect([...frame.payload]).toEqual([7, 8]);
  });

  it('refuses short input, a wrong length and an oversized message', () => {
    expect(() => decodeFrame(new Uint8Array([1, 2, 0]), 10)).toThrow(FrameError);
    expect(() => decodeFrame(new Uint8Array([1, 2, 0, 0, 0, 3, 1, 2]), 10)).toThrow(/header says 3/);
    expect(() => decodeFrame(new Uint8Array([1, 2, 0, 0, 0, 11, ...new Array(11).fill(0)]), 10)).toThrow(/over the limit/);
    expect(() => encodeFrame(1, 1, new Uint8Array(11), 10)).toThrow(/over the limit/);
    expect(() => encodeFrame(256, 1, new Uint8Array(0), 10)).toThrow(FrameError);
  });
});
