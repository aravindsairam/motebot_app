import { CommandType } from '../transport/messages';
import {
  assistantStatusFrame,
  helloFrame,
  replyFrame,
  ReplyResult,
  replyWith,
  robotStateFrame,
  roomsFrame,
  sentCommands,
  TestSocket,
  type TestRoom,
} from '../transport/testSocket';
import { useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import { useRoomEdit } from './roomEditStore';
import {
  closeRoomEditor,
  deleteRoom,
  findRoomsOnMap,
  nameRoomsByLooking,
  openRoomEditor,
  renameRoom,
  roomAreaText,
  roomAt,
  roomEditLine,
  roomNameProblem,
  roomsEdited,
  roomsProblem,
  sameRooms,
  saveRooms,
  startRenaming,
  tapRooms,
  withNames,
  labelPoint,
} from './rooms';
import { useRobot } from './store';

const KITCHEN: TestRoom = { name: 'Kitchen', pointsCm: [650, 0, 1060, 0, 1060, 320, 650, 320], xCm: 855, yCm: 160, area: 12.75 };
const HALL: TestRoom = { name: 'Hall', pointsCm: [0, 0, 300, 0, 300, 200, 0, 200], xCm: 150, yCm: 100, area: 6 };
const inMetres = (r: TestRoom) => ({ name: r.name, points: r.pointsCm.map((v) => v / 100), x: r.xCm / 100, y: r.yCm / 100, area: r.area });

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
  closeRoomEditor();
  useActions.setState({ busy: null, notice: null });
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

// `now`: the connection's clock. Held still, a long wait does not count as a silent robot.
function connected(rooms: TestRoom[] | null = [KITCHEN, HALL], mapName = 'house', now?: () => number) {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create, now });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame('idle', { currentMap: 'house' }));
  if (rooms) socket.deliver(roomsFrame(rooms, mapName));
  return socket;
}

async function lastSent(socket: TestSocket) {
  await flush();
  return sentCommands(socket).pop()!;
}

describe('room names', () => {
  it('1 to 40 characters, and no two the same whatever the capitals', () => {
    const rooms = [{ name: 'Kitchen' }, { name: 'Hall' }];
    expect(roomNameProblem('Living room', rooms, 0)).toBeNull();
    expect(roomNameProblem('  Kitchen  ', rooms, 0)).toBeNull(); // its own name
    expect(roomNameProblem('', rooms, 0)).toBe('Give the room a name');
    expect(roomNameProblem('   ', rooms, 0)).toBe('Give the room a name');
    expect(roomNameProblem('x'.repeat(40), rooms, 0)).toBeNull();
    expect(roomNameProblem('x'.repeat(41), rooms, 0)).toBe('At most 40 characters');
    expect(roomNameProblem('hall', rooms, 0)).toBe('Another room has this name');
    expect(roomNameProblem('Café é', rooms, 0)).toBeNull(); // any letters
  });

  it('the whole list is checked before Save', () => {
    expect(roomsProblem([{ name: 'Kitchen' }, { name: 'Hall' }])).toBeNull();
    expect(roomsProblem([{ name: 'Kitchen' }, { name: ' ' }])).toBe('Every room needs a name');
    expect(roomsProblem([{ name: 'Kitchen' }, { name: 'kitchen' }])).toBe("Two rooms are called 'Kitchen'");
    expect(roomsProblem([{ name: 'y'.repeat(41) }])).toMatch(/longer than 40 characters/);
  });
});

