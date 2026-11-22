// Connects the store to the gateway: one connection at a time, its news written into the store,
// and a ping every 2 s while connected to show the connection's delay.

import { GatewayConnection, type SocketLike } from '../transport/connection';
import {
  CommandType,
  DataType,
  decodeAssistantStatus,
  decodeCleanedArea,
  decodeCleaningPlan,
  decodeCleaningStatus,
  decodeExplorationStatus,
  decodeFrontiers,
  decodeMap,
  decodeNavigationStatus,
  decodeNoGoZones,
  decodeRobotPose,
  decodeRoute,
  decodeRobotSettings,
  decodeRobotState,
  decodeRooms,
  decodeSafetyStatus,
  encodePing,
} from '../transport/messages';
import { resetActions } from './actionsStore';
import { onCleaningStatus } from './cleaningNews';
import { resetCleaning, useCleaning } from './cleaningStore';
import { onExplorationStatus } from './explorationNews';
import { resetExploring, useExploring } from './exploringStore';
import { resetHistory } from './historyStore';
import { clearMark } from './markStore';
import { resetRoomEdit } from './roomEditStore';
import { resetSettings, useSettings } from './settingsStore';
import { robotReported } from './settingsSync';
import { onNavigationStatus } from './tripOutcome';
import { resetTrip } from './tripStore';
import type { GatewayAddress } from './address';
import { livePose } from './live';
import { initialRobotData, useRobot } from './store';

const PING_PERIOD_MS = 2000;
const PING_TIMEOUT_MS = 3000;

let connection: GatewayConnection | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

export interface ClientDeps {
  createSocket?: (url: string) => SocketLike;
  now?: () => number;
}

/** The connection commands are sent on, or null when not connecting. */
export function currentConnection(): GatewayConnection | null {
  return connection;
}

export function connectTo(address: GatewayAddress, deps: ClientDeps = {}): void {
  disconnect();
  const now = deps.now ?? (() => Date.now());
  useRobot.setState({ ...initialRobotData, address: address.label });
  const conn = new GatewayConnection({
    url: address.url,
    createSocket: deps.createSocket,
    now,
    onStatus: (status) =>
      useRobot.setState((s) => ({
        connection: status,
        everConnected: s.everConnected || status.kind === 'connected',
        hello: status.kind === 'connected' ? status.hello : s.hello,
        pingMs: status.kind === 'connected' ? s.pingMs : null,
      })),
    onHeard: (at) => useRobot.setState({ heardAt: at }),
    onFrame: (type, payload) => {
      try {
        receive(type, payload, now);
      } catch {
        // A message that cannot be read is skipped; the next copy of that stream replaces it.
      }
    },
  });
  connection = conn;

  let pinging = false;
  pingTimer = setInterval(() => {
    if (pinging || useRobot.getState().connection.kind !== 'connected') return;
    pinging = true;
    const sent = now();
    conn
      .request(CommandType.COMMAND_PING, encodePing, PING_TIMEOUT_MS)
      .then(() => {
        if (connection === conn) useRobot.setState({ pingMs: now() - sent });
      })
      .catch(() => {
        if (connection === conn) useRobot.setState({ pingMs: null });
      })
      .finally(() => {
        pinging = false;
      });
  }, PING_PERIOD_MS);

  conn.start();
}

function receive(type: number, payload: Uint8Array, now: () => number): void {
  switch (type) {
    case DataType.DATA_ROBOT_STATE:
      useRobot.setState({ robotState: { value: decodeRobotState(payload), at: now() } });
      break;
    case DataType.DATA_SAFETY_STATUS:
      useRobot.setState({ safety: { value: decodeSafetyStatus(payload), at: now() } });
      break;
    case DataType.DATA_MAP:
      useRobot.setState({ map: { value: decodeMap(payload), at: now() } });
      break;
    case DataType.DATA_ROBOT_POSE:
      livePose.set(decodeRobotPose(payload), now());
      break;
    case DataType.DATA_ROUTE:
      useRobot.setState({ route: { value: decodeRoute(payload), at: now() } });
      break;
    case DataType.DATA_NAVIGATION: {
      const status = decodeNavigationStatus(payload);
      useRobot.setState({ navigation: { value: status, at: now() } });
      onNavigationStatus(status);
      break;
    }
    case DataType.DATA_NO_GO_ZONES:
      useRobot.setState({ zones: { value: decodeNoGoZones(payload), at: now() } });
      break;
    case DataType.DATA_ROBOT_SETTINGS: {
      const settings = decodeRobotSettings(payload);
      useRobot.setState({ settings: { value: settings, at: now() } });
      useSettings.setState((s) => robotReported(s, settings));
      break;
    }
    case DataType.DATA_ROOMS:
      useRobot.setState({ rooms: { value: decodeRooms(payload), at: now() } });
      break;
    case DataType.DATA_ASSISTANT_STATUS:
      useRobot.setState({ assistant: { value: decodeAssistantStatus(payload), at: now() } });
      break;
    case DataType.DATA_CLEANING_STATUS: {
      const status = decodeCleaningStatus(payload);
      useCleaning.setState({ status: { value: status, at: now() } });
      onCleaningStatus(status);
      break;
    }
    case DataType.DATA_CLEANING_PLAN:
      useCleaning.setState({ plan: { value: decodeCleaningPlan(payload), at: now() } });
      break;
    case DataType.DATA_CLEANED_AREA:
      useCleaning.setState({ cleaned: { value: decodeCleanedArea(payload), at: now() } });
      break;
    case DataType.DATA_EXPLORATION_STATUS: {
      const status = decodeExplorationStatus(payload);
      useExploring.setState({ status: { value: status, at: now() } });
      onExplorationStatus(status);
      break;
    }
    case DataType.DATA_FRONTIERS:
      useExploring.setState({ frontiers: { value: decodeFrontiers(payload), at: now() } });
      break;
    default:
      break; // a message added after this app was built: nothing here can use it yet
  }
}

export function disconnect(): void {
  if (pingTimer !== null) clearInterval(pingTimer);
  pingTimer = null;
  const old = connection;
  connection = null;
  old?.stop();
  livePose.clear();
  resetActions();
  resetTrip();
  resetCleaning();
  resetExploring();
  resetHistory();
  resetSettings();
  resetRoomEdit();
  clearMark();
  useRobot.setState(initialRobotData);
}
