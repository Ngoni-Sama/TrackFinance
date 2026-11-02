import { format } from 'date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { buildSnapshot, explainPayments, isAssistantConfigured, merchantHistory, Suggestion } from '../../ai/assistant';
import { Button, CategoryPicker, EmptyState, Row, Screen, TextField } from '../../components/Controls';
import { MerchantAvatar } from '../../components/MerchantAvatar';
import { Pane, Separator } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Body, Caption, Highlight } from '../../components/Typography';
import { CATEGORIES, categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { normaliseMerchant } from '../../core/categorise';
import { detectRecurring, forecastMonth } from '../../core/insights';
import { useSettingsStore } from '../../core/settingsStore';
import { Entry } from '../../core/summaries';
import { margin, radius, useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { find, recategoriseTransaction } from '../../data/repositories';
import { ScreenProps } from '../../navigation/RootNavigator';
import { useEntries, useUserLabels } from '../shared';

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

interface Group {
  key: string;
  title: string;
  latest: Entry;
  entries: Entry[];
  total: number;
}

/**
 * "Sort out": one person or merchant at a time, the user says what the
 * payments were for. Their answers become labels the AI learns from.
 */
export function SortOutScreen({ navigation }: ScreenProps<'SortOut'>) {
  const t = useTheme();
  const aiOn = useSettingsStore((s) => s.aiEnabled) && isAssistantConfigured;
  const { entries, txs, smsById } = useEntries();
  const { labelled, merchantMemory } = useUserLabels();
  const userSorted = useMemo(() => new Set(txs.filter((x) => x.userCategorised).map((x) => x.id)), [txs]);

  // Outgoing SMS payments the user hasn't sorted, grouped by who was paid. Unclear ("other") first.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const e of entries) {
      if (e.kind !== 'sms' || e.direction !== 'out' || userSorted.has(e.id)) continue;
      const key = `${normaliseMerchant(e.title)}|${e.currency}`;
      const g = map.get(key) ?? { key, title: e.title, latest: e, entries: [], total: 0 };
      g.entries.push(e);
      g.total += e.amount;
      if (e.occurredAt > g.latest.occurredAt) g.latest = e;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => Number(b.latest.category === 'other') - Number(a.latest.category === 'other') || b.total - a.total);
  }, [entries, userSorted]);

  const [startCount] = useState(() => ({ value: 0 }));
  if (!startCount.value && groups.length) startCount.value = groups.length;
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const queue = groups.filter((g) => !skipped.has(g.key));
  const current = queue[0];

  const [category, setCategory] = useState('other');
  const [note, setNote] = useState('');
  const [rememberAll, setRememberAll] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Map<string, Suggestion>>(new Map());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const suggestion = current ? suggestions.get(current.latest.id) : undefined;

  useEffect(() => {
    if (!current) return;
    setCategory(suggestion && suggestion.confidence !== 'low' ? suggestion.category : current.latest.category);
    setNote('');
    setRememberAll(true);
  }, [current?.key, suggestion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask the AI about the next 8 people/merchants in one go, so the user isn't waiting on every card.
  const askAi = async () => {
    const batch = queue.slice(0, 8).map((g) => g.latest.id).filter((id) => !suggestions.has(id));
    if (!batch.length) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const recurring = detectRecurring(entries);
      const currency = current?.latest.currency ?? 'USD';
      const ctx = buildSnapshot({
        currency, entries, smsById, recurring, upcoming: [], forecast: forecastMonth(entries, recurring, currency),
        budgets: [], loan: null, savings: null, goal: { target: 1_000_000, current: 0, monthlySaving: 0, annualReturn: 8 },
        toExplain: batch, labelled, merchantMemory,
      });
      const res = await explainPayments(ctx);
      setSuggestions((m) => {
        const next = new Map(m);
        res.forEach((r) => next.set(r.id, r));
        return next;
      });
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => {
    if (aiOn && current && !suggestions.has(current.latest.id) && !aiBusy && !aiError) askAi();
  }, [aiOn, current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const tx = await find.transaction(current.latest.id);
      await recategoriseTransaction(tx, category, { remember: rememberAll, note });
      if (rememberAll) {
        // Also mark the rest of this group as sorted by the user.
        for (const e of current.entries.filter((x) => x.id !== tx.id)) {
          const other = await find.transaction(e.id).catch(() => null);
          if (other) await recategoriseTransaction(other, category, { remember: false });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const total = Math.max(startCount.value, groups.length);
  const done = total - groups.length;

  if (!current) {
    return (
      <Screen>
        <EmptyState text={groups.length ? 'You skipped the rest. Come back to them any time.' : 'All sorted. Every payment has a category you chose.'} />
        <Button title="Done" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  const history = merchantHistory(entries, current.title);
  const sms = smsById.get(current.latest.id);

  return (
    <Screen>
      <Pane>
        <PercentBar percentage={percentOf(done, total)} label="sorted" footnote={`${done} of ${total} people and merchants · ${queue.length} left`} />
      </Pane>

      <Pane>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ marginRight: margin }}>
            <MerchantAvatar name={current.title} category={category} size={48} />
          </View>
          <View style={{ flex: 1 }}>
            <Highlight value={current.title} size="detail" />
            <Caption upper={false}>
              {current.entries.length} payment{current.entries.length === 1 ? '' : 's'} · {formatMoney(current.total, current.latest.currency)} total
              {history?.usual_day_of_month ? ` · usually around the ${ordinal(history.usual_day_of_month)}` : ''}
            </Caption>
            <Caption upper={false}>
              Latest {formatMoney(current.latest.amount, current.latest.currency)} on {format(current.latest.occurredAt, 'EEE d MMM, HH:mm')}
            </Caption>
          </View>
        </Row>
        {sms ? (
          <View style={{ backgroundColor: t.inputBackground, borderRadius: radius, padding: margin, marginTop: margin }}>
            <Body muted>{sms}</Body>
          </View>
        ) : null}

        {aiOn && (
          <View style={{ marginTop: margin }}>
            {aiBusy && !suggestion ? (
              <Row>
                <ActivityIndicator color={t.accent} />
                <Caption upper={false} style={{ marginLeft: margin / 2 }}>
                  Asking the AI coach…
                </Caption>
              </Row>
            ) : suggestion ? (
              <View style={{ borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: margin }}>
                <Caption>AI guess · {suggestion.confidence} confidence</Caption>
                <Body>
                  <Body style={{ fontWeight: '600' }}>{categoryLabel(suggestion.category)}</Body> — {suggestion.reason}
                </Body>
                {suggestion.question ? <Body style={{ color: t.accent, marginTop: 4 }}>{suggestion.question}</Body> : null}
              </View>
            ) : aiError ? (
              <Pressable onPress={askAi}>
                <Caption upper={false} style={{ color: t.notOk }}>
                  {aiError} · Tap to retry
                </Caption>
              </Pressable>
            ) : null}
          </View>
        )}
      </Pane>

      <Pane title="What was it for?">
        <CategoryPicker value={category} onChange={setCategory} categories={CATEGORIES} />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. rent for the Avondale flat, school fees for Tafadzwa" />
        <Separator />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: margin }}>
            <Body>All payments to {current.title}</Body>
            <Caption upper={false}>Files the {current.entries.length > 1 ? `other ${current.entries.length - 1} and ` : ''}future payments the same way</Caption>
          </View>
          <Switch value={rememberAll} onValueChange={setRememberAll} trackColor={{ true: t.accent, false: t.progressEmpty }} />
        </Row>
      </Pane>

      <Button title="Save & next" onPress={save} loading={saving} />
      <Button title="Skip" variant="secondary" onPress={() => setSkipped((s) => new Set(s).add(current.key))} disabled={saving} />
    </Screen>
  );
}
