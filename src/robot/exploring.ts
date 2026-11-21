// Exploring from the phone: in the New map flow, Explore lets the robot map the house by itself.
// The robot keeps the map being made whatever happens; Stop (a request for idle) ends the
// exploration and leaves the robot in mapping, where the map is saved or discarded as usual.

import { releaseStick } from './drive';
import { showNotice, showRefusal, useActions } from './actionsStore';
import { startExploration } from './commands';
import { useExploring } from './exploringStore';

export async function explore(): Promise<boolean> {
  releaseStick(); // the robot drives itself now
  useActions.setState({ busy: 'explore' });
  showNotice(null);
  try {
    const outcome = await startExploration();
    if (!outcome.ok) {
      showRefusal("Couldn't start exploring", outcome.text);
      return false;
    }
    if (outcome.jobId !== 0) useExploring.setState({ mine: outcome.jobId }); // its end gets a card
    return true;
  } finally {
    useActions.setState((s) => ({ busy: s.busy === 'explore' ? null : s.busy }));
  }
}
