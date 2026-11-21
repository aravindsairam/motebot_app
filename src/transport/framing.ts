// How one message travels inside one WebSocket binary message. The same layout as the gateway's
// framing.py (ros2_ws/src/vacuum_gateway):
//
//   byte 0      channel: 0 = command (app -> gateway), 1 = data (gateway -> app)
//   byte 1      type of the protobuf message that follows (proto/vacuum.proto)
//   bytes 2-5   its length in bytes, unsigned, big-endian
//   bytes 6-    the protobuf message

export const HEADER_SIZE = 6;

export class FrameError extends Error {}

export interface Frame {
  channel: number;
  type: number;
  payload: Uint8Array;
}

export function encodeFrame(channel: number, type: number, payload: Uint8Array, maxPayload: number): Uint8Array {
  if (!isByte(channel) || !isByte(type)) {
    throw new FrameError(`channel ${channel} or type ${type} does not fit in one byte`);
  }
  if (payload.length > maxPayload) {
    throw new FrameError(`message of ${payload.length} bytes is over the limit of ${maxPayload}`);
  }
  const out = new Uint8Array(HEADER_SIZE + payload.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, channel);
  view.setUint8(1, type);
  view.setUint32(2, payload.length, false);
  out.set(payload, HEADER_SIZE);
  return out;
}

export function decodeFrame(data: ArrayBuffer | Uint8Array, maxPayload: number): Frame {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < HEADER_SIZE) {
    throw new FrameError(`${bytes.length} bytes is shorter than the ${HEADER_SIZE}-byte header`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(2, false);
  if (length > maxPayload) {
    throw new FrameError(`message of ${length} bytes is over the limit of ${maxPayload}`);
  }
  if (bytes.length - HEADER_SIZE !== length) {
    throw new FrameError(`the header says ${length} bytes follow, but ${bytes.length - HEADER_SIZE} do`);
  }
  return { channel: view.getUint8(0), type: view.getUint8(1), payload: bytes.subarray(HEADER_SIZE) };
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
