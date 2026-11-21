import { CommandType } from '../transport/messages';
import { helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, TestSocket } from '../transport/testSocket';
import { useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { discardMap, mapNameProblem, saveMap, startMapping } from './mapping';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

function connected(state: string) {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame(state, { currentMap: 'house', allowedTransitions: ['idle', 'mapping', 'manual'] }));
  return socket;
}

async function answer(socket: TestSocket, index: number, result: number, message = '') {
  await flush();
  const sent = sentCommands(socket);
  socket.deliver(replyFrame(sent[index].requestId, result, message));
  await flush();
  return sent[index];
}

describe('map names', () => {
  it('takes what the robot takes', () => {
    expect(mapNameProblem('house')).toBeNull();
    expect(mapNameProblem(' up-stairs_2 ')).toBeNull();
    expect(mapNameProblem('')).toBe('Give the map a name');
    expect(mapNameProblem('my house')).toBe("Only letters, digits, '-' and '_'");
    expect(mapNameProblem('café')).toBe("Only letters, digits, '-' and '_'");
    expect(mapNameProblem('house_keepout')).toBe("A name cannot end in '_keepout'");
    expect(mapNameProblem('house_zones')).toBe("A name cannot end in '_zones'");
    expect(mapNameProblem('x'.repeat(41))).toBe('At most 40 characters');
  });
});

describe('making a map', () => {
  it('starts mapping, and shows the reason when the robot refuses', async () => {
    const socket = connected('failsafe');
    const done = startMapping();
    const sent = await answer(socket, 0, ReplyResult.RESULT_REFUSED, 'cannot go from failsafe to mapping');
    expect(sent).toMatchObject({ type: CommandType.COMMAND_CHANGE_MODE, mode: 'mapping' });
    expect(await done).toBe(false);
    expect(useActions.getState().notice).toMatchObject({ title: "Couldn't start mapping" });
  });

  it('saves, then leaves mapping, and says so', async () => {
    const socket = connected('mapping');
    const done = saveMap(' attic ', false);
    const save = await answer(socket, 0, ReplyResult.RESULT_OK, "saved 120x80 cells as 'attic'");
    expect(save).toMatchObject({ type: CommandType.COMMAND_SAVE_MAP, saveMap: { name: 'attic', replace: false } });
    const idle = await answer(socket, 1, ReplyResult.RESULT_OK, 'now in idle');
    expect(idle.mode).toBe('idle');
    expect(await done).toBe('saved');
    expect(useActions.getState()).toMatchObject({ busy: null, notice: { tone: 'success', title: "Map saved as 'attic'" } });
  });

  it('asks before replacing: a taken name is reported, not overwritten', async () => {
    const socket = connected('mapping');
    const first = saveMap('house', false);
    await answer(socket, 0, ReplyResult.RESULT_ALREADY_EXISTS, "a map named 'house' already exists");
    expect(await first).toBe('name_taken');
    expect(sentCommands(socket)).toHaveLength(1); // still mapping: nothing else sent
    expect(useActions.getState().notice).toBeNull();
    const second = saveMap('house', true);
    const save = await answer(socket, 1, ReplyResult.RESULT_OK, 'saved');
    expect(save.saveMap).toEqual({ name: 'house', replace: true });
    await answer(socket, 2, ReplyResult.RESULT_OK, 'now in idle');
    expect(await second).toBe('saved');
  });

  it('stays mapping when saving fails', async () => {
    const socket = connected('mapping');
    const done = saveMap('house', true);
    await answer(socket, 0, ReplyResult.RESULT_REFUSED, 'no map received from slam_toolbox yet');
    expect(await done).toBe('failed');
    expect(sentCommands(socket)).toHaveLength(1);
    expect(useActions.getState().notice).toMatchObject({ title: "Couldn't save the map", text: 'No map received from slam_toolbox yet.' });
  });

  it('discards by leaving mapping', async () => {
    const socket = connected('mapping');
    const done = discardMap();
    const sent = await answer(socket, 0, ReplyResult.RESULT_OK, 'now in idle');
    await done;
    expect(sent.mode).toBe('idle');
  });
});
