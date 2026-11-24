// The map's cleaning layers, drawn inside the map's picture (one unit = one map cell, y down):
// the floor cleaned so far as one teal tinted picture, the rows (as planned, or still to drive), and
// the area or spot being marked while choosing what to clean. The area's corners are white handles
// edged in its colour.

import { AlphaType, BlendColor, Circle, ColorType, FilterMode, Group, Image, MipmapMode, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import { type Box, boxAround, mapBoxToPicture, SPOT_SIZE_M } from '../robot/cleanArea';
import { cleanedToRgba, overlayPlacement } from '../robot/cleanedPicture';
import { type MapPlacement, toPicture } from '../robot/mapPicture';
import type { CleanedArea, PieceKind, PlanPiece } from '../transport/messages';
import { colors } from './theme';

const ROW_COLOR = colors.cleaning;
const EDGE_COLOR = '#d97706';
const TRANSIT_COLOR = colors.faint;
const MARK_FILL = 'rgba(11,107,115,0.10)'; // the teal at 10 %, as in the design
// The cleaned cells come from the robot about 43 % opaque; painted teal at this strength they end
// up near the design's 24 % tint.
const CLEANED_TINT = 'rgba(11,107,115,0.56)';
const HANDLE_RADIUS_PX = 9; // on screen: a corner the thumb can find
const HANDLE_EDGE_PX = 2.5; // on screen: the handle's coloured edge

/** The cleaned floor: the robot's grid as one picture, tinted teal where cleaned. */
export function CleanedLayer({ map, cleaned }: { map: MapPlacement; cleaned: CleanedArea }) {
  const image = useMemo(() => {
    const data = Skia.Data.fromBytes(cleanedToRgba(cleaned));
    return Skia.Image.MakeImage(
      { width: cleaned.width, height: cleaned.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      data,
      cleaned.width * 4,
    );
  }, [cleaned]);
  if (!image) return null;
  const at = overlayPlacement(map, cleaned);
  return (
    <Image
      image={image}
      x={at.x}
      y={at.y}
      width={at.width}
      height={at.height}
      fit="fill"
      sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }}
    >
      <BlendColor color={CLEANED_TINT} mode="srcIn" />
    </Image>
  );
}

/** The plan's pieces, one path per kind: rows bold, the hops between them thin, the trips Nav2
 *  plans faint (the robot goes around things there, not along the line), edges in amber. Faded:
 *  an older preview, shown while the new one is on its way. */
export function PlanLayer({ map, pieces, scale, faded = false }: { map: MapPlacement; pieces: PlanPiece[]; scale: SharedValue<number>; faded?: boolean }) {
  const paths = useMemo(() => {
    const builders: Record<PieceKind, ReturnType<typeof Skia.PathBuilder.Make>> = {
      row: Skia.PathBuilder.Make(),
      connector: Skia.PathBuilder.Make(),
      transit: Skia.PathBuilder.Make(),
      edge: Skia.PathBuilder.Make(),
    };
    for (const p of pieces) {
      const a = toPicture(map, p.x0, p.y0);
      const b = toPicture(map, p.x1, p.y1);
      builders[p.kind].moveTo(a.px, a.py);
      builders[p.kind].lineTo(b.px, b.py);
    }
    return {
      row: builders.row.build(),
      connector: builders.connector.build(),
      transit: builders.transit.build(),
      edge: builders.edge.build(),
    };
  }, [map, pieces]);
  const bold = useDerivedValue(() => 2.5 / scale.value);
  const thin = useDerivedValue(() => 1.5 / scale.value);
  if (pieces.length === 0) return null;
  return (
    <Group opacity={faded ? 0.35 : 1}>
      <Path path={paths.transit} style="stroke" strokeWidth={thin} color={TRANSIT_COLOR} opacity={0.45} strokeCap="round" />
      <Path path={paths.connector} style="stroke" strokeWidth={thin} color={ROW_COLOR} opacity={0.8} strokeCap="round" />
      <Path path={paths.row} style="stroke" strokeWidth={bold} color={ROW_COLOR} opacity={0.9} strokeCap="round" />
      <Path path={paths.edge} style="stroke" strokeWidth={bold} color={EDGE_COLOR} opacity={0.9} strokeCap="round" />
    </Group>
  );
}

/** The area being marked (or a no-go zone being changed), on the picture: it follows the finger,
 *  with a handle at each corner. */
export function AreaLayer({
  area,
  scale,
  fill = MARK_FILL,
  edge = ROW_COLOR,
}: {
  area: SharedValue<Box | null>;
  scale: SharedValue<number>;
  fill?: string;
  edge?: string;
}) {
  const x = useDerivedValue(() => area.value?.x0 ?? 0);
  const y = useDerivedValue(() => area.value?.y0 ?? 0);
  const width = useDerivedValue(() => (area.value ? area.value.x1 - area.value.x0 : 0));
  const height = useDerivedValue(() => (area.value ? area.value.y1 - area.value.y0 : 0));
  const opacity = useDerivedValue(() => (area.value ? 1 : 0));
  const line = useDerivedValue(() => 2 / scale.value);
  const handle = useDerivedValue(() => HANDLE_RADIUS_PX / scale.value);
  const handleEdge = useDerivedValue(() => HANDLE_EDGE_PX / scale.value);
  const c0 = useDerivedValue(() => vec(area.value?.x0 ?? 0, area.value?.y0 ?? 0));
  const c1 = useDerivedValue(() => vec(area.value?.x1 ?? 0, area.value?.y0 ?? 0));
  const c2 = useDerivedValue(() => vec(area.value?.x1 ?? 0, area.value?.y1 ?? 0));
  const c3 = useDerivedValue(() => vec(area.value?.x0 ?? 0, area.value?.y1 ?? 0));
  return (
    <Group opacity={opacity}>
      <Rect x={x} y={y} width={width} height={height} color={fill} />
      <Rect x={x} y={y} width={width} height={height} color={edge} style="stroke" strokeWidth={line} />
      {[c0, c1, c2, c3].map((c, i) => (
        <Group key={i}>
          <Circle c={c} r={handle} color="#ffffff" />
          <Circle c={c} r={handle} color={edge} style="stroke" strokeWidth={handleEdge} />
        </Group>
      ))}
    </Group>
  );
}

/** The spot: the square the robot will clean around the tapped point. */
export function SpotLayer({ map, spot, scale }: { map: MapPlacement; spot: { x: number; y: number }; scale: SharedValue<number> }) {
  const square = mapBoxToPicture(map, boxAround(spot.x, spot.y, SPOT_SIZE_M));
  const centre = toPicture(map, spot.x, spot.y);
  const line = useDerivedValue(() => 2 / scale.value);
  const dot = useDerivedValue(() => 5 / scale.value);
  return (
    <Group>
      <Rect x={square.x0} y={square.y0} width={square.x1 - square.x0} height={square.y1 - square.y0} color={MARK_FILL} />
      <Rect
        x={square.x0}
        y={square.y0}
        width={square.x1 - square.x0}
        height={square.y1 - square.y0}
        color={ROW_COLOR}
        style="stroke"
        strokeWidth={line}
      />
      <Circle cx={centre.px} cy={centre.py} r={dot} color={ROW_COLOR} />
    </Group>
  );
}
