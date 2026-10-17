import { parse } from 'date-fns';
import React, { useLayoutEffect, useMemo } from 'react';
import { Button, EmptyState, Screen } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Highlight } from '../../components/Typography';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { groupSpendingByDay } from '../../core/summaries';
import { CATEGORY_COLORS } from '../../core/theme';
import { ScreenProps } from '../../navigation/RootNavigator';
import { EntryRow, useEntries } from '../shared';
import { dayLabel } from './ExpensesScreen';

export function DayDetailScreen({ route, navigation }: ScreenProps<'DayDetail'>) {
  const { day, currency } = route.params;
  const { entries } = useEntries();
  const group = useMemo(() => groupSpendingByDay(entries, currency).find((g) => g.day === day), [entries, currency, day]);
  const date = parse(day, 'yyyy-MM-dd', new Date());

  useLayoutEffect(() => navigation.setOptions({ title: dayLabel(date) }), [navigation, day]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen>
      {!group ? (
        <EmptyState text="No spending on this day." />
      ) : (
        <>
          <Pane title="Total">
            <Highlight value={formatMoney(group.total, currency)} suffix={`across ${group.entries.length} entries`} />
            {group.byCategory.map((c) => (
              <PercentBar key={c.category} percentage={c.percentage} label={categoryLabel(c.category)} color={CATEGORY_COLORS[c.category]} footnote={formatMoney(c.amount, currency)} />
            ))}
          </Pane>
          <Pane title="Entries">
            {group.entries.map((e) => (
              <EntryRow
                key={`${e.kind}-${e.id}`}
                entry={e}
                onPress={() => (e.kind === 'sms' ? navigation.navigate('TransactionDetail', { id: e.id }) : navigation.navigate('ExpenseEdit', { id: e.id }))}
              />
            ))}
          </Pane>
        </>
      )}
      <Button title="Add expense on this day" variant="secondary" onPress={() => navigation.navigate('ExpenseEdit', { date: date.getTime() + 12 * 3600 * 1000 })} />
    </Screen>
  );
}
