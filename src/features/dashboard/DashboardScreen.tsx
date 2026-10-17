import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { Button, EmptyState, Row, Screen } from '../../components/Controls';
import { Pane, Separator } from '../../components/Pane';
import { PercentBar, PercentDial } from '../../components/PercentStat';
import { Body, Caption, Highlight } from '../../components/Typography';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { budgetUsage, dashboardSummary, pendingLoan, savingsBalance } from '../../core/summaries';
import { CATEGORY_COLORS, margin, useTheme } from '../../core/theme';
import { formatPercent } from '../../core/utils';
import { queries } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { useSettingsStore } from '../../core/settingsStore';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { CurrencySwitch, EntryRow, useCurrency, useEntries } from '../shared';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const t = useTheme();
  const [currency, setCurrency] = useCurrency();
  const { entries, txs } = useEntries();
  const budgets = useQuery(queries.budgets);
  const smsEnabled = useSettingsStore((s) => s.smsEnabled);

  const s = useMemo(() => dashboardSummary(entries, currency), [entries, currency]);
  const loan = useMemo(() => pendingLoan(txs), [txs]);
  const savings = useMemo(() => savingsBalance(txs), [txs]);
  const usage = useMemo(
    () => budgetUsage(budgets.filter((b) => b.currency === currency).map((b) => ({ category: b.category, amount: b.amount, currency: b.currency })), entries),
    [budgets, entries, currency],
  );

  const change = s.monthChangePct;
  // Spending less than last month is good (green), more is bad (red).
  const changeColor = change == null ? t.caption : change > 0 ? t.notOk : t.ok;
  // Burning income faster than the month is passing is the warning sign.
  const burnColor = s.spentOfIncomePct > s.monthElapsedPct + 10 ? t.notOk : s.spentOfIncomePct > s.monthElapsedPct ? t.warn : t.ok;

  return (
    <Screen>
      <CurrencySwitch value={currency} onChange={setCurrency} />

      {!smsEnabled && (
        <Pane title="Track mobile money automatically">
          <Body muted>Turn on SMS tracking to log EcoCash, OneMoney, Kashagi, Omari and bank transactions as they arrive.</Body>
          <Button title="Set up SMS tracking" variant="secondary" onPress={() => nav.navigate('SmsSetup')} />
        </Pane>
      )}

      <Pane title="Spending">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Caption>Today</Caption>
            <Highlight value={formatMoney(s.todaySpend, currency)} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Caption>This month</Caption>
            <Highlight value={formatMoney(s.monthSpend, currency)} />
            <Caption upper={false} style={{ color: changeColor }}>
              {change == null ? 'no spending last month to compare' : `${change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(change))} vs same point last month`}
            </Caption>
          </View>
        </Row>
        <Separator />
        <Row>
          <PercentDial percentage={s.spentOfIncomePct} caption="Income spent" color={burnColor} footnote={`${formatMoney(s.monthIncome, currency)} in`} />
          <PercentDial percentage={s.monthElapsedPct} caption="Month elapsed" footnote={`day ${new Date().getDate()}`} />
        </Row>
      </Pane>

      <Pane title="Income this month">
        <Highlight value={formatMoney(s.monthIncome, currency)} suffix="received incl. loans" color={t.ok} />
      </Pane>

      {loan && (
        <Pane title="Kashagi loan">
          <Highlight value={formatMoney(loan.outstanding, loan.currency)} suffix="outstanding" color={t.notOk} />
          {loan.repaidPct != null && (
            <PercentBar
              percentage={loan.repaidPct}
              label="repaid"
              color={t.ok}
              footnote={loan.dueAt ? `due ${format(loan.dueAt, 'd MMM yyyy')}` : undefined}
            />
          )}
          {loan.repaidPct == null && loan.dueAt ? <Caption upper={false}>due {format(loan.dueAt, 'd MMM yyyy')}</Caption> : null}
        </Pane>
      )}

      {savings && (
        <Pane title="Omari savings">
          <Highlight value={formatMoney(savings.balance, savings.currency)} suffix="latest balance" />
        </Pane>
      )}

      <Pane title="Where it went" right={<Caption upper={false}>this month</Caption>}>
        {s.categories.length === 0 ? (
          <EmptyState text="No spending recorded this month." />
        ) : (
          <>
            <View style={{ alignItems: 'center', marginBottom: margin }}>
              <PieChart
                donut
                radius={80}
                innerRadius={52}
                innerCircleColor={t.pane}
                data={s.categories.map((c) => ({ value: c.amount, color: CATEGORY_COLORS[c.category] ?? t.caption }))}
                centerLabelComponent={() => <Caption>{formatMoney(s.monthSpend, currency)}</Caption>}
              />
            </View>
            {s.categories.map((c) => (
              <PercentBar
                key={c.category}
                percentage={c.percentage}
                label={categoryLabel(c.category)}
                color={CATEGORY_COLORS[c.category]}
                footnote={formatMoney(c.amount, currency)}
              />
            ))}
          </>
        )}
      </Pane>

      <Pane title="Budgets" right={<Caption upper={false} style={{ color: t.accent }} >{usage.length ? 'edit' : 'set up'}</Caption>} onPress={() => nav.navigate('Budgets')}>
        {usage.length === 0 ? (
          <Body muted>Set a monthly limit per category to see how much of it you have used.</Body>
        ) : (
          usage.map((u) => (
            <PercentBar
              key={u.category}
              percentage={u.percentage}
              label={`of ${categoryLabel(u.category)} budget`}
              color={u.over ? t.notOk : u.percentage > 80 ? t.warn : t.ok}
              footnote={`${formatMoney(u.spent, currency)} of ${formatMoney(u.amount, currency)}${u.over ? ' — over budget' : ''}`}
            />
          ))
        )}
      </Pane>

      <Pane title="6-month trend">
        <BarChart
          data={s.monthlyTrend.flatMap((m) => [
            { value: m.spend, frontColor: t.notOk, spacing: 2, label: m.label, labelTextStyle: { color: t.caption, fontSize: 10 } },
            { value: m.income, frontColor: t.ok },
          ])}
          barWidth={12}
          spacing={18}
          noOfSections={4}
          yAxisTextStyle={{ color: t.caption, fontSize: 10 }}
          xAxisColor={t.separator}
          yAxisColor={t.separator}
          rulesColor={t.separator}
          height={160}
          isAnimated
        />
        <Row style={{ marginTop: margin }}>
          <View style={{ width: 10, height: 10, backgroundColor: t.notOk, marginRight: 4 }} />
          <Caption upper={false}>Spent   </Caption>
          <View style={{ width: 10, height: 10, backgroundColor: t.ok, marginRight: 4 }} />
          <Caption upper={false}>Received</Caption>
        </Row>
      </Pane>

      <Pane title="Recent">
        {entries.length === 0 ? (
          <EmptyState text="Nothing yet. Add an expense or turn on SMS tracking." />
        ) : (
          entries.slice(0, 5).map((e) => (
            <EntryRow
              key={`${e.kind}-${e.id}`}
              entry={e}
              onPress={() => (e.kind === 'sms' ? nav.navigate('TransactionDetail', { id: e.id }) : nav.navigate('ExpenseEdit', { id: e.id }))}
            />
          ))
        )}
      </Pane>
    </Screen>
  );
}
