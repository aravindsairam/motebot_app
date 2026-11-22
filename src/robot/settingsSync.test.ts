import type { SettingsValues } from '../transport/messages';
import { NO_SYNC, robotAnswered, robotReported, sameSettings, type SettingsSync, shownSettings, userChanged, valuesOf } from './settingsSync';

const ROBOT: SettingsValues = { cleaningSpeed: 0.2, manualSpeed: 0.3, rowSpacing: 0.25, rowAngleAuto: true, rowAngle: 0 };
const changed = (change: Partial<SettingsValues>, base: SettingsValues = ROBOT): SettingsValues => ({ ...base, ...change });

/** The robot has sent its settings and nothing is going on. */
function atRest(robot: SettingsValues = ROBOT): SettingsSync {
  return robotReported(NO_SYNC, robot);
}

describe('before the robot has sent its settings', () => {
  it('there is nothing to show and nothing to change', () => {
    expect(shownSettings(NO_SYNC)).toBeNull();
    expect(userChanged(NO_SYNC, ROBOT)).toEqual({ state: NO_SYNC, send: null });
  });

  it("the robot's report is what is shown", () => {
    expect(shownSettings(atRest())).toEqual(ROBOT);
  });

  it('a report keeps the five values and drops the rest', () => {
    const report = { ...ROBOT, limits: { cleaningSpeedMin: 0.1 }, manualTurnSpeed: 1.2 };
    expect(atRest(report).robot).toEqual(ROBOT);
    expect(valuesOf(report)).toEqual(ROBOT);
  });
});

describe('a change', () => {
  it('shows at once and is sent as the complete set', () => {
    const wanted = changed({ cleaningSpeed: 0.25 });
    const { state, send } = userChanged(atRest(), wanted);
    expect(send).toEqual(wanted);
    expect(shownSettings(state)).toEqual(wanted);
    expect(state.inFlight).toBe(send);
    expect(state.robot).toEqual(ROBOT); // what the robot said is kept, to go back to
  });

  it('back to what the robot already has sends nothing', () => {
    const { state, send } = userChanged(atRest(), { ...ROBOT });
    expect(send).toBeNull();
    expect(state.inFlight).toBeNull();
    expect(shownSettings(state)).toEqual(ROBOT);
  });

  it("is the same set when it differs only by the noise of the robot's 32-bit numbers", () => {
    const noisy = changed({ cleaningSpeed: Math.fround(0.2), manualSpeed: Math.fround(0.3) });
    expect(sameSettings(noisy, ROBOT)).toBe(true);
    expect(userChanged(atRest(noisy), ROBOT).send).toBeNull();
    expect(sameSettings(changed({ rowAngleAuto: false }), ROBOT)).toBe(false);
    expect(sameSettings(changed({ rowAngle: 5 }), ROBOT)).toBe(false);
    expect(sameSettings(changed({ rowSpacing: 0.3 }), ROBOT)).toBe(false);
  });
});

describe('the answer', () => {
  it('OK, the report already in: the report is the truth', () => {
    const wanted = changed({ rowSpacing: 0.3 });
    let s = userChanged(atRest(), wanted).state;
    const report = changed({ rowSpacing: Math.fround(0.3) });
    s = robotReported(s, report);
    expect(shownSettings(s)).toEqual(wanted); // still the user's while the request waits
    const { state, send } = robotAnswered(s, true);
    expect(send).toBeNull();
    expect(state).toEqual({ robot: report, wanted: null, inFlight: null, reportedSince: false });
  });

  it('OK before the report: the controls do not jump back while the report is on its way', () => {
    const wanted = changed({ rowSpacing: 0.3 });
    const asked = userChanged(atRest(), wanted).state;
    const { state, send } = robotAnswered(asked, true);
    expect(send).toBeNull();
    expect(shownSettings(state)).toEqual(wanted);
    expect(state.inFlight).toBeNull();
    // then the report: the truth, whatever it says
    const report = changed({ rowSpacing: 0.3, cleaningSpeed: 0.15 });
    expect(shownSettings(robotReported(state, report))).toEqual(report);
  });

  it('refused: back to what the robot last reported', () => {
    const asked = userChanged(atRest(), changed({ cleaningSpeed: 0.5 })).state;
    const { state, send } = robotAnswered(asked, false);
    expect(send).toBeNull();
    expect(state).toEqual({ robot: ROBOT, wanted: null, inFlight: null, reportedSince: false });
    expect(shownSettings(state)).toEqual(ROBOT);
  });

  it("refused, after another phone changed something meanwhile: back to the robot's newest report", () => {
    let s = userChanged(atRest(), changed({ cleaningSpeed: 0.5 })).state;
    const theirs = changed({ manualSpeed: 0.15 });
    s = robotReported(s, theirs);
    expect(shownSettings(robotAnswered(s, false).state)).toEqual(theirs);
  });

  it('with no request on its way changes nothing', () => {
    const s = atRest();
    expect(robotAnswered(s, true)).toEqual({ state: s, send: null });
    expect(robotAnswered(s, false)).toEqual({ state: s, send: null });
  });
});

