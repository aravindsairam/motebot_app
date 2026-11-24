import {
  areaText,
  clockText,
  cleaningReport,
  dayAndClock,
  distanceText,
  durationText,
  estimateText,
  historyDays,
  historyLine,
  jobOptionsText,
  liveNumbers,
  percentText,
  progressText,
  recordView,
  timeLeftText,
  totalsNumbers,
  totalsText,
  whenText,
} from './cleaningText';
import { cleaningStatus, TEST_JOB } from './testCleaning';

const JOB = TEST_JOB;

describe('the live numbers', () => {
  it('reads as the screen shows them', () => {
    expect(liveNumbers(cleaningStatus())).toEqual({ coverage: '43 %', area: '9.1 m²', distance: '38 m', time: '6:10' });
  });

  it('keeps small numbers precise and large ones short', () => {
    expect(percentText(99.6)).toBe('100 %');
    expect(areaText(0)).toBe('0.0 m²');
    expect(areaText(21.04)).toBe('21 m²');
    expect(distanceText(4.46)).toBe('4.5 m');
    expect(distanceText(1520.25)).toBe('1.5 km');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(3725)).toBe('1:02:05');
    expect(durationText(840)).toBe('14 min');
    expect(durationText(18600)).toBe('5 h 10 min');
    expect(durationText(3600)).toBe('1 h');
    expect(durationText(20)).toBe('under 1 min');
  });

  it('says how long is left, or nothing when the robot has no estimate', () => {
    expect(timeLeftText(360)).toBe('6 min left');
    expect(timeLeftText(30)).toBe('under a minute left');
    expect(timeLeftText(0)).toBe('');
  });
});

describe('where the clean is', () => {
  it('names the row and the time left', () => {
    expect(progressText(cleaningStatus())).toBe('Row 12 of 31 · 6 min left');
  });

  it('names the edge once the rows are done', () => {
    expect(progressText(cleaningStatus({ currentRow: 0, currentEdge: 3, edgesTotal: 12, timeLeft: 0 }))).toBe('Edge 3 of 12');
  });

  it('says paused, getting ready and finishing up', () => {
    expect(progressText(cleaningStatus({ state: 'paused' }))).toBe('Paused at row 12 of 31');
    expect(progressText(cleaningStatus({ state: 'starting' }))).toBe('Getting ready to clean…');
    expect(progressText(cleaningStatus({ state: 'ending' }))).toBe('Finishing up…');
  });
});

describe('the estimate before a clean', () => {
  const e = { rows: 31, edges: 0, turns: 64, transits: 3, distance: 88.5, plannedArea: 21.25, leftOutArea: 0.5, unreachableArea: 1.75, time: 840 };

  it('counts rows, time and floor', () => {
    expect(estimateText(e)).toBe('31 rows · about 14 min · 21 m²');
    expect(estimateText({ ...e, rows: 1, edges: 12 })).toBe('1 row, 12 edges · about 14 min · 21 m²');
  });
});

describe('the report at the end of a clean', () => {
  it('says what was cleaned, and stays until dismissed', () => {
    const done = cleaningStatus({ state: 'finished', cleanedArea: 21.0, coverage: 96.4, cleaningTime: 840 });
    expect(cleaningReport(done)).toEqual({ tone: 'success', title: 'Cleaning finished', text: 'Cleaned 21 m² (96%) in 14 minutes.', keep: true });
  });

  it('says why it stopped, in the robot words', () => {
    const stopped = cleaningStatus({ state: 'stopped', message: 'stopped: the robot left cleaning mode (now idle)', coverage: 43.2 });
    expect(cleaningReport(stopped)).toEqual({
      tone: 'info',
      title: 'Cleaning stopped',
      text: 'Cleaned 9.1 m² (43%) in 6 minutes. The robot left cleaning mode (now idle).',
      keep: true,
    });
  });

  it('says why it failed, and that nothing was cleaned', () => {
    const failed = cleaningStatus({ state: 'failed', message: 'failed: could not switch to cleaning mode: busy', cleanedArea: 0, coverage: 0 });
    expect(cleaningReport(failed)).toEqual({ tone: 'error', title: "Cleaning didn't finish", text: 'Could not switch to cleaning mode: busy.', keep: true });
  });

  it('counts skipped rows', () => {
    const done = cleaningStatus({ state: 'finished', cleanedArea: 20, coverage: 90, cleaningTime: 60, rowsSkipped: 2 });
    expect(cleaningReport(done)?.text).toBe('Cleaned 20 m² (90%) in 1 minute. 2 rows were skipped: something was in the way.');
  });

  it('has nothing to say while cleaning', () => {
    expect(cleaningReport(cleaningStatus())).toBeNull();
    expect(cleaningReport(cleaningStatus({ state: 'ending' }))).toBeNull();
  });
});

