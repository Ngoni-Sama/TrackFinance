import { format } from 'date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Row, Segmented } from '../components/Controls';
import { MerchantAvatar } from '../components/MerchantAvatar';
import { Body, Caption } from '../components/Typography';
import { categoryLabel, CURRENCIES } from '../core/constants';
import { formatMoney } from '../core/currency';
import { Entry, toEntries } from '../core/summaries';
import { margin, useTheme } from '../core/theme';
import { expenseToPlain, queries, txToPlain } from '../data/repositories';
import { useQuery } from '../data/useObservable';

/** All transactions + manual expenses as display entries, live. */
export function useEntries() {
  const txs = useQuery(queries.transactions);
  const exps = useQuery(queries.expenses);
  const plainTxs = useMemo(() => txs.map(txToPlain), [txs]);
  const entries = useMemo(() => toEntries(plainTxs, exps.map(expenseToPlain)), [plainTxs, exps]);
  const smsById = useMemo(() => new Map(txs.map((t) => [t.id, t.rawBody])), [txs]);
  return { entries, txs: plainTxs, smsById };
}

/** Selected display currency, defaulting to the business profile's currency. */
export function useCurrency(): [string, (c: string) => void] {
  const profile = useQuery(queries.profile)[0];
  const [currency, setCurrency] = useState<string | null>(null);
  useEffect(() => {
    if (currency == null && profile) setCurrency(profile.defaultCurrency);
  }, [profile, currency]);
  return [currency ?? 'USD', setCurrency];
}

export function CurrencySwitch({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return <Segmented options={CURRENCIES} value={value as (typeof CURRENCIES)[number]} onChange={onChange} />;
}

export function EntryRow({ entry, onPress }: { entry: Entry; onPress?: () => void }) {
  const t = useTheme();
  const color = entry.direction === 'in' ? t.ok : entry.direction === 'out' ? t.text : t.caption;
  const sign = entry.direction === 'in' ? '+' : entry.direction === 'out' ? '-' : '';
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Row style={{ paddingVertical: margin * 0.8 }}>
        <View style={{ marginRight: margin }}>
          <MerchantAvatar name={entry.title} category={entry.category} />
        </View>
        <View style={{ flex: 1 }}>
          <Body numberOfLines={1}>{entry.title}</Body>
          <Caption upper={false}>
            {categoryLabel(entry.category)} · {format(entry.occurredAt, 'd MMM, HH:mm')} · {entry.kind === 'sms' ? 'SMS' : 'Manual'}
          </Caption>
        </View>
        <Body style={{ color, fontWeight: '600' }}>
          {sign}
          {formatMoney(entry.amount, entry.currency)}
        </Body>
      </Row>
    </Pressable>
  );
}