describe('several changes in a row', () => {
  it('one request at a time: the newest set goes out when the answer comes', () => {
    const first = changed({ cleaningSpeed: 0.25 });
    const second = changed({ cleaningSpeed: 0.3 });
    const third = changed({ cleaningSpeed: 0.3, rowAngleAuto: false, rowAngle: 45 });
    let step = userChanged(atRest(), first);
    expect(step.send).toEqual(first);
    step = userChanged(step.state, second);
    expect(step.send).toBeNull(); // waits
    step = userChanged(step.state, third);
    expect(step.send).toBeNull();
    expect(shownSettings(step.state)).toEqual(third); // the newest shows at once
    expect(step.state.inFlight).toEqual(first);

    step = robotAnswered(robotReported(step.state, first), true);
    expect(step.send).toEqual(third); // the set in between was never sent
    expect(shownSettings(step.state)).toEqual(third);
    expect(step.state.inFlight).toBe(step.send);

    step = robotAnswered(robotReported(step.state, third), true);
    expect(step.send).toBeNull();
    expect(step.state).toEqual({ robot: third, wanted: null, inFlight: null, reportedSince: false });
  });

  it('back to the set already on its way sends nothing more', () => {
    const first = changed({ cleaningSpeed: 0.25 });
    let step = userChanged(atRest(), first);
    step = userChanged(step.state, changed({ cleaningSpeed: 0.3 }));
    step = userChanged(step.state, first); // plus, then minus
    step = robotAnswered(step.state, true);
    expect(step.send).toBeNull();
    expect(shownSettings(step.state)).toEqual(first);
    expect(step.state.inFlight).toBeNull();
  });

  it('back to where the robot was, while a request is on its way, is sent after it', () => {
    let step = userChanged(atRest(), changed({ cleaningSpeed: 0.25 }));
    step = userChanged(step.state, ROBOT); // plus, then minus
    step = robotAnswered(step.state, true); // by now the robot holds 0.25
    expect(step.send).toEqual(ROBOT);
  });

  it('a refusal drops the changes that were waiting as well', () => {
    let step = userChanged(atRest(), changed({ cleaningSpeed: 0.25 }));
    step = userChanged(step.state, changed({ cleaningSpeed: 0.3 }));
    step = robotAnswered(step.state, false);
    expect(step.send).toBeNull();
    expect(shownSettings(step.state)).toEqual(ROBOT);
    expect(step.state.wanted).toBeNull();
  });

  it('a report that came for the first request does not count for the second', () => {
    const first = changed({ cleaningSpeed: 0.25 });
    const second = changed({ cleaningSpeed: 0.3 });
    let step = userChanged(atRest(), first);
    step = userChanged(step.state, second);
    step = robotAnswered(robotReported(step.state, first), true); // sends the second
    step = robotAnswered(step.state, true); // OK, its report still on its way
    expect(shownSettings(step.state)).toEqual(second); // not back to the first for a moment
  });

  it('after a refusal the next change starts from what the robot reported', () => {
    let step = userChanged(atRest(), changed({ cleaningSpeed: 0.5 }));
    step = robotAnswered(step.state, false);
    step = userChanged(step.state, changed({ rowSpacing: 0.2 }));
    expect(step.send).toEqual(changed({ rowSpacing: 0.2 }));
  });
});