describe('the History tab', () => {
  const now = new Date(2026, 10, 18, 12, 0).getTime(); // Wednesday 18 November 2026, noon, phone time
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).getTime() / 1000;

  it('says when, in words', () => {
    expect(whenText(at(2026, 10, 18, 10, 42), now)).toBe('Today 10:42');
    expect(whenText(at(2026, 10, 17, 18, 3), now)).toBe('Yesterday 18:03');
    expect(whenText(at(2026, 10, 16, 9, 15), now)).toBe('Mon 16 Nov 09:15');
    expect(whenText(at(2025, 11, 31, 8, 0), now)).toBe('Wed 31 Dec 2025 08:00');
  });

  it('splits when into the day and the clock', () => {
    expect(dayAndClock(at(2026, 10, 18, 10, 42), now)).toEqual({ day: 'Today', clock: '10:42' });
    expect(dayAndClock(at(2026, 10, 17, 18, 3), now)).toEqual({ day: 'Yesterday', clock: '18:03' });
    expect(dayAndClock(at(2026, 10, 16, 9, 15), now)).toEqual({ day: 'Mon 16 Nov', clock: '09:15' });
    expect(dayAndClock(at(2025, 11, 31, 8, 0), now)).toEqual({ day: 'Wed 31 Dec 2025', clock: '08:00' });
    // Just after midnight is still the day before.
    expect(dayAndClock(at(2026, 10, 17, 23, 59), now).day).toBe('Yesterday');
    expect(dayAndClock(at(2026, 10, 18, 0, 0), now).day).toBe('Today');
  });

  it('puts the cleans under their days, in the order the robot sent them', () => {
    const clean = (id: string, started: number) => ({ id, started, ended: started + 600, status: cleaningStatus({ state: 'finished' }), picture: new Uint8Array(0) });
    const records = [
      clean('a', at(2026, 10, 18, 10, 42)),
      clean('b', at(2026, 10, 18, 8, 15)),
      clean('c', at(2026, 10, 17, 18, 3)),
      clean('d', at(2026, 10, 16, 17, 30)),
      clean('e', at(2026, 10, 16, 10, 2)),
    ];
    expect(historyDays(records, now).map((d) => ({ day: d.day, ids: d.records.map((r) => r.id) }))).toEqual([
      { day: 'Today', ids: ['a', 'b'] },
      { day: 'Yesterday', ids: ['c'] },
      { day: 'Mon 16 Nov', ids: ['d', 'e'] },
    ]);
    expect(historyDays([], now)).toEqual([]);
  });

  it('adds up every clean', () => {
    expect(totalsText({ cleans: 23, area: 412.4, time: 18600, distance: 1520.25 })).toBe('23 cleans · 412 m² · 5 h 10 min · 1.5 km');
    expect(totalsText({ cleans: 1, area: 2, time: 120, distance: 8 })).toBe('1 clean · 2.0 m² · 2 min · 8.0 m');
    expect(totalsText({ cleans: 0, area: 0, time: 0, distance: 0 })).toBe('No cleans yet');
  });

  it('gives the totals as four numbers with their words', () => {
    expect(totalsNumbers({ cleans: 23, area: 412.4, time: 18600, distance: 1520.25 })).toEqual([
      { value: '23', label: 'cleans' },
      { value: '412 m²', label: 'cleaned' },
      { value: '5 h 10 min', label: 'time' },
      { value: '1.5 km', label: 'driven' },
    ]);
    expect(totalsNumbers({ cleans: 1, area: 2, time: 120, distance: 8 }).map((n) => `${n.value} ${n.label}`)).toEqual([
      '1 clean',
      '2.0 m² cleaned',
      '2 min time',
      '8.0 m driven',
    ]);
  });

  it('shows each clean in one line', () => {
    const record = {
      id: '20261118-104200-7',
      started: at(2026, 10, 18, 10, 42),
      ended: at(2026, 10, 18, 10, 56),
      status: cleaningStatus({ state: 'finished', cleanedArea: 21, coverage: 96, cleaningTime: 840, target: 'Living room' }),
      picture: new Uint8Array(0),
    };
    expect(historyLine(record, now)).toEqual({
      when: 'Today 10:42',
      time: '10:42',
      what: 'Living room',
      numbers: '21 m² · 96 % · 14 min',
      ended: 'done',
    });
    expect(historyLine({ ...record, status: { ...record.status, target: 'spot', state: 'stopped' } }, now)).toMatchObject({
      what: 'A spot',
      ended: 'stopped',
    });
  });

  it('lists the numbers of one clean', () => {
    const status = cleaningStatus({
      state: 'stopped',
      message: 'stopped: the robot left cleaning mode (now idle)',
      rowsSkipped: 1,
      edgesTotal: 12,
      bumps: 2,
      pauses: 1,
      job: { ...JOB, what: 'area', passes: 2, edges: 'on', returnToDock: 'off' },
    });
    expect(recordView(status)).toEqual({
      ended: 'stopped',
      reason: 'The robot left cleaning mode (now idle).',
      options: 'Twice · with the edges · then stays where it ends',
      numbers: [
        { label: 'Cleaned', value: '9.1 m²', more: 'of 21 m² (43 %)' },
        { label: 'Time cleaning', value: '6 min', more: '' },
        { label: 'Driven', value: '38 m', more: '' },
        { label: 'Rows', value: '11 of 31', more: '1 skipped' },
        { label: 'Edges', value: '0 of 12', more: '' },
        { label: 'Bumps', value: '2', more: '' },
        { label: 'Pauses', value: '1', more: '' },
      ],
    });
  });

  it('gives a reason only when the clean stopped or failed, and only the numbers there are', () => {
    const finished = recordView(cleaningStatus({ state: 'finished', message: 'finished: all rows done' }));
    expect(finished).toMatchObject({ ended: 'done', reason: '', options: 'Once · no edges · then back to the dock' });
    expect(finished.numbers.map((n) => n.label)).toEqual(['Cleaned', 'Time cleaning', 'Driven', 'Rows']);
    expect(recordView(cleaningStatus({ state: 'failed', message: 'failed: ' }))).toMatchObject({ ended: 'failed', reason: '' });
    expect(recordView(cleaningStatus({ state: 'failed', message: 'failed: no way to the next row' })).reason).toBe('No way to the next row.');
  });

  it('describes the options as they were sent', () => {
    expect(jobOptionsText(JOB)).toBe('Once · no edges · then back to the dock');
    expect(jobOptionsText({ ...JOB, edges: 'default', returnToDock: 'default' })).toBe('Once · then back to the dock');
  });
});
