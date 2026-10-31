import React from 'react';
import { View } from 'react-native';
import { margin } from '../core/theme';
import { formatPercent } from '../core/utils';
import { ProgressBar } from './ProgressBar';
import { ProgressIndicator } from './ProgressIndicator';
import { Caption, Highlight } from './Typography';

/**
 * The two ways the app shows a percentage. Use these (not raw text) for
 * every percentage view so the whole app keeps the pc_info look.
 */

interface BarProps {
  percentage: number;
  /** Small text after the value, like pc_info's "overall power level". */
  label: string;
  /** Grey line under the bar, like "2h 10min remaining". */
  footnote?: string;
  color?: string;
  digits?: number;
}

/** pc_info power-level layout: "NN% label", a bar, then a grey footnote. */
export function PercentBar({ percentage, label, footnote, color, digits = 0 }: BarProps) {
  return (
    <View style={{ marginVertical: margin / 2 }}>
      <Highlight value={formatPercent(percentage, digits)} suffix={label} size="detail" color={color} />
      <View style={{ marginTop: margin / 2 }}>
        <ProgressBar percentage={percentage} color={color} />
      </View>
      {footnote ? (
        <Caption upper={false} style={{ marginTop: margin / 2 }}>
          {footnote}
        </Caption>
      ) : null}
    </View>
  );
}

interface DialProps {
  percentage: number;
  caption: string;
  color?: string;
  size?: number;
  footnote?: string;
  precision?: number;
  showOverflow?: boolean;
}

/** pc_info battery-health layout: centred uppercase caption above a ring. */
export function PercentDial({ percentage, caption, color, size, footnote, precision, showOverflow }: DialProps) {
  return (
    <View style={{ alignItems: 'center', marginVertical: margin / 2, flex: 1 }}>
      <Caption style={{ marginBottom: margin / 2, textAlign: 'center' }}>{caption}</Caption>
      <ProgressIndicator percentage={percentage} color={color} size={size} precision={precision} showOverflow={showOverflow} />
      {footnote ? (
        <Caption upper={false} style={{ marginTop: margin / 2, textAlign: 'center' }}>
          {footnote}
        </Caption>
      ) : null}
    </View>
  );
}