describe('rooms in words and on the map', () => {
  it('the area with one decimal', () => {
    expect(roomAreaText(12.75)).toBe('12.8 m²');
    expect(roomAreaText(6)).toBe('6.0 m²');
    expect(roomAreaText(-1)).toBe('0.0 m²');
  });

  it('the room under a point', () => {
    const rooms = [inMetres(KITCHEN), inMetres(HALL)];
    expect(roomAt(rooms, 8, 1)).toBe(0);
    expect(roomAt(rooms, 1, 1)).toBe(1);
    expect(roomAt(rooms, 5, 5)).toBeNull();
  });

  it('the same as the robot, to the centimetre', () => {
    const a = [inMetres(KITCHEN)];
    expect(sameRooms(a, [{ ...inMetres(KITCHEN), x: 8.551 }])).toBe(true);
    expect(sameRooms(a, [{ ...inMetres(KITCHEN), x: 8.56 }])).toBe(false);
    expect(sameRooms(a, [{ ...inMetres(KITCHEN), name: 'Cook room' }])).toBe(false);
    expect(sameRooms(a, [])).toBe(false);
  });

  it('names found by looking go on the room at the same spot', () => {
    const draft = [inMetres(KITCHEN), inMetres(HALL)];
    const named = [
      { ...inMetres(HALL), name: 'Entrance' },
      { ...inMetres(KITCHEN), name: 'Kitchen with table' },
    ];
    expect(withNames(draft, named).map((r) => r.name)).toEqual(['Kitchen with table', 'Entrance']);
    expect(withNames(draft, named)[0].points).toEqual(draft[0].points);
    // a different number of rooms: the robot's list as it is
    expect(withNames(draft, [named[0]]).map((r) => r.name)).toEqual(['Entrance']);
  });

  it('the line in the editor says what is going on', () => {
    const draft = [inMetres(KITCHEN), inMetres(HALL)];
    expect(roomEditLine({ work: null, draft }, null)).toBe('2 rooms. Tap a name to rename it.');
    expect(roomEditLine({ work: null, draft: [] }, null)).toMatch(/^No rooms yet/);
    expect(roomEditLine({ work: 'finding', draft }, null)).toBe('Finding the rooms on the map…');
    expect(roomEditLine({ work: 'naming', draft }, { busy: true, conversation: '', doing: 'going to the kitchen' })).toBe(
      'Naming the rooms: going to the kitchen…',
    );
    expect(roomEditLine({ work: 'naming', draft }, { busy: false, conversation: '', doing: '' })).toMatch(/^Naming the rooms: the robot goes/);
    expect(roomEditLine({ work: 'saving', draft }, null)).toBe('Saving the rooms on the robot…');
  });
});

describe('the rooms stream', () => {
  it('is kept in the store like the zones, and forgotten on disconnect', () => {
    connected();
    expect(useRobot.getState().rooms?.value).toEqual({ mapName: 'house', rooms: [inMetres(KITCHEN), inMetres(HALL)] });
    disconnect();
    expect(useRobot.getState().rooms).toBeNull();
  });
});

