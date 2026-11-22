import { type Choice, choiceHint, jobFor, jobKey, mapPrompt, planNameProblem } from './cleanChoice';
import { DEFAULT_OPTIONS } from './cleaningStore';

const choice = (more: Partial<Choice> = {}): Choice => ({
  kind: 'everything',
  area: null,
  spot: null,
  planName: null,
  roomName: null,
  options: DEFAULT_OPTIONS,
  ...more,
});

describe('the job for what the user chose', () => {
  it('sends every option explicitly: once, no edges, back to the dock by default', () => {
    expect(jobFor(choice())).toEqual({
      what: 'everything',
      area: [],
      spotX: 0,
      spotY: 0,
      planName: '',
      direction: '',
      passes: 1,
      edges: 'off',
      returnToDock: 'on',
      room: '',
    });
    expect(jobFor(choice({ options: { edges: true, twice: true, returnToDock: false } }))).toMatchObject({
      passes: 2,
      edges: 'on',
      returnToDock: 'off',
    });
  });

  it('an area: its four corners in metres', () => {
    const job = jobFor(choice({ kind: 'area', area: { x0: 1.2, y0: 0.2, x1: 3.2, y1: 1.4 } }));
    expect(job).toMatchObject({ what: 'area', area: [1.2, 0.2, 3.2, 0.2, 3.2, 1.4, 1.2, 1.4] });
  });

  it('a spot: its middle', () => {
    expect(jobFor(choice({ kind: 'spot', spot: { x: 2.5, y: -1.25 } }))).toMatchObject({ what: 'spot', spotX: 2.5, spotY: -1.25, area: [] });
  });

  it('a room: its name, with the options like the others', () => {
    expect(jobFor(choice({ kind: 'room', roomName: 'Kitchen' }))).toEqual({
      what: 'room',
      area: [],
      spotX: 0,
      spotY: 0,
      planName: '',
      direction: '',
      passes: 1,
      edges: 'off',
      returnToDock: 'on',
      room: 'Kitchen',
    });
    expect(jobFor(choice({ kind: 'room', roomName: 'Kitchen', options: { edges: true, twice: true, returnToDock: false } }))).toMatchObject({
      what: 'room',
      room: 'Kitchen',
      passes: 2,
      edges: 'on',
      returnToDock: 'off',
    });
  });

  it('a saved plan: its name', () => {
    expect(jobFor(choice({ kind: 'plan', planName: 'Under the table' }))).toMatchObject({ what: 'plan', planName: 'Under the table' });
  });

  it('nothing until the choice is complete, and says what is missing', () => {
    expect(jobFor(choice({ kind: 'area' }))).toBeNull();
    expect(choiceHint(choice({ kind: 'area' }))).toBe('Drag across the map to mark the area');
    expect(jobFor(choice({ kind: 'area', area: { x0: 0, y0: 0, x1: 0.1, y1: 2 } }))).toBeNull();
    expect(choiceHint(choice({ kind: 'area', area: { x0: 0, y0: 0, x1: 0.1, y1: 2 } }))).toBe('The area is too small: drag its corners apart');
    expect(jobFor(choice({ kind: 'spot' }))).toBeNull();
    expect(choiceHint(choice({ kind: 'spot' }))).toBe('Tap the middle of the spot to clean');
    expect(jobFor(choice({ kind: 'plan' }))).toBeNull();
    expect(choiceHint(choice({ kind: 'plan' }))).toBe('Pick a saved plan');
    expect(jobFor(choice({ kind: 'room' }))).toBeNull();
    expect(choiceHint(choice({ kind: 'room' }))).toBe('Pick a room');
    expect(choiceHint(choice())).toBeNull();
  });

  it('a change of choice or option is a new request', () => {
    const a = jobFor(choice())!;
    const b = jobFor(choice({ options: { ...DEFAULT_OPTIONS, edges: true } }))!;
    expect(jobKey(a)).toBe(jobKey(jobFor(choice())!));
    expect(jobKey(a)).not.toBe(jobKey(b));
  });
});

describe('what the map says while choosing', () => {
  it('guides the finger', () => {
    expect(mapPrompt(choice({ kind: 'area' }))).toBe('Drag across the map to mark the area');
    expect(mapPrompt(choice({ kind: 'area', area: { x0: 0, y0: 0, x1: 2, y1: 2 } }))).toBe('Drag a corner to resize, the middle to move');
    expect(mapPrompt(choice({ kind: 'spot', spot: { x: 0, y: 0 } }))).toBe('Tap again to move the spot');
    expect(mapPrompt(choice())).toBeNull();
    expect(mapPrompt(choice({ kind: 'plan' }))).toBeNull(); // the list is in the panel, not on the map
    expect(mapPrompt(choice({ kind: 'room' }))).toBeNull();
    expect(mapPrompt(choice({ kind: 'room', roomName: 'Kitchen' }))).toBeNull();
  });
});

describe('plan names', () => {
  it('takes what the robot takes', () => {
    expect(planNameProblem('Living room')).toBeNull();
    expect(planNameProblem(' Under the table_2 ')).toBeNull();
    expect(planNameProblem('')).toBe('Give the plan a name');
    expect(planNameProblem('x'.repeat(41))).toBe('At most 40 characters');
    expect(planNameProblem('Café')).toBe("Only letters, digits, spaces, '-' and '_'");
    expect(planNameProblem('-hall')).toBe('Start with a letter or a digit');
  });
});
