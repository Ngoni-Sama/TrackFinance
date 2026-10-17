import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { margin, radius, useTheme } from '../core/theme';
import { Caption, Title } from './Typography';

/** A pc_info-style pane: flat card, hairline border, bold title. */
export function Pane({ title, children, style, onPress, right }: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: t.pane,
          borderColor: t.paneBorder,
          borderWidth: 1,
          borderRadius: radius,
          padding: margin * 1.5,
          marginBottom: margin,
        },
        style,
      ]}
    >
      {title ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: margin }}>
          <Title>{title}</Title>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Separator() {
  const t = useTheme();
  return <View style={{ height: 0.5, backgroundColor: t.separator, marginVertical: margin }} />;
}

/** Caption over value, the stacked label pair pc_info uses for every spec. */
export function Field({ caption, children, style }: { caption: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ marginBottom: margin }, style]}>
      <Caption upper={false}>{caption}</Caption>
      {children}
    </View>
  );
}