describe('editing', () => {
  it('starts from a copy of the robot rooms of the map in use', () => {
    connected();
    expect(openRoomEditor()).toBeNull();
    expect(useRoomEdit.getState()).toMatchObject({ open: true, mapName: 'house', work: null, renaming: null });
    expect(useRoomEdit.getState().draft).toEqual([inMetres(KITCHEN), inMetres(HALL)]);
    expect(roomsEdited()).toBe(false);
  });

  it("refuses to start with another map's rooms (Save would drop rooms the phone never saw)", () => {
    connected([KITCHEN], 'office');
    expect(openRoomEditor()).toMatch(/hasn't sent/);
    expect(useRoomEdit.getState().open).toBe(false);
  });

  it('starts empty when the robot has no rooms yet', () => {
    connected([], '');
    expect(openRoomEditor()).toBeNull();
    expect(useRoomEdit.getState().draft).toEqual([]);
  });

  it('rename with a tap on the map or the list, delete, and Save is then due', () => {
    connected();
    openRoomEditor();
    tapRooms(8, 1);
    expect(useRoomEdit.getState().renaming).toBe(0);
    expect(renameRoom(0, 'hall')).toBe('Another room has this name');
    expect(useRoomEdit.getState().draft[0].name).toBe('Kitchen');
    expect(renameRoom(0, '  Cook room ')).toBeNull();
    expect(useRoomEdit.getState()).toMatchObject({ renaming: null });
    expect(useRoomEdit.getState().draft[0].name).toBe('Cook room');
    expect(roomsEdited()).toBe(true);
    startRenaming(1);
    expect(useRoomEdit.getState().renaming).toBe(1);
    deleteRoom(1);
    expect(useRoomEdit.getState().draft.map((r) => r.name)).toEqual(['Cook room']);
    expect(useRoomEdit.getState().renaming).toBeNull();
    tapRooms(-5, -5); // no room there
    expect(useRoomEdit.getState().renaming).toBeNull();
  });

  it('Cancel drops the copy', () => {
    connected();
    openRoomEditor();
    deleteRoom(0);
    closeRoomEditor();
    expect(useRoomEdit.getState()).toMatchObject({ open: false, draft: [] });
    expect(useRobot.getState().rooms?.value.rooms).toHaveLength(2);
  });
});

describe('Find rooms', () => {
  it("replaces the copy with the robot's proposal; nothing is saved", async () => {
    const socket = connected([]);
    openRoomEditor();
    const finding = findRoomsOnMap();
    const sent = await lastSent(socket);
    expect(sent.type).toBe(CommandType.COMMAND_FIND_ROOMS);
    expect(useRoomEdit.getState().work).toBe('finding');
    socket.deliver(replyWith(sent.requestId, ReplyResult.RESULT_OK, 'found 2 rooms', { rooms: { mapName: 'house', rooms: [KITCHEN, HALL] } }));
    await finding;
    expect(useRoomEdit.getState()).toMatchObject({ open: true, work: null });
    expect(useRoomEdit.getState().draft.map((r) => r.name)).toEqual(['Kitchen', 'Hall']);
    expect(sentCommands(socket).some((c) => c.type === CommandType.COMMAND_SET_ROOMS)).toBe(false);
  });

  it('a refusal shows on the message card and the copy stays', async () => {
    const socket = connected();
    openRoomEditor();
    const finding = findRoomsOnMap();
    const sent = await lastSent(socket);
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_REFUSED, 'the map has no doorways'));
    await finding;
    expect(useActions.getState().notice).toMatchObject({ tone: 'error', title: "Couldn't find the rooms", text: 'The map has no doorways.' });
    expect(useRoomEdit.getState()).toMatchObject({ open: true, work: null });
    expect(useRoomEdit.getState().draft).toHaveLength(2);
  });

  it('one request at a time', async () => {
    const socket = connected();
    openRoomEditor();
    void findRoomsOnMap();
    void findRoomsOnMap();
    void saveRooms();
    await flush();
    expect(sentCommands(socket).filter((c) => c.type !== CommandType.COMMAND_PING)).toHaveLength(1);
  });
});

describe('Name by looking', () => {
  it('sends the rooms, shows what the robot is doing, and puts the names on the copy', async () => {
    const socket = connected();
    openRoomEditor();
    const naming = nameRoomsByLooking();
    const sent = await lastSent(socket);
    expect(sent).toMatchObject({ type: CommandType.COMMAND_NAME_ROOMS, rooms: { rooms: [KITCHEN, HALL] } });
    expect(useRoomEdit.getState().work).toBe('naming');
    startRenaming(0); // the other buttons wait meanwhile
    deleteRoom(0);
    expect(useRoomEdit.getState()).toMatchObject({ renaming: null });
    expect(useRoomEdit.getState().draft).toHaveLength(2);
    socket.deliver(assistantStatusFrame(true, '', 'going to the kitchen'));
    expect(roomEditLine(useRoomEdit.getState(), useRobot.getState().assistant?.value ?? null)).toBe('Naming the rooms: going to the kitchen…');
    socket.deliver(
      replyWith(sent.requestId, ReplyResult.RESULT_OK, '', {
        rooms: { rooms: [{ ...KITCHEN, name: 'Kitchen with table' }, { ...HALL, name: 'Entrance' }] },
      }),
    );
    await naming;
    expect(useRoomEdit.getState().draft.map((r) => r.name)).toEqual(['Kitchen with table', 'Entrance']);
    expect(useActions.getState().notice).toMatchObject({ tone: 'success', title: 'Rooms named' });
    expect(sentCommands(socket).some((c) => c.type === CommandType.COMMAND_SET_ROOMS)).toBe(false); // not saved yet
  });

  it('waits up to 15 minutes for the answer', async () => {
    connected(undefined, undefined, () => 1000);
    openRoomEditor();
    const naming = nameRoomsByLooking();
    await flush();
    jest.advanceTimersByTime(14 * 60_000);
    await flush();
    expect(useRoomEdit.getState().work).toBe('naming');
    jest.advanceTimersByTime(60_000 + 1);
    await naming;
    expect(useRoomEdit.getState().work).toBeNull();
    expect(useActions.getState().notice).toMatchObject({ title: "Couldn't name the rooms", text: expect.stringMatching(/^No answer within 900 s/) });
  });

  it('an answer after the editor closed is dropped', async () => {
    const socket = connected();
    openRoomEditor();
    const naming = nameRoomsByLooking();
    const sent = await lastSent(socket);
    closeRoomEditor();
    socket.deliver(replyWith(sent.requestId, ReplyResult.RESULT_OK, '', { rooms: { rooms: [{ ...KITCHEN, name: 'X' }] } }));
    await naming;
    expect(useRoomEdit.getState().open).toBe(false);
    expect(useActions.getState().notice).toBeNull();
  });

  it('needs rooms to name', async () => {
    const socket = connected([]);
    openRoomEditor();
    await nameRoomsByLooking();
    expect(sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_NAME_ROOMS)).toEqual([]);
  });
});

