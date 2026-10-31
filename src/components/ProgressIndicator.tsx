import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fontSize, useTheme } from '../core/theme';

interface Props {
  /** 0–100; values outside the range are clamped. */
  percentage: number;
  size?: number;
  lineWidth?: number;
  color?: string;
  /** Decimal places for the centre label (pc_info shows whole numbers). */
  precision?: number;
  /** Show the real value in the centre even when it is outside 0–100 (the ring itself stays clamped). */
  showOverflow?: boolean;
}

/**
 * Circular percentage ring, modelled on lecui's progress_indicator
 * (the BATTERY HEALTH dial in pc_info): a thin empty track, an accent arc
 * starting at 12 o'clock, and the value centred inside.
 */
export function ProgressIndicator({ percentage, size = 72, lineWidth = 4, color, precision = 0, showOverflow }: Props) {
  const t = useTheme();
  const p = clampPercent(percentage);
  const r = (size - lineWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (p / 100) * circumference;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.progressEmpty} strokeWidth={lineWidth} fill="none" />
        {p > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? t.accent}
            strokeWidth={lineWidth}
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={{ color: t.text, fontSize: size < 60 ? fontSize.caption : fontSize.detail }}>
          {(showOverflow && Number.isFinite(percentage) ? percentage : p).toFixed(precision)}%
        </Text>
      </View>
    </View>
  );
}

export function clampPercent(p: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0));
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
