// The connection to the robot's gateway. It keeps trying to connect for as long as it is started,
// with pauses that grow after each failure, and treats a connection that has gone quiet for
// 3 seconds as lost (the gateway sends a heartbeat every second). It knows the protocol's first
// message (Hello) and the heartbeat, and matches each Reply to the request it answers; every
// other message is handed on as it arrives.
//
// No React, no store: the socket and the clock can be replaced, so it is tested without a phone.

import { decodeFrame, encodeFrame, FrameError } from './framing';
import { CHANNEL_COMMAND, CHANNEL_DATA, DataType, decodeHello, decodeReply, type Hello, PROTOCOL_VERSION, type Reply } from './messages';

/** A request that ended without a Reply. */
export class RequestError extends Error {
  constructor(
    readonly reason: 'no_connection' | 'lost' | 'timed_out',
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  resolve: (reply: Reply) => void;
  reject: (error: RequestError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SocketLike {
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export type ConnectionStatus =
  | { kind: 'stopped' }
  // `attempt` counts from 1; `problem` says why the previous attempt failed, if one did.
  | { kind: 'connecting'; attempt: number; problem: string | null }
  | { kind: 'connected'; hello: Hello }
  // The gateway speaks a version of the protocol this app does not know. Nothing more is tried.
  | { kind: 'incompatible'; message: string };

export interface ConnectionOptions {
  url: string;
  onStatus: (status: ConnectionStatus) => void;
  onFrame: (type: number, payload: Uint8Array) => void; // every data message after Hello, except heartbeats
  onHeard?: (atMs: number) => void; // any message at all arrived
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
  silenceLimitMs?: number;
  connectTimeoutMs?: number;
  retry?: { firstMs: number; factor: number; maxMs: number };
  maxPayload?: number;
}

const CLOSE_NORMAL = 1000;
const CLOSE_SILENT = 4000; // app-chosen close codes are 4000-4999
const CLOSE_PROTOCOL = 4001;
const WATCH_PERIOD_MS = 250;

export class GatewayConnection {
  private readonly url: string;
  private readonly options: Required<Omit<ConnectionOptions, 'onHeard'>> & Pick<ConnectionOptions, 'onHeard'>;
  private socket: SocketLike | null = null;
  private running = false;
  private failures = 0; // failed attempts since the last good connection
  private problem: string | null = null;
  private socketError: string | null = null;
  private hello: Hello | null = null;
  private openedAt = 0;
  private heardAt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<number, Pending>();
  private lastRequestId = 0;

  constructor(options: ConnectionOptions) {
    this.url = options.url;
    // Each default is applied field by field: an option passed as `undefined` means "use the
    // default", and must not overwrite it (spreading the options over the defaults would).
    this.options = {
      url: options.url,
      onStatus: options.onStatus,
      onFrame: options.onFrame,
      onHeard: options.onHeard,
      createSocket: options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike),
      now: options.now ?? (() => Date.now()),
      silenceLimitMs: options.silenceLimitMs ?? 3000,
      connectTimeoutMs: options.connectTimeoutMs ?? 5000,
      retry: options.retry ?? { firstMs: 500, factor: 1.5, maxMs: 5000 },
      maxPayload: options.maxPayload ?? 16 * 1024 * 1024,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.failures = 0;
    this.problem = null;
    this.watchTimer = setInterval(() => this.watch(), WATCH_PERIOD_MS);
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    this.retryTimer = this.watchTimer = null;
    this.dropSocket(CLOSE_NORMAL, 'closed by the app');
    this.failPending('lost', 'disconnected before the robot answered; it may still act on the request');
    this.setStatus({ kind: 'stopped' });
  }

  /**
   * Send a command and wait for its Reply. `encode` builds the command's message around the
   * request number. Rejects with a RequestError when not connected, when the connection is lost
   * first, or after `timeoutMs` (longer than the gateway's own limit, so normally the gateway's
   * "timed out" Reply arrives first).
   */
  request(type: number, encode: (requestId: number) => Uint8Array, timeoutMs: number): Promise<Reply> {
    const socket = this.socket;
    if (socket === null || this.hello === null) {
      return Promise.reject(new RequestError('no_connection', 'not connected to the robot'));
    }
    this.lastRequestId = this.lastRequestId >= 0xffffffff ? 1 : this.lastRequestId + 1;
    const id = this.lastRequestId;
    let frame: Uint8Array;
    try {
      frame = encodeFrame(CHANNEL_COMMAND, type, encode(id), this.options.maxPayload);
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RequestError('timed_out', `no answer within ${Math.round(timeoutMs / 1000)} s; the robot may still act on it`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        socket.send(frame);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new RequestError('lost', `could not send (${describe(error) ?? 'unknown error'})`));
      }
    });
  }

  private failPending(reason: 'lost', message: string): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const p of waiting) {
      clearTimeout(p.timer);
      p.reject(new RequestError(reason, message));
    }
  }

  private receiveReply(payload: Uint8Array): void {
    let reply: Reply;
    try {
      reply = decodeReply(payload);
    } catch {
      return; // unreadable: the request it answers will time out
    }
    const waiting = this.pending.get(reply.requestId);
    if (waiting === undefined) return; // an answer to a request already given up on
    this.pending.delete(reply.requestId);
    clearTimeout(waiting.timer);
    waiting.resolve(reply);
  }