describe('Save', () => {
  it('sends the whole list for the map in use, in centimetres; OK closes the editor', async () => {
    const socket = connected();
    openRoomEditor();
    renameRoom(1, 'Entrance');
    const saving = saveRooms();
    const sent = await lastSent(socket);
    expect(sent).toMatchObject({ type: CommandType.COMMAND_SET_ROOMS, rooms: { mapName: 'house', rooms: [KITCHEN, { ...HALL, name: 'Entrance' }] } });
    expect(useRoomEdit.getState().work).toBe('saving');
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_OK, 'saved'));
    await saving;
    expect(useRoomEdit.getState().open).toBe(false);
    expect(useActions.getState().notice).toMatchObject({ tone: 'success', title: 'Rooms saved', text: 'The robot knows 2 rooms on this map.' });
  });

  it('a refusal shows the robot reason and editing goes on', async () => {
    const socket = connected();
    openRoomEditor();
    deleteRoom(0);
    const saving = saveRooms();
    const sent = await lastSent(socket);
    socket.deliver(replyFrame(sent.requestId, ReplyResult.RESULT_REFUSED, "'house' is not the map in use"));
    await saving;
    expect(useRoomEdit.getState()).toMatchObject({ open: true, work: null });
    expect(useActions.getState().notice).toMatchObject({ tone: 'error', title: "Couldn't save the rooms", text: "'house' is not the map in use." });
  });

  it('two rooms of the same name are not sent', async () => {
    const socket = connected([KITCHEN, { ...HALL, name: 'kitchen' }]);
    openRoomEditor();
    await saveRooms();
    expect(sentCommands(socket).filter((c) => c.type === CommandType.COMMAND_SET_ROOMS)).toEqual([]);
    expect(useActions.getState().notice).toMatchObject({ title: "Can't save the rooms", text: "Two rooms are called 'Kitchen'." });
  });

  it('the editor closes on disconnect', () => {
    connected();
    openRoomEditor();
    disconnect();
    expect(useRoomEdit.getState().open).toBe(false);
  });
});


test('a room name goes in the middle of its outline, or at the robot point when the middle is outside', () => {
  const square = { points: [0, 0, 4, 0, 4, 2, 0, 2], x: 0.5, y: 0.5 };
  expect(labelPoint(square)).toEqual({ x: 2, y: 1 });
  // An L whose middle falls in the cut-out corner.
  const ell = { points: [0, 0, 4, 0, 4, 0.5, 0.5, 0.5, 0.5, 4, 0, 4], x: 0.25, y: 1.5 };
  expect(labelPoint(ell)).toEqual({ x: 0.25, y: 1.5 });
  expect(labelPoint({ points: [0, 0, 1, 1], x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
});
