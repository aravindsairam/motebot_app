// Everything the app knows about the robot: the latest copy of each message, when it arrived,
// and the state of the connection. One place; screens read from here and nowhere else.

import { create } from 'zustand';

import type { ConnectionStatus } from '../transport/connection';
import type { Hello, MapData, NavigationStatus, NoGoZones, RobotState, Route, SafetyStatus } from '../transport/messages';

export interface Received<T> {
  value: T;
  at: number; // when it arrived, ms (Date.now)
}

export interface RobotData {
  address: string | null; // as shown to the user; null when not connecting
  connection: ConnectionStatus;
  everConnected: boolean; // connected at least once since Connect was pressed
  hello: Hello | null; // from the latest good connection
  heardAt: number | null; // any message, ms
  pingMs: number | null; // round trip of the latest ping; null when unknown
  robotState: Received<RobotState> | null;
  safety: Received<SafetyStatus> | null;
  map: Received<MapData> | null; // stays valid until a new one comes: the robot sends it only on change
  route: Received<Route> | null; // the route Nav2 planned last
  navigation: Received<NavigationStatus> | null; // the newest navigation goal, whoever sent it
  zones: Received<NoGoZones> | null; // the no-go zones of the map in use; sent when they change
}

export const initialRobotData: RobotData = {
  address: null,
  connection: { kind: 'stopped' },
  everConnected: false,
  hello: null,
  heardAt: null,
  pingMs: null,
  robotState: null,
  safety: null,
  map: null,
  route: null,
  navigation: null,
  zones: null,
};

export const useRobot = create<RobotData>(() => initialRobotData);

// How old a copy may be before the app stops presenting it as current. The robot sends its state
// twice a second and the gateway repeats the safety status twice a second, so 2 s is four missed.
export const STALE_AFTER_MS = 2000;

export function isFresh(received: Received<unknown> | null, now: number): boolean {
  return received !== null && now - received.at <= STALE_AFTER_MS;
}
