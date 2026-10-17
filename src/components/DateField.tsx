import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fontSize, margin, radius, useTheme } from '../core/theme';
import { Caption } from './Typography';

/** Tappable date (and optionally time) field using the native Android pickers. */
export function DateField({ label, value, onChange, withTime }: { label: string; value: number; onChange: (ms: number) => void; withTime?: boolean }) {
  const t = useTheme();

  const pickTime = (base: Date) =>
    DateTimePickerAndroid.open({
      value: base,
      mode: 'time',
      is24Hour: true,
      onChange: (ev, d) => ev.type === 'set' && d && onChange(d.getTime()),
    });

  const open = () =>
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode: 'date',
      onChange: (ev, d) => {
        if (ev.type !== 'set' || !d) return;
        const prev = new Date(value);
        d.setHours(prev.getHours(), prev.getMinutes());
        if (withTime) pickTime(d);
        else onChange(d.getTime());
      },
    });

  return (
    <View style={{ marginBottom: margin }}>
      <Caption upper={false} style={{ marginBottom: 4 }}>
        {label}
      </Caption>
      <Pressable
        onPress={open}
        style={{ backgroundColor: t.inputBackground, borderColor: t.paneBorder, borderWidth: 1, borderRadius: radius, padding: margin }}
      >
        <Text style={{ color: t.text, fontSize: fontSize.detail }}>{format(value, withTime ? 'EEE d MMM yyyy, HH:mm' : 'EEE d MMM yyyy')}</Text>
      </Pressable>
    </View>
  );
}
