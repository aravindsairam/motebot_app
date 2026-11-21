import { helloFrame, replyFrame, ReplyResult, robotStateFrame, sentCommands, TestSocket, zonesFrame } from '../transport/testSocket';
import { useActions } from './actionsStore';
import { connectTo, disconnect } from './client';
import {
  closeZoneEditor,
  deleteSelectedZone,
  nextZoneName,
  openZoneEditor,
  sameZones,
  saveZones,
  setZoneBox,
  startAddingZone,
  tapZones,
  useZoneEdit,
  whyNoZoneEdit,
  zoneAt,
  zoneBox,
  zonesEdited,
  zonesProblem,
} from './zones';

const STAIRS = { name: 'stairwell', pointsCm: [455, 200, 565, 200, 565, 330, 455, 330] };
const TRIANGLE = { name: 'rug', pointsCm: [-100, -50, 0, 0, -50, 100] };

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  TestSocket.made = [];
  closeZoneEditor();
  useActions.setState({ busy: null, notice: null });
});
afterEach(() => {
  disconnect();
  jest.useRealTimers();
});

function connected(zones = [STAIRS], mapName = 'house') {
  connectTo({ url: 'ws://pc:9090', label: 'pc' }, { createSocket: TestSocket.create });
  const socket = TestSocket.latest();
  socket.deliver(helloFrame());
  socket.deliver(robotStateFrame('idle', { currentMap: 'house' }));
  socket.deliver(zonesFrame(zones, mapName));
  return socket;
}

