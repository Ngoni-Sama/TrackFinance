import React from 'react';
import { Text, TextStyle } from 'react-native';
import { fontSize, useTheme } from '../core/theme';

/** Grey caption ("BATTERY HEALTH" style when upper). */
export function Caption({ children, style, upper = true }: { children: React.ReactNode; style?: TextStyle; upper?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[{ color: t.caption, fontSize: fontSize.caption, letterSpacing: upper ? 0.6 : 0 }, style]}>
      {upper && typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: fontSize.title, fontWeight: '600' }, style]}>{children}</Text>;
}

/** Big value with a small inline suffix, e.g. "45% overall power level". */
export function Highlight({ value, suffix, color, size = 'highlight' }: {
  value: string;
  suffix?: string;
  color?: string;
  size?: 'highlight' | 'detail';
}) {
  const t = useTheme();
  return (
    <Text style={{ color: color ?? t.text, fontSize: fontSize[size] }}>
      {value}
      {suffix ? <Text style={{ color: t.text, fontSize: fontSize.suffix }}> {suffix}</Text> : null}
    </Text>
  );
}

export function Body({ children, style, muted, numberOfLines, onPress }: {
  children: React.ReactNode;
  style?: TextStyle;
  muted?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} onPress={onPress} style={[{ color: muted ? t.caption : t.text, fontSize: fontSize.detail }, style]}>
      {children}
    </Text>
  );
}
