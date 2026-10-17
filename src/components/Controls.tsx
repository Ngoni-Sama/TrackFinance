import React from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categoryLabel } from '../core/constants';
import { CATEGORY_COLORS, fontSize, margin, radius, useTheme } from '../core/theme';
import { Body, Caption } from './Typography';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: t.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: margin }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: margin }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? t.notOk : 'transparent';
  const fg = variant === 'secondary' ? t.accent : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: variant === 'secondary' ? t.accent : bg,
          borderWidth: 1,
          borderRadius: radius,
          paddingVertical: margin,
          paddingHorizontal: margin * 1.5,
          alignItems: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          marginVertical: margin / 2,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: fontSize.detail, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: margin }}>
      <Caption upper={false} style={{ marginBottom: 4 }}>
        {label}
      </Caption>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.caption}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          color: t.text,
          backgroundColor: t.inputBackground,
          borderColor: t.paneBorder,
          borderWidth: 1,
          borderRadius: radius,
          paddingHorizontal: margin,
          paddingVertical: margin * 0.8,
          fontSize: fontSize.detail,
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        borderColor: c,
        borderWidth: 1,
        backgroundColor: selected ? c : 'transparent',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <Text style={{ color: selected ? '#FFFFFF' : t.text, fontSize: fontSize.caption }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: margin }}>
      {options.map((o) => (
        <Chip key={o} label={labels?.[o] ?? o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </View>
  );
}

export function CategoryPicker({ value, onChange, categories }: { value: string; onChange: (c: string) => void; categories: readonly string[] }) {
  return (
    <View style={{ marginBottom: margin }}>
      <Caption upper={false} style={{ marginBottom: 4 }}>
        Category
      </Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <Chip key={c} label={categoryLabel(c)} color={CATEGORY_COLORS[c]} selected={c === value} onPress={() => onChange(c)} />
        ))}
      </View>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={{ padding: margin * 3, alignItems: 'center' }}>
      <Body muted style={{ textAlign: 'center' }}>
        {text}
      </Body>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Fab({ onPress, label = '+' }: { onPress: () => void; label?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Add"
      style={{
        position: 'absolute',
        right: margin * 2,
        bottom: margin * 2,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: t.accent,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
      }}
    >
      <Text style={{ color: '#FFF', fontSize: 28, lineHeight: 30 }}>{label}</Text>
    </Pressable>
  );
}