describe('zone shapes', () => {
  it('a rectangle along the axes, in any corner order', () => {
    expect(zoneBox([4.55, 2, 5.65, 2, 5.65, 3.3, 4.55, 3.3])).toEqual({ x0: 4.55, y0: 2, x1: 5.65, y1: 3.3 });
    expect(zoneBox([1, 1, 1, 0, 0, 0, 0, 1])).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it('anything else is not a rectangle', () => {
    expect(zoneBox([-1, -0.5, 0, 0, -0.5, 1])).toBeNull(); // three corners
    expect(zoneBox([0, 0, 2, 0, 1.5, 1, 0, 1])).toBeNull(); // slanted side
    expect(zoneBox([0, 0, 1, 0, 1, 0, 0, 1])).toBeNull(); // one corner twice
  });

  it('names, the zone under a point, sameness to the centimetre', () => {
    expect(nextZoneName([])).toBe('Zone 1');
    expect(nextZoneName([{ name: 'Zone 1', points: [] }, { name: 'Zone 3', points: [] }])).toBe('Zone 2');
    const zones = [
      { name: 'a', points: [0, 0, 2, 0, 2, 2, 0, 2] },
      { name: 'b', points: [1, 1, 3, 1, 3, 3, 1, 3] },
    ];
    expect(zoneAt(zones, 1.5, 1.5)).toBe(1); // the one on top
    expect(zoneAt(zones, 0.5, 0.5)).toBe(0);
    expect(zoneAt(zones, 5, 5)).toBeNull();
    expect(sameZones([{ name: 'a', points: [0.001, 0] }], [{ name: 'a', points: [0, 0.004] }])).toBe(true);
    expect(sameZones([{ name: 'a', points: [0.01, 0] }], [{ name: 'a', points: [0, 0] }])).toBe(false);
  });

  it('too small is caught before sending', () => {
    expect(zonesProblem([{ name: 'Zone 1', points: [0, 0, 0.05, 0, 0.05, 1, 0, 1] }])).toMatch(/Zone 1 is too small/);
    expect(zonesProblem([{ name: 'Zone 1', points: [0, 0, 0.1, 0, 0.1, 1, 0, 1] }])).toBeNull();
  });

  it('when they can be changed', () => {
    expect(whyNoZoneEdit('idle', 'house', true)).toBeNull();
    expect(whyNoZoneEdit('navigation', 'house', true)).toBeNull();
    expect(whyNoZoneEdit('mapping', '', true)).toMatch(/new map/);
    expect(whyNoZoneEdit('cleaning', 'house', true)).toMatch(/Stop the clean/);
    expect(whyNoZoneEdit('idle', '', true)).toMatch(/no saved map/);
    expect(whyNoZoneEdit('idle', 'house', false)).toMatch(/not connected/);
  });
});

describe('editing', () => {
  it('starts from the robot zones of the map in use, only once they have come', () => {
    connected([STAIRS, TRIANGLE]);
    expect(openZoneEditor()).toBeNull();
    const s = useZoneEdit.getState();
    expect(s).toMatchObject({ open: true, mapName: 'house', selected: null, adding: false });
    expect(s.draft.map((z) => z.name)).toEqual(['stairwell', 'rug']);
    expect(s.draft[0].points).toEqual([4.55, 2, 5.65, 2, 5.65, 3.3, 4.55, 3.3]);
    expect(zonesEdited()).toBe(false);
  });

  it('refuses to start without that map zones (Save would drop zones the phone never saw)', () => {
    connected([STAIRS], 'office');
    expect(openZoneEditor()).toMatch(/hasn't sent/);
    expect(useZoneEdit.getState().open).toBe(false);
  });

  it('add with a tap, select, move, delete', () => {
    connected();
    openZoneEditor();
    startAddingZone();
    tapZones(1, 1);
    let s = useZoneEdit.getState();
    expect(s.draft).toHaveLength(2);
    expect(s.draft[1]).toEqual({ name: 'Zone 1', points: [0.5, 0.5, 1.5, 0.5, 1.5, 1.5, 0.5, 1.5] });
    expect(s).toMatchObject({ selected: 1, adding: false });
    setZoneBox({ x0: 2, y0: 0, x1: 3, y1: 0.5 });
    expect(useZoneEdit.getState().draft[1].points).toEqual([2, 0, 3, 0, 3, 0.5, 2, 0.5]);
    tapZones(5, 2.5); // on the stairwell
    expect(useZoneEdit.getState().selected).toBe(0);
    deleteSelectedZone();
    s = useZoneEdit.getState();
    expect(s.draft.map((z) => z.name)).toEqual(['Zone 1']);
    expect(s.selected).toBeNull();
    expect(zonesEdited()).toBe(true);
    tapZones(-3, -3); // empty floor: nothing selected
    expect(useZoneEdit.getState().selected).toBeNull();
  });

  it('add with a drag; a slip of the finger adds nothing', () => {
    connected();
    openZoneEditor();
    startAddingZone();
    setZoneBox({ x0: 0, y0: 0, x1: 0.04, y1: 0.03 });
    expect(useZoneEdit.getState()).toMatchObject({ adding: true });
    expect(useZoneEdit.getState().draft).toHaveLength(1);
    setZoneBox({ x0: 0, y0: 0, x1: 1.2, y1: 0.8 });
    expect(useZoneEdit.getState().draft[1].points).toEqual([0, 0, 1.2, 0, 1.2, 0.8, 0, 0.8]);
  });

  it('a zone of another shape can be deleted, not reshaped', () => {
    connected([TRIANGLE]);
    openZoneEditor();
    tapZones(-0.5, 0.1);
    expect(useZoneEdit.getState().selected).toBe(0);
    setZoneBox({ x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(useZoneEdit.getState().draft[0].points).toEqual([-1, -0.5, 0, 0, -0.5, 1]);
  });
});

describe('saving', () => {
  it('sends the whole list in centimetres; OK closes the editor', async () => {
    const socket = connected();
    openZoneEditor();
    startAddingZone();
    tapZones(1, 1);
    const saving = saveZones();
    await flush();
    const sent = sentCommands(socket);
    const last = sent[sent.length - 1];
    expect(last.zones).toEqual({
      mapName: 'house',
      zones: [STAIRS, { name: 'Zone 1', pointsCm: [50, 50, 150, 50, 150, 150, 50, 150] }],
    });
    expect(useZoneEdit.getState().saving).toBe(true);
    socket.deliver(replyFrame(last.requestId, ReplyResult.RESULT_OK, 'saved'));
    await saving;
    expect(useZoneEdit.getState().open).toBe(false);
    expect(useActions.getState().notice).toMatchObject({ tone: 'success', title: 'No-go zones saved', text: 'The robot keeps out of 2 zones.' });
  });

  it('deleting them all sends an empty list', async () => {
    const socket = connected();
    openZoneEditor();
    tapZones(5, 2.5);
    deleteSelectedZone();
    const saving = saveZones();
    await flush();
    const last = sentCommands(socket).pop()!;
    expect(last.zones).toEqual({ mapName: 'house', zones: [] });
    socket.deliver(replyFrame(last.requestId, ReplyResult.RESULT_OK, ''));
    await saving;
    expect(useActions.getState().notice?.text).toBe('The map has no no-go zones now.');
  });

  it('a refusal shows the robot reason and editing goes on', async () => {
    const socket = connected();
    openZoneEditor();
    startAddingZone();
    tapZones(0, 0);
    const saving = saveZones();
    await flush();
    const last = sentCommands(socket).pop()!;
    socket.deliver(replyFrame(last.requestId, ReplyResult.RESULT_REFUSED, 'Zone 1 is too close to the dock: the robot could not get home'));
    await saving;
    expect(useZoneEdit.getState()).toMatchObject({ open: true, saving: false, problem: 'Zone 1 is too close to the dock: the robot could not get home' });
    expect(useZoneEdit.getState().draft).toHaveLength(2);
  });

  it('a zone too small is not sent', async () => {
    const socket = connected();
    openZoneEditor();
    startAddingZone();
    tapZones(0, 0);
    setZoneBox({ x0: 0, y0: 0, x1: 0.05, y1: 1 });
    const before = sentCommands(socket).length;
    await saveZones();
    expect(sentCommands(socket)).toHaveLength(before);
    expect(useZoneEdit.getState().problem).toMatch(/too small/);
  });
});