  /** The delay before attempt number `failures + 1`, after `failures` failed attempts. */
  retryDelayMs(failures: number): number {
    const { firstMs, factor, maxMs } = this.options.retry;
    return Math.min(maxMs, firstMs * Math.pow(factor, Math.max(0, failures - 1)));
  }

  private open(): void {
    this.retryTimer = null;
    if (!this.running) return;
    this.hello = null;
    this.socketError = null;
    this.setStatus({ kind: 'connecting', attempt: this.failures + 1, problem: this.problem });
    let socket: SocketLike;
    try {
      socket = this.options.createSocket(this.url);
    } catch (error) {
      this.fail(`could not open a connection (${describe(error) ?? 'unknown error'})`);
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.openedAt = this.heardAt = this.options.now();
    // Events from a socket that has since been replaced are ignored.
    socket.onmessage = (event) => this.socket === socket && this.receive(event.data);
    socket.onerror = (event) => {
      if (this.socket === socket) this.socketError = describe(event);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.fail(closedText(event, this.socketError));
    };
  }

  private receive(data: unknown): void {
    const now = this.options.now();
    if (!(data instanceof ArrayBuffer)) return; // only binary messages carry anything
    let frame;
    try {
      frame = decodeFrame(data, this.options.maxPayload);
    } catch (error) {
      if (error instanceof FrameError) return; // a broken message is skipped; the next one may be fine
      throw error;
    }
    this.heardAt = now;
    this.options.onHeard?.(now);
    if (frame.channel !== CHANNEL_DATA) return;

    if (this.hello === null) {
      this.receiveHello(frame.type, frame.payload);
      return;
    }
    if (frame.type === DataType.DATA_HEARTBEAT || frame.type === DataType.DATA_HELLO) return;
    if (frame.type === DataType.DATA_REPLY) {
      this.receiveReply(frame.payload);
      return;
    }
    this.options.onFrame(frame.type, frame.payload);
  }

  private receiveHello(type: number, payload: Uint8Array): void {
    if (type !== DataType.DATA_HELLO) {
      this.dropSocket(CLOSE_PROTOCOL, 'expected Hello first');
      this.fail('the robot did not introduce itself first; is this the vacuum gateway?');
      return;
    }
    let hello: Hello;
    try {
      hello = decodeHello(payload);
    } catch (error) {
      this.dropSocket(CLOSE_PROTOCOL, 'unreadable Hello');
      this.fail(`the robot's first message could not be read (${describe(error) ?? 'unknown error'})`);
      return;
    }
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      const newer = hello.protocolVersion > PROTOCOL_VERSION;
      this.running = false;
      if (this.watchTimer !== null) clearInterval(this.watchTimer);
      this.watchTimer = null;
      this.dropSocket(CLOSE_PROTOCOL, 'unknown protocol version');
      this.setStatus({
        kind: 'incompatible',
        message:
          `The robot uses version ${hello.protocolVersion} of the app's message format, and this app knows version ${PROTOCOL_VERSION}. ` +
          (newer ? 'Update the app.' : "Update the robot's software."),
      });
      return;
    }
    this.hello = hello;
    this.failures = 0;
    this.problem = null;
    this.setStatus({ kind: 'connected', hello });
  }

  private watch(): void {
    if (!this.running || this.socket === null) return;
    const now = this.options.now();
    if (this.hello === null) {
      if (now - this.openedAt > this.options.connectTimeoutMs) {
        this.dropSocket(CLOSE_SILENT, 'no answer');
        this.fail(`no answer within ${this.options.connectTimeoutMs / 1000} s`);
      }
    } else if (now - this.heardAt > this.options.silenceLimitMs) {
      this.dropSocket(CLOSE_SILENT, 'silent');
      this.fail(`no message from the robot for ${this.options.silenceLimitMs / 1000} s`);
    }
  }

  /** The attempt has ended. Try again after a pause, unless stopped. */
  private fail(problem: string): void {
    this.dropSocket(CLOSE_NORMAL, '');
    this.hello = null;
    this.failPending('lost', 'the connection was lost before the robot answered; it may still act on the request');
    if (!this.running || this.retryTimer !== null) return;
    this.failures += 1;
    this.problem = problem;
    this.setStatus({ kind: 'connecting', attempt: this.failures + 1, problem });
    this.retryTimer = setTimeout(() => this.open(), this.retryDelayMs(this.failures));
  }

  private dropSocket(code: number, reason: string): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      socket.close(code, reason);
    } catch {
      // closing a socket that never opened can throw; it is gone either way
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.options.onStatus(status);
  }
}

/** Readable text from an error or an error event, or null when it has none. React Native's
 *  WebSocket error event often carries no message; printing the object would show "[object Object]". */
function describe(value: unknown): string | null {
  if (value instanceof Error) return value.message || value.name;
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' && value.message) {
    return value.message;
  }
  if (typeof value === 'string' && value) return value;
  return null;
}

function closedText(event: { code: number; reason: string }, error: string | null): string {
  if (error) return error;
  if (event.reason) return `connection closed (${event.reason})`;
  return event.code === 1006 ? 'connection lost' : `connection closed (code ${event.code})`;
}
