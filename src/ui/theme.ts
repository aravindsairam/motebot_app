// The app's look: one calm ground, one teal for the main actions (and cleaning), red only for
// Stop and real trouble. The design is the "MOTEbot App" canvas.

export const colors = {
  background: '#f2f4f3', // the ground behind cards and lists
  card: '#ffffff',
  text: '#14201e',
  muted: '#5a6763', // secondary text: 4.5:1 or better on white and on the ground
  faint: '#6b7773', // labels on the map, disabled labels
  border: '#dde3e1', // lines between areas, card edges
  line: '#eef1f0', // dividers inside a card
  field: '#c9d6d4', // edges of outlined buttons and inputs
  soft: '#f2f4f3', // filled tiles and boxes on a card
  primary: '#0b6b73',
  primaryDark: '#084f55',
  primarySoft: '#e3f1f1',
  primaryDisabled: '#d5e6e6',
  primaryDisabledText: '#4a6e70',
  good: '#2f7d4a',
  goodText: '#22603a',
  goodBackground: '#e2f2e7',
  info: '#2c5bd8', // a place to go: the Go to pin, the mapping mode
  infoBackground: '#eef3fd',
  warning: '#8a4a06',
  warningBackground: '#fdf1dc',
  danger: '#c62f2a',
  dangerText: '#a8322d',
  dangerBackground: '#fbe6e4',
  stopDisabled: '#f3d6d4',
  stopDisabledText: '#8e3a36',
  cleaning: '#0b6b73', // the cleaning mode's colour: Clean, Start, its rows on the map
  cleaningBackground: '#e3f1f1',
  explore: '#1f6fb2', // exploring: Explore, the places still to explore
  exploreText: '#185c94',
  exploreBackground: '#e5eff8',
  zone: '#c2410c', // no-go zones
  zoneBackground: '#fdf0e8',
  mark: '#6a35a3', // a place the robot pointed to in the chat
  markBackground: '#f3edfa',
  mapUnknown: '#e4e8e6', // the map where nothing is known yet
  scrim: 'rgba(20,32,30,0.45)', // behind dialogs
  overlay: 'rgba(20,32,30,0.62)', // small dark labels and buttons over the map or the camera
  float: 'rgba(255,255,255,0.95)', // buttons and notes floating over the map
};

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const radius = { s: 8, m: 12, l: 14, xl: 16, xxl: 20, pill: 999 };

// Headings, numbers and the big buttons use Space Grotesk, bundled with the app (app.json). Body
// text stays the phone's own font. A bundled font comes in one weight per file: never add
// fontWeight to a style that sets one of these, or Android may thicken it a second time.
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
};

// A light shadow for things floating over the map, and for the bottom sheet.
export const floatShadow = { elevation: 3, shadowColor: '#14201e', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } };
export const sheetShadow = { elevation: 8, shadowColor: '#14201e', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } };
