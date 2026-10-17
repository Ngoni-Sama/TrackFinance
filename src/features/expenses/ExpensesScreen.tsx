import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, isToday, isYesterday } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Chip, EmptyState, Fab, Segmented } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Caption, Highlight } from '../../components/Typography';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { groupSpendingByDay } from '../../core/summaries';
import { CATEGORY_COLORS, margin, useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { CurrencySwitch, useCurrency, useEntries } from '../shared';

type Span = 'day' | 'week' | 'month';
const SPANS: Span[] = ['day', 'week', 'month'];
const SPAN_LABELS: Record<Span, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

export function dayLabel(d: Date) {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE d MMM');
}

export function ExpensesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useTheme();
  const { entries } = useEntries();
  const [currency, setCurrency] = useCurrency();
  const [span, setSpan] = useState<Span>('day');

  const days = useMemo(() => groupSpendingByDay(entries, currency), [entries, currency]);

  /** Roll days up into weeks/months for the summary toggle. */
  const groups = useMemo(() => {
    if (span === 'day') return days.map((d) => ({ key: d.day, label: dayLabel(d.date), total: d.total, cats: d.byCategory, day: d.day }));
    const fmt = span === 'week' ? "'Week of' d MMM" : 'MMMM yyyy';
    const keyFmt = span === 'week' ? 'RRRR-II' : 'yyyy-MM';
    const map = new Map<string, { label: string; total: number; cats: Map<string, number> }>();
    for (const d of days) {
      const key = format(d.date, keyFmt);
      const g = map.get(key) ?? { label: format(d.date, fmt), total: 0, cats: new Map() };
      g.total += d.total;
      for (const c of d.byCategory) g.cats.set(c.category, (g.cats.get(c.category) ?? 0) + c.amount);
      g.label = format(d.date, fmt); // days are newest-first, so this ends on the earliest day of the span
      map.set(key, g);
    }
    return [...map.entries()].map(([key, g]) => ({
      key,
      label: g.label,
      total: g.total,
      day: undefined as string | undefined,
      cats: [...g.cats.entries()]
        .map(([category, amount]) => ({ category, amount, percentage: percentOf(amount, g.total) }))
        .sort((a, b) => b.amount - a.amount),
    }));
  }, [days, span]);

  const maxTotal = Math.max(1, ...groups.map((g) => g.total));

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        contentContainerStyle={{ padding: margin, paddingBottom: 96 }}
        data={groups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={
          <>
            <CurrencySwitch value={currency} onChange={setCurrency} />
            <Segmented options={SPANS} value={span} onChange={setSpan} labels={SPAN_LABELS} />
          </>
        }
        renderItem={({ item }) => (
          <Pane
            title={item.label}
            right={<Highlight value={formatMoney(item.total, currency)} size="detail" />}
            onPress={item.day ? () => nav.navigate('DayDetail', { day: item.day!, currency }) : undefined}
          >
            <PercentBar percentage={percentOf(item.total, maxTotal)} label={`of your biggest ${span}`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: margin / 2 }}>
              {item.cats.map((c) => (
                <Chip
                  key={c.category}
                  color={CATEGORY_COLORS[c.category]}
                  label={`${categoryLabel(c.category)} ${Math.round(c.percentage)}%`}
                />
              ))}
            </View>
            {item.day ? <Caption upper={false}>Tap to see and edit entries</Caption> : null}
          </Pane>
        )}
        ListEmptyComponent={<EmptyState text="No spending yet. Tap + to log an expense." />}
      />
      <Fab onPress={() => nav.navigate('ExpenseEdit', {})} />
    </View>
  );
}
