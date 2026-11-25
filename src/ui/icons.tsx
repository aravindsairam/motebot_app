// The app's icons: simple line drawings on a 24 by 24 grid, drawn in the colour given (the text
// colour around them, as a rule). A few are filled shapes (Stop, Pause, Resume).

import Svg, { Path } from 'react-native-svg';

// A circle as a path: centre (cx, cy), radius r.
const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const ICONS = {
  home: { d: ['M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z'] },
  ask: { d: ['M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z'] },
  history: { d: [ring(12, 12, 8.5), 'M12 7.5V12l3 2'] },
  robot: { d: [ring(12, 12, 8.5), 'M8 9.5h8', ring(12, 14.5, 2)] },
  goTo: { d: ['M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z', ring(12, 10.5, 2.2)] },
  drive: { d: [ring(12, 12, 8.5), ring(12, 12, 3.2)] },
  newMap: { d: ['M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z', 'M9 4.5v13M15 6.5v13'] },
  dock: { d: ['M4 20h16', 'M6.5 20v-8a5.5 5.5 0 0 1 11 0v8', 'M12.6 10.2l-2 3.3h2.8l-2 3.3'] },
  clean: {
    d: ['M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9-1.9 4.9-1.9-4.9-4.9-1.9 4.9-1.9z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  },
  explore: { d: [ring(12, 12, 8.5), 'M15.5 8.5l-2 5-5 2 2-5z'] },
  fit: { d: ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'] },
  zones: { d: [ring(12, 12, 8.5), 'M6 18L18 6'] },
  rooms: { d: ['M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z', 'M12 3.5v6.5M12 14v6.5M3.5 12h5'] },
  join: { d: ['M3.5 12h6.5M7.5 9.5L10 12l-2.5 2.5', 'M20.5 12H14M16.5 9.5L14 12l2.5 2.5'] },
  split: { d: ['M4.5 6.5h15v11h-15z', 'M12 3.5v17'] },
  camera: { d: ['M4 8h3l2-2.5h6L17 8h3v11H4z', ring(12, 13, 3.2)] },
  close: { d: ['M6 6l12 12M18 6L6 18'] },
  plus: { d: ['M12 5v14M5 12h14'] },
  trash: { d: ['M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13'] },
  check: { d: ['M5 12.5l4.5 4.5L19 7.5'] },
  chevron: { d: ['M9 5l7 7-7 7'] },
  send: { d: ['M12 19V5M6 11l6-6 6 6'] },
  newChat: { d: ['M12 20h8M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4z'] },
  options: { d: ['M4 7h10M18 7h2M4 17h4M12 17h8', ring(16, 7, 2), ring(10, 17, 2)] },
  area: { d: ['M5 5h14v14H5z'], dashed: true },
  stop: { d: ['M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z'], filled: true },
  pause: {
    d: ['M7.2 5h1.6A1.2 1.2 0 0 1 10 6.2v11.6A1.2 1.2 0 0 1 8.8 19H7.2A1.2 1.2 0 0 1 6 17.8V6.2A1.2 1.2 0 0 1 7.2 5zM15.2 5h1.6A1.2 1.2 0 0 1 18 6.2v11.6a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 15.2 5z'],
    filled: true,
  },
  resume: { d: ['M8 5.5v13l10.5-6.5z'], filled: true },
} satisfies Record<string, { d: string[]; filled?: boolean; dashed?: boolean }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const icon: { d: string[]; filled?: boolean; dashed?: boolean } = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants">
      {icon.d.map((d, i) =>
        icon.filled ? (
          <Path key={i} d={d} fill={color} />
        ) : (
          <Path
            key={i}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={icon.dashed ? '3 2.5' : undefined}
          />
        ),
      )}
    </Svg>
  );
}
