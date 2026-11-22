// A picture the robot sent (a JPEG from its camera), drawn with Skia from the bytes, the way the
// History tab draws a clean's picture. It keeps its shape and fits inside the size given.

import { Canvas, Image, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors } from './theme';

export function RobotPicture({ bytes, maxWidth, maxHeight }: { bytes: Uint8Array; maxWidth: number; maxHeight: number }) {
  const image = useMemo(() => (bytes.length > 0 ? Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes)) : null), [bytes]);
  if (!image || image.width() === 0 || image.height() === 0) return <Text style={styles.note}>The picture could not be read.</Text>;
  const k = Math.min(maxWidth / image.width(), maxHeight / image.height());
  const width = Math.max(1, Math.round(image.width() * k));
  const height = Math.max(1, Math.round(image.height() * k));
  return (
    <Canvas style={{ width, height }}>
      <Image image={image} x={0} y={0} width={width} height={height} fit="contain" />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, color: colors.muted, fontStyle: 'italic' },
});
