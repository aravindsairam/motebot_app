import type { ExplorationStatus } from '../transport/messages';
import { useActions } from './actionsStore';
import { onExplorationStatus } from './explorationNews';
import { resetExploring, useExploring } from './exploringStore';
import { explorationReport, explorationLine, RUNNING_EXPLORATION } from './exploringText';

function status(state: ExplorationStatus['state'], extra: Partial<ExplorationStatus> = {}): ExplorationStatus {
  return {
    state,
    message: '',
    jobId: 3,
    started: 0,
    placesLeft: 4,
    mappedArea: 18.2,
    exploringTime: 130,
    timeLimit: 1200,
    distance: 12.4,
    goalsSent: 6,
    goalsFailed: 1,
    ...extra,
  };
}

beforeEach(() => {
  resetExploring();
  useActions.setState({ busy: null, notice: null });
});

describe('the status line', () => {
  it('while exploring: places left, area, time', () => {
    expect(explorationLine(status('exploring'))).toBe('4 places left · 18 m² · 2:10');
    expect(explorationLine(status('exploring', { placesLeft: 1, mappedArea: 3.25 }))).toBe('1 place left · 3.3 m² · 2:10');
  });

  it('says what it is doing at other times', () => {
    expect(explorationLine(status('starting'))).toBe('Getting ready to explore…');
    expect(explorationLine(status('returning'))).toBe('Going back to where it started · 18 m²');
    expect(explorationLine(status('exploring', { message: 'looking again: making sure nothing is left' }))).toBe(
      'Looking again: making sure nothing is left · 18 m² · 2:10',
    );
  });

  it('knows which states are a running exploration', () => {
    expect(RUNNING_EXPLORATION).toEqual(['starting', 'exploring', 'returning', 'ending']);
  });
});

describe('the card at the end', () => {
  it('finished: the area and time, save the map, and mark the stairs', () => {
    const n = explorationReport(status('finished', { message: 'explored for 5 min: nothing left to look at; back where it started', exploringTime: 300, mappedArea: 31 }));
    expect(n).toMatchObject({ tone: 'success', title: 'Explored 31 m² in 5 min', keep: true });
    expect(n?.text).toContain('Save the map');
    expect(n?.text).toContain('no-go zones');
  });

  it('finished early says so', () => {
    const n = explorationReport(status('finished', { message: 'explored for 2 min: finished early, the time limit of 2 min was reached' }));
    expect(n?.title).toBe('Explored 18 m² in 2 min');
    expect(n?.text).toContain('Finished early');
  });

  it('stopped keeps the map', () => {
    const n = explorationReport(status('stopped', { message: 'stopped: the robot left exploring mode' }));
    expect(n).toMatchObject({ tone: 'info', title: 'Exploring stopped' });
    expect(n?.text).toContain('The map so far is kept');
  });

  it('failed says why in the robot\'s words', () => {
    const n = explorationReport(status('failed', { message: 'the explorer stopped running (exit code -9)' }));
    expect(n).toMatchObject({ tone: 'error', title: "Exploring didn't finish" });
    expect(n?.text).toContain('The explorer stopped running (exit code -9).');
  });

  it('nothing for a running exploration', () => {
    expect(explorationReport(status('exploring'))).toBeNull();
  });
});

describe('news', () => {
  it('shows the card once, for an exploration this phone saw running', () => {
    onExplorationStatus(status('exploring'));
    onExplorationStatus(status('finished', { message: 'nothing left to look at' }));
    expect(useActions.getState().notice?.title).toBe('Explored 18 m² in 2 min');
    useActions.setState({ notice: null });
    onExplorationStatus(status('finished', { message: 'nothing left to look at' }));
    expect(useActions.getState().notice).toBeNull();
  });

  it('and for one this phone started, even if it never saw it running', () => {
    useExploring.setState({ mine: 3 });
    onExplorationStatus(status('failed', { message: 'the robot did not switch to exploring: busy' }));
    expect(useActions.getState().notice?.tone).toBe('error');
  });

  it('not for an old ending a late phone hears about', () => {
    onExplorationStatus(status('finished'));
    expect(useActions.getState().notice).toBeNull();
  });
});
