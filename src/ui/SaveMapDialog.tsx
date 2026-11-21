// Asks for the new map's name, then saves it. If a map of that name exists, asks before
// replacing it.

import { mapNameProblem, saveMap } from '../robot/mapping';
import { NameDialog } from './NameDialog';

export function SaveMapDialog({ visible, suggestion, onClose }: { visible: boolean; suggestion: string; onClose: () => void }) {
  return (
    <NameDialog
      visible={visible}
      title="Save the map"
      suggestion={suggestion}
      help="The robot uses this map from now on."
      backLabel="Back to mapping"
      what="map"
      problemOf={mapNameProblem}
      save={saveMap}
      onClose={onClose}
    />
  );
}
