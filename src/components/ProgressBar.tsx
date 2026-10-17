import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../core/theme';
import { clampPercent } from './ProgressIndicator';

interface Props {
  percentage: number;
  color?: string;
  height?: number;
}

/** Flat horizontal bar, modelled on lecui's progress_bar (pc_info's power level bar). */
export function ProgressBar({ percentage, color, height = 6 }: Props) {
  const t = useTheme();
  const p = clampPercent(percentage);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
      style={{ height, backgroundColor: t.progressEmpty, borderRadius: height / 2, overflow: 'hidden' }}
    >
      <View style={{ width: `${p}%`, height: '100%', backgroundColor: color ?? t.accent }} />
    </View>
  );
}
