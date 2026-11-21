import { vacuum } from '../proto/vacuum';
import { CommandType } from '../transport/messages';
import { CleaningState, helloFrame, replyFrame, ReplyResult, replyWith, sentCommands, TestSocket } from '../transport/testSocket';
import { connectTo, disconnect } from './client';
import { closeRecord, loadHistory, openRecord } from './history';
import { useHistory } from './historyStore';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

function connected() {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  return socket;
}

async function answer(socket: TestSocket, frame: (requestId: number) => Uint8Array) {
  await flush();
  const sent = sentCommands(socket);
  const last = sent[sent.length - 1];
  socket.deliver(frame(last.requestId));
  await flush();
  return last;
}

const record = (id: string, picturePng?: Uint8Array): vacuum.v1.CleaningRecord.$Properties => ({
  id,
  started: 100,
  ended: 900,
  status: { state: CleaningState.STATE_FINISHED, jobId: 7, cleanedArea: 21, coverage: 96, cleaningTime: 800 },
  picturePng,
});
const totals = { cleans: 23, area: 412.5, time: 18600, distance: 1520.25 };

describe('the history', () => {
  it('asks for every record kept, with the totals', async () => {
    const socket = connected();
    const done = loadHistory();
    expect(useHistory.getState().list.state).toBe('loading');
    const sent = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { history: { records: [record('a'), record('b')], totals } }));
    await done;
    expect(sent).toMatchObject({ type: CommandType.COMMAND_LIST_CLEANING_HISTORY, maxRecords: 0 });
    const { list } = useHistory.getState();
    expect(list.state).toBe('ready');
    expect(list.history?.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(list.history?.totals).toEqual(totals);
  });

  it("keeps what it had, and says why, when the robot can't answer", async () => {
    const socket = connected();
    const first = loadHistory();
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { history: { records: [record('a')], totals } }));
    await first;
    const second = loadHistory();
    await answer(socket, (id) => replyFrame(id, ReplyResult.RESULT_NOT_AVAILABLE, 'the cleaning node is not running'));
    await second;
    expect(useHistory.getState().list).toMatchObject({ state: 'failed', problem: 'the cleaning node is not running' });
    expect(useHistory.getState().list.history?.records).toHaveLength(1);
  });

  it('opens one clean: its numbers at once, then its picture', async () => {
    const socket = connected();
    const loaded = loadHistory();
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { history: { records: [record('a')], totals } }));
    await loaded;
    const opening = openRecord('a');
    expect(useHistory.getState().open).toMatchObject({ id: 'a', state: 'loading', record: { id: 'a', status: { cleanedArea: 21 } } });
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const sent = await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { record: record('a', png) }));
    await opening;
    expect(sent).toMatchObject({ type: CommandType.COMMAND_GET_CLEANING_RECORD, recordId: 'a' });
    expect(useHistory.getState().open).toMatchObject({ id: 'a', state: 'ready', record: { picture: png } });
  });

  it('ignores a picture that arrives after the clean was closed', async () => {
    const socket = connected();
    const opening = openRecord('a');
    closeRecord();
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { record: record('a') }));
    await opening;
    expect(useHistory.getState().open).toBeNull();
  });

  it('is forgotten on disconnect', async () => {
    const socket = connected();
    const done = loadHistory();
    await answer(socket, (id) => replyWith(id, ReplyResult.RESULT_OK, '', { history: { records: [record('a')], totals } }));
    await done;
    disconnect();
    expect(useHistory.getState()).toEqual({ list: { state: 'none', history: null, problem: null }, open: null });
  });
});
