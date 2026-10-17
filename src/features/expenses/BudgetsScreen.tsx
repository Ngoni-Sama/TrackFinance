import React, { useEffect, useMemo, useState } from 'react';
import { Button, Screen, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Body } from '../../components/Typography';
import { categoryLabel, CATEGORIES } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { budgetUsage } from '../../core/summaries';
import { CATEGORY_COLORS, useTheme } from '../../core/theme';
import { queries, setBudget } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';
import { CurrencySwitch, useCurrency, useEntries } from '../shared';

const SPENDING_CATEGORIES = CATEGORIES.filter((c) => c !== 'savings');

export function BudgetsScreen({ navigation }: ScreenProps<'Budgets'>) {
  const t = useTheme();
  const [currency, setCurrency] = useCurrency();
  const budgets = useQuery(queries.budgets);
  const { entries } = useEntries();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const d: Record<string, string> = {};
    for (const b of budgets) if (b.currency === currency) d[b.category] = String(b.amount);
    setDraft(d);
  }, [budgets, currency]);

  const usage = useMemo(
    () =>
      new Map(
        budgetUsage(
          budgets.filter((b) => b.currency === currency).map((b) => ({ category: b.category, amount: b.amount, currency: b.currency })),
          entries,
        ).map((u) => [u.category, u]),
      ),
    [budgets, entries, currency],
  );

  const onSave = async () => {
    for (const c of SPENDING_CATEGORIES) {
      const v = parseFloat((draft[c] ?? '').replace(/,/g, ''));
      await setBudget(c, currency, Number.isFinite(v) ? v : null);
    }
    navigation.goBack();
  };

  return (
    <Screen>
      <CurrencySwitch value={currency} onChange={setCurrency} />
      <Body muted>Leave a category blank for no limit. Usage resets on the 1st of each month.</Body>
      {SPENDING_CATEGORIES.map((c) => {
        const u = usage.get(c);
        return (
          <Pane key={c}>
            <TextField
              label={`${categoryLabel(c)} — monthly limit`}
              value={draft[c] ?? ''}
              onChangeText={(v) => setDraft((d) => ({ ...d, [c]: v }))}
              keyboardType="decimal-pad"
              placeholder="No limit"
            />
            {u && (
              <PercentBar
                percentage={u.percentage}
                label="used this month"
                color={u.over ? t.notOk : u.percentage > 80 ? t.warn : CATEGORY_COLORS[c]}
                footnote={`${formatMoney(u.spent, currency)} of ${formatMoney(u.amount, currency)}`}
              />
            )}
          </Pane>
        );
      })}
      <Button title="Save budgets" onPress={onSave} />
    </Screen>
  );
}
