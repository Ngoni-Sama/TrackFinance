import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { EmptyState, Row, Screen, TextField } from '../../components/Controls';
import { MerchantAvatar } from '../../components/MerchantAvatar';
import { Pane, Separator } from '../../components/Pane';
import { PercentBar, PercentDial } from '../../components/PercentStat';
import { Body, Caption, Highlight } from '../../components/Typography';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import {
  averageMonthlySaving,
  detectRecurring,
  forecastMonth,
  planGoal,
  Upcoming,
  upcomingPayments,
} from '../../core/insights';
import { budgetUsage, pendingLoan, savingsBalance, sumEntries } from '../../core/summaries';
import { margin, useTheme } from '../../core/theme';
import { formatPercent, percentOf } from '../../core/utils';
import { DEFAULT_GOAL, goalInput, loadGoal, saveGoal, StoredGoal } from '../../data/goal';
import { queries } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { buildSnapshot } from '../../ai/assistant';
import { CurrencySwitch, useCurrency, useEntries, useUserLabels } from '../shared';
import { AiCoach } from './AiCoach';

const CADENCE_LABEL = { weekly: 'every week', fortnightly: 'every 2 weeks', monthly: 'every month' } as const;
const num = (s: string) => {
  const n = parseFloat(s.replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function CoachScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [currency, setCurrency] = useCurrency();
  const { entries, txs, smsById } = useEntries();
  const budgets = useQuery(queries.budgets);
  const invoices = useQuery(queries.invoices);
  const [goal, setGoal] = useState<StoredGoal>(DEFAULT_GOAL);
  const [goalDraft, setGoalDraft] = useState({ target: '', otherAssets: '', annualReturn: '' });

  useEffect(() => {
    loadGoal().then((g) => {
      setGoal(g);
      setGoalDraft({ target: String(g.target), otherAssets: String(g.otherAssets), annualReturn: String(g.annualReturn) });
    });
  }, []);

  const now = new Date();
  const recurring = useMemo(() => detectRecurring(entries).filter((r) => r.currency === currency), [entries, currency]);
  const forecast = useMemo(() => forecastMonth(entries, recurring, currency), [entries, recurring, currency]);
  const loan = useMemo(() => pendingLoan(txs), [txs]);
  const savings = useMemo(() => savingsBalance(txs), [txs]);

  const upcoming = useMemo(() => {
    const extras: Upcoming[] = [];
    if (loan?.dueAt && loan.currency === currency) extras.push({ title: 'Kashagi loan', amount: loan.outstanding, currency, dueAt: loan.dueAt, kind: 'loan', category: 'loan_repayment' });
    return upcomingPayments(recurring, extras);
  }, [recurring, loan, currency]);

  const owedToYou = invoices.filter((i) => i.status === 'sent' && i.currency === currency);
  const avgIncome = useMemo(
    () => [1, 2, 3].reduce((a, i) => a + sumEntries(entries, 'in', currency, startOfMonth(subMonths(now, i)), endOfMonth(subMonths(now, i))), 0) / 3,
    [entries, currency], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const monthlySaving = useMemo(() => averageMonthlySaving(entries, currency), [entries, currency]);
  const gInput = goalInput(goal, savings?.currency === currency ? savings.balance : 0, monthlySaving);
  const plan = planGoal(gInput);

  const recurringTotal = recurring.reduce((a, r) => a + r.monthlyCost, 0);
  const upcomingTotal = upcoming.reduce((a, u) => a + u.amount, 0);
  const burnColor = forecast.projectedOfIncomePct > 100 ? t.notOk : forecast.projectedOfIncomePct > 85 ? t.warn : t.ok;

  const usage = useMemo(
    () => budgetUsage(budgets.filter((b) => b.currency === currency).map((b) => ({ category: b.category, amount: b.amount, currency: b.currency })), entries),
    [budgets, entries, currency],
  );

  // One per merchant/person (the newest): applying a category files all their payments.
  const unclearPayments = useMemo(() => {
    const seen = new Set<string>();
    return entries
      .filter((e) => e.kind === 'sms' && e.direction === 'out' && e.category === 'other' && e.currency === currency)
      .filter((e) => !seen.has(e.title) && !!seen.add(e.title))
      .slice(0, 20);
  }, [entries, currency]);

  const { labelled, merchantMemory } = useUserLabels();
  const snapshot = () =>
    buildSnapshot({ currency, entries, smsById, recurring, upcoming, forecast, budgets: usage, loan, savings, goal: gInput, labelled, merchantMemory });

  const commitGoal = () => {
    const next = { target: num(goalDraft.target) || DEFAULT_GOAL.target, otherAssets: num(goalDraft.otherAssets), annualReturn: num(goalDraft.annualReturn) };
    setGoal(next);
    saveGoal(next);
  };

  const years = plan.monthsToGoal == null ? null : plan.monthsToGoal / 12;
  const need20 = plan.neededPerMonth(20);

  return (
    <Screen>
      <CurrencySwitch value={currency} onChange={setCurrency} />

      <Pane title="Month-end forecast" right={<Caption upper={false}>{format(now, 'MMMM')}</Caption>}>
        <Highlight value={formatMoney(forecast.projected, currency)} suffix="expected spending this month" color={burnColor} />
        <Caption upper={false} style={{ marginTop: 4 }}>
          {formatMoney(forecast.spentSoFar, currency)} so far + {formatMoney(forecast.dailyRate, currency)}/day day-to-day + {formatMoney(forecast.upcomingBills, currency)} bills still due
        </Caption>
        <Separator />
        <Row>
          <PercentDial
            showOverflow
            percentage={forecast.projectedOfIncomePct}
            caption="Income used by month end"
            color={burnColor}
            footnote={forecast.income ? `${formatMoney(forecast.income, currency)} in` : 'no income yet'}
          />
          <PercentDial
            showOverflow
            percentage={forecast.typicalMonth > 0 ? (forecast.projected / forecast.typicalMonth) * 100 : 0}
            color={forecast.projected > forecast.typicalMonth * 1.1 ? t.notOk : t.accent}
            caption="Of a typical month"
            footnote={`typical ${formatMoney(forecast.typicalMonth, currency)}`}
          />
        </Row>
      </Pane>

      <Pane title="Coming up" right={<Caption upper={false}>next 31 days</Caption>}>
        {upcoming.length === 0 ? (
          <EmptyState text="No regular payments spotted yet. They appear after the same payment shows up twice on a schedule." />
        ) : (
          <>
            <PercentBar
              percentage={percentOf(upcomingTotal, avgIncome)}
              label="of a usual month's income already spoken for"
              color={percentOf(upcomingTotal, avgIncome) > 60 ? t.notOk : t.accent}
              footnote={`${formatMoney(upcomingTotal, currency)} expected · usual income ${formatMoney(avgIncome, currency)}`}
            />
            {upcoming.slice(0, 12).map((u, i) => (
              <Row key={`${u.title}-${u.dueAt}-${i}`} style={{ paddingVertical: 6 }}>
                <View style={{ marginRight: margin }}>
                  <MerchantAvatar name={u.title} category={u.category} size={32} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{u.title}</Body>
                  <Caption upper={false}>
                    {format(u.dueAt, 'EEE d MMM')}
                    {u.kind === 'loan' ? ' · loan due' : u.confidence != null ? ` · ${u.confidence}% sure` : ''}
                  </Caption>
                </View>
                <Body style={{ fontWeight: '600' }}>{formatMoney(u.amount, u.currency)}</Body>
              </Row>
            ))}
          </>
        )}
        {owedToYou.length > 0 && (
          <Pressable onPress={() => nav.navigate('Tabs')}>
            <Caption upper={false} style={{ marginTop: margin, color: t.ok }}>
              + {formatMoney(owedToYou.reduce((a, i) => a + i.total, 0), currency)} owed to you on {owedToYou.length} sent invoice{owedToYou.length === 1 ? '' : 's'}
            </Caption>
          </Pressable>
        )}
      </Pane>

      <Pane title="Recurring payments" right={<Caption upper={false}>{formatMoney(recurringTotal, currency)}/month</Caption>}>
        {recurring.length === 0 ? (
          <Body muted>Subscriptions, rent, school fees and regular top-ups show up here once they repeat.</Body>
        ) : (
          <>
            <PercentBar
              percentage={percentOf(recurringTotal, avgIncome)}
              label="of income goes on fixed costs"
              color={t.warn}
              footnote={`${formatMoney(recurringTotal * 12, currency)} a year`}
            />
            {recurring.map((r) => (
              <Row key={r.key} style={{ paddingVertical: 6 }}>
                <View style={{ marginRight: margin }}>
                  <MerchantAvatar name={r.merchant} category={r.category} size={32} />
                </View>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{r.merchant}</Body>
                  <Caption upper={false}>
                    {categoryLabel(r.category)} · {formatMoney(r.averageAmount, currency)} {CADENCE_LABEL[r.cadence]} · next {format(r.nextAt, 'd MMM')}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Body style={{ fontWeight: '600' }}>{formatMoney(r.monthlyCost, currency)}</Body>
                  <Caption upper={false}>{formatPercent(percentOf(r.monthlyCost, avgIncome))} of income</Caption>
                </View>
              </Row>
            ))}
          </>
        )}
      </Pane>

      <Pane title="Millionaire plan">
        <Row style={{ alignItems: 'flex-start' }}>
          <PercentDial percentage={plan.progressPct} caption={`To ${formatMoney(goal.target, currency)}`} color={t.ok} precision={plan.progressPct < 1 ? 2 : 0} footnote={`${formatMoney(gInput.current, currency)} now`} />
          <View style={{ flex: 1.3, paddingTop: margin }}>
            <Caption>At your current pace</Caption>
            <Highlight
              value={years == null ? 'Not yet' : years < 1 ? `${Math.round(years * 12)} months` : `${years.toFixed(1)} years`}
              color={years == null || years > 30 ? t.notOk : t.text}
            />
            <Caption upper={false}>
              saving {formatMoney(Math.max(0, monthlySaving), currency)}/month (3-month average) at {goal.annualReturn}% a year
            </Caption>
          </View>
        </Row>
        <PercentBar
          percentage={percentOf(Math.max(0, monthlySaving), need20)}
          label="of what you'd need to save to get there in 20 years"
          color={t.ok}
          footnote={`${formatMoney(need20, currency)}/month for 20 years · ${formatMoney(plan.neededPerMonth(10), currency)}/month for 10 years`}
        />
        <Separator />
        <TextField label="Goal" value={goalDraft.target} onChangeText={(v) => setGoalDraft((d) => ({ ...d, target: v }))} keyboardType="decimal-pad" />
        <TextField
          label="Savings & investments not in your SMS (cash, land, shares…)"
          value={goalDraft.otherAssets}
          onChangeText={(v) => setGoalDraft((d) => ({ ...d, otherAssets: v }))}
          keyboardType="decimal-pad"
        />
        <TextField label="Expected yearly return (%)" value={goalDraft.annualReturn} onChangeText={(v) => setGoalDraft((d) => ({ ...d, annualReturn: v }))} keyboardType="decimal-pad" />
        <Pressable onPress={commitGoal}>
          <Body style={{ color: t.accent, fontWeight: '600' }}>Update plan</Body>
        </Pressable>
      </Pane>

      <AiCoach
        snapshot={snapshot}
        unclear={unclearPayments}
        onSortOut={() => nav.navigate('SortOut')}
        onProvider={() => nav.navigate('AiProvider')}
      />
    </Screen>
  );
}
