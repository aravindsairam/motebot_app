import { type ConnectionStatus, GatewayConnection, RequestError } from './connection';
import { CommandType, DataType, encodeChangeMode, encodePing } from './messages';
import { dataFrame, heartbeatFrame, helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, TestSocket } from './testSocket';

function setup() {
  const statuses: ConnectionStatus[] = [];
  const frames: number[] = [];
  const connection = new GatewayConnection({
    url: 'ws://pc:9090',
    createSocket: TestSocket.create,
    onStatus: (s) => statuses.push(s),
    onFrame: (type) => frames.push(type),
  });
  const last = () => statuses[statuses.length - 1];
  return { connection, statuses, frames, last };
}

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => jest.useRealTimers());

describe('GatewayConnection', () => {
  it('is connected once the robot has introduced itself', () => {
    const { connection, last } = setup();
    connection.start();
    expect(TestSocket.made).toHaveLength(1);
    expect(TestSocket.latest().url).toBe('ws://pc:9090');
    expect(TestSocket.latest().binaryType).toBe('arraybuffer');
    expect(last()).toEqual({ kind: 'connecting', attempt: 1, problem: null });
    TestSocket.latest().deliver(helloFrame());
    expect(last()).toEqual({ kind: 'connected', hello: { protocolVersion: 1, robotName: 'Test robot', gatewayVersion: '9.9' } });
    connection.stop();
  });

  it('hands on every message after Hello except heartbeats', () => {
    const { connection, frames } = setup();
    connection.start();
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    socket.deliver(heartbeatFrame());
    socket.deliver(robotStateFrame('idle'));
    socket.deliver(dataFrame(0x7e, new Uint8Array([1]))); // a type added later: passed on, not an error
    expect(frames).toEqual([DataType.DATA_ROBOT_STATE, 0x7e]);
    connection.stop();
  });

  it('stays connected while heartbeats arrive', () => {
    const { connection, last } = setup();
    connection.start();
    TestSocket.latest().deliver(helloFrame());
    for (let i = 0; i < 20; i++) {
      jest.advanceTimersByTime(1000);
      TestSocket.latest().deliver(heartbeatFrame(i));
    }
    expect(last().kind).toBe('connected');
    expect(TestSocket.made).toHaveLength(1);
    connection.stop();
  });

  it('treats 3 s of silence as a lost connection and tries again', () => {
    const { connection, last } = setup();
    connection.start();
    const first = TestSocket.latest();
    first.deliver(helloFrame());
    jest.advanceTimersByTime(2900);
    expect(last().kind).toBe('connected');
    jest.advanceTimersByTime(400);
    expect(first.closedWith?.code).toBe(4000);
    expect(last()).toEqual({ kind: 'connecting', attempt: 2, problem: 'no message from the robot for 3 s' });
    jest.advanceTimersByTime(500);
    expect(TestSocket.made).toHaveLength(2);
    connection.stop();
  });

  it('waits longer after each failure, up to 5 s', () => {
    const { connection } = setup();
    connection.start();
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      const count = TestSocket.made.length;
      TestSocket.latest().fail('Failed to connect');
      let waited = 0;
      while (TestSocket.made.length === count) {
        jest.advanceTimersByTime(50);
        waited += 50;
      }
      delays.push(waited);
    }
    expect(delays).toEqual([500, 750, 1150, 1700, 2550, 3800, 5000, 5000]);
    connection.stop();
  });

  it('says why the last attempt failed', () => {
    const { connection, last } = setup();
    connection.start();
    TestSocket.latest().fail('Failed to connect to /10.0.2.2:9090');
    expect(last()).toEqual({ kind: 'connecting', attempt: 2, problem: 'Failed to connect to /10.0.2.2:9090' });
    connection.stop();
  });

  it('uses the close reason when the error event has no text (as on Android)', () => {
    const { connection, last } = setup();
    connection.start();
    TestSocket.latest().deliver(helloFrame());
    TestSocket.latest().onerror?.({ isTrusted: false }); // no message
    TestSocket.latest().onclose?.({ code: 1006, reason: '' });
    expect(last()).toEqual({ kind: 'connecting', attempt: 2, problem: 'connection lost' });
    connection.stop();
  });

  it('gives up on an attempt that gets no answer in 5 s', () => {
    const { connection, last } = setup();
    connection.start();
    jest.advanceTimersByTime(5300);
    expect(TestSocket.latest().closedWith).not.toBeNull();
    expect(last()).toEqual({ kind: 'connecting', attempt: 2, problem: 'no answer within 5 s' });
    connection.stop();
  });

  it('starts counting again from 1 after a good connection', () => {
    const { connection, statuses } = setup();
    connection.start();
    TestSocket.latest().fail('refused');
    jest.advanceTimersByTime(500);
    TestSocket.latest().fail('refused');
    jest.advanceTimersByTime(750);
    TestSocket.latest().deliver(helloFrame());
    TestSocket.latest().fail('lost');
    expect(statuses[statuses.length - 1]).toEqual({ kind: 'connecting', attempt: 2, problem: 'lost' });
    const before = TestSocket.made.length;
    jest.advanceTimersByTime(500); // the first, shortest pause again
    expect(TestSocket.made.length).toBe(before + 1);
    connection.stop();
  });

  it('refuses a robot whose first message is not Hello', () => {
    const { connection, last } = setup();
    connection.start();
    TestSocket.latest().deliver(robotStateFrame('idle'));
    expect(last().kind).toBe('connecting');
    expect((last() as { problem: string }).problem).toMatch(/did not introduce itself/);
    connection.stop();
  });

  it('stops for good on a protocol version it does not know, and says what to update', () => {
    const { connection, last } = setup();
    connection.start();
    TestSocket.latest().deliver(helloFrame(2));
    expect(last()).toEqual({ kind: 'incompatible', message: expect.stringMatching(/version 2 .* Update the app\./) });
    expect(TestSocket.latest().closedWith?.code).toBe(4001);
    jest.advanceTimersByTime(60000);
    expect(TestSocket.made).toHaveLength(1);
  });

  it('after stop, makes no more attempts and ignores the old socket', () => {
    const { connection, statuses, frames } = setup();
    connection.start();
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    connection.stop();
    expect(statuses[statuses.length - 1]).toEqual({ kind: 'stopped' });
    expect(socket.closedWith?.code).toBe(1000);
    socket.deliver(robotStateFrame('idle'));
    socket.fail('late');
    jest.advanceTimersByTime(60000);
    expect(TestSocket.made).toHaveLength(1);
    expect(frames).toEqual([]);
    expect(statuses[statuses.length - 1]).toEqual({ kind: 'stopped' });
  });

  it("uses the phone's WebSocket when no socket maker is given, even one passed as undefined", () => {
    const original = globalThis.WebSocket;
    (globalThis as { WebSocket: unknown }).WebSocket = TestSocket;
    try {
      const statuses: ConnectionStatus[] = [];
      const connection = new GatewayConnection({
        url: 'ws://pc:9090',
        createSocket: undefined,
        now: undefined,
        onStatus: (s) => statuses.push(s),
        onFrame: () => {},
      });
      connection.start();
      expect(TestSocket.made).toHaveLength(1);
      TestSocket.latest().deliver(helloFrame());
      expect(statuses[statuses.length - 1].kind).toBe('connected');
      connection.stop();
    } finally {
      (globalThis as { WebSocket: unknown }).WebSocket = original;
    }
  });

  describe('requests', () => {
    function connected() {
      const parts = setup();
      parts.connection.start();
      TestSocket.latest().deliver(helloFrame());
      return parts;
    }

    it('sends the command with a fresh number and resolves with its own reply', async () => {
      const { connection } = connected();
      const first = connection.request(CommandType.COMMAND_CHANGE_MODE, (id) => encodeChangeMode(id, 'docking'), 1000);
      const second = connection.request(CommandType.COMMAND_PING, encodePing, 1000);
      const sent = sentCommands(TestSocket.latest());
      expect(sent).toEqual([
        { channel: 0, type: CommandType.COMMAND_CHANGE_MODE, requestId: 1, mode: 'docking' },
        { channel: 0, type: CommandType.COMMAND_PING, requestId: 2, mode: undefined },
      ]);
      // answered in the other order: each reply finds its own request
      TestSocket.latest().deliver(replyFrame(2, ReplyResult.RESULT_OK));
      TestSocket.latest().deliver(replyFrame(1, ReplyResult.RESULT_REFUSED, 'no saved map yet'));
      await expect(second).resolves.toMatchObject({ requestId: 2, result: 'ok', message: '', goalId: new Uint8Array(0) });
      await expect(first).resolves.toMatchObject({ requestId: 1, result: 'refused', message: 'no saved map yet', goalId: new Uint8Array(0) });
      connection.stop();
    });

    it('does not hand replies to the stream handler, and ignores replies nobody waits for', () => {
      const { connection, frames } = connected();
      TestSocket.latest().deliver(replyFrame(99, ReplyResult.RESULT_OK));
      expect(frames).toEqual([]);
      connection.stop();
    });

    it('is refused at once when not connected', async () => {
      const { connection } = setup();
      connection.start(); // no Hello yet
      await expect(connection.request(CommandType.COMMAND_PING, encodePing, 1000)).rejects.toMatchObject({ reason: 'no_connection' });
      connection.stop();
    });

    it('fails when the connection is lost first, saying the robot may still act', async () => {
      const { connection } = connected();
      const pending = connection.request(CommandType.COMMAND_CHANGE_MODE, (id) => encodeChangeMode(id, 'idle'), 60000);
      TestSocket.latest().fail('gone');
      const error = await pending.catch((e) => e);
      expect(error).toBeInstanceOf(RequestError);
      expect(error.reason).toBe('lost');
      expect(error.message).toMatch(/may still act/);
      connection.stop();
    });

    it('gives up after its time limit, and a late reply is then ignored', async () => {
      const { connection } = connected();
      const pending = connection.request(CommandType.COMMAND_PING, encodePing, 3000);
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(1000);
        TestSocket.latest().deliver(heartbeatFrame(i)); // the connection itself stays up
      }
      await expect(pending).rejects.toMatchObject({ reason: 'timed_out' });
      TestSocket.latest().deliver(replyFrame(1, ReplyResult.RESULT_OK));
      connection.stop();
    });

    it('fails waiting requests on stop', async () => {
      const { connection } = connected();
      const pending = connection.request(CommandType.COMMAND_PING, encodePing, 3000);
      connection.stop();
      await expect(pending).rejects.toMatchObject({ reason: 'lost' });
    });
  });

  it('skips text messages and broken frames without dropping the connection', () => {
    const { connection, last, frames } = setup();
    connection.start();
    const socket = TestSocket.latest();
    socket.deliver(helloFrame());
    socket.onmessage?.({ data: 'text' });
    socket.onmessage?.({ data: new Uint8Array([1, 2, 3]).buffer });
    socket.deliver(robotStateFrame('idle'));
    expect(last().kind).toBe('connected');
    expect(frames).toEqual([DataType.DATA_ROBOT_STATE]);
    connection.stop();
  });
});
