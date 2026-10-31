import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Chip, EmptyState, Fab, Row, Segmented } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar, PercentDial } from '../../components/PercentStat';
import { Body, Caption } from '../../components/Typography';
import { formatMoney } from '../../core/currency';
import { collectionRate } from '../../core/invoiceMath';
import { margin, useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { queries } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { CurrencySwitch, useCurrency } from '../shared';

type StatusFilter = 'all' | 'draft' | 'sent' | 'paid';

export function useStatusColor() {
  const t = useTheme();
  return (status: string, overdue: boolean) => (status === 'paid' ? t.ok : overdue ? t.notOk : status === 'sent' ? t.warn : t.caption);
}

export function InvoicesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useTheme();
  const invoices = useQuery(queries.invoices);
  const customers = useQuery(queries.customers);
  const [currency, setCurrency] = useCurrency();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const statusColor = useStatusColor();

  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const rate = useMemo(() => collectionRate(invoices, currency), [invoices, currency]);
  const now = Date.now();
  const inCurrency = invoices.filter((i) => i.currency === currency);
  const overdue = inCurrency.filter((i) => i.status === 'sent' && i.dueDate < now);
  const overdueTotal = overdue.reduce((a, i) => a + i.total, 0);
  const visible = inCurrency.filter((i) => filter === 'all' || i.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        contentContainerStyle={{ padding: margin, paddingBottom: 96 }}
        data={visible}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={
          <>
            <CurrencySwitch value={currency} onChange={setCurrency} />
            {rate.billed > 0 && (
              <Pane title="Collections">
                <Row>
                  <PercentDial percentage={rate.percentage} caption="Collected" color={t.ok} footnote={formatMoney(rate.paid, currency)} />
                  <PercentDial
                    percentage={percentOf(overdueTotal, rate.billed)}
                    caption="Overdue"
                    color={t.notOk}
                    footnote={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`}
                  />
                </Row>
                <PercentBar percentage={100 - rate.percentage} label="still to collect" color={t.warn} footnote={`${formatMoney(rate.outstanding, currency)} of ${formatMoney(rate.billed, currency)} billed`} />
              </Pane>
            )}
            <Segmented options={['all', 'draft', 'sent', 'paid'] as const} value={filter} onChange={setFilter} labels={{ all: 'All', draft: 'Draft', sent: 'Sent', paid: 'Paid' }} />
            <Row>
              <Chip label="Manage customers" onPress={() => nav.navigate('Customers')} />
            </Row>
          </>
        }
        renderItem={({ item }) => {
          const isOverdue = item.status === 'sent' && item.dueDate < now;
          return (
            <Pane onPress={() => nav.navigate('InvoiceDetail', { id: item.id })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{names.get(item.customerId) ?? 'Unknown customer'}</Body>
                  <Caption upper={false}>
                    {item.invoiceNumber} · due {format(item.dueDate, 'd MMM yyyy')}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Body style={{ fontWeight: '600' }}>{formatMoney(item.total, item.currency)}</Body>
                  <Caption style={{ color: statusColor(item.status, isOverdue) }}>{isOverdue ? 'overdue' : item.status}</Caption>
                </View>
              </Row>
            </Pane>
          );
        }}
        ListEmptyComponent={<EmptyState text="No invoices yet. Tap + to create one." />}
      />
      <Fab onPress={() => nav.navigate('InvoiceEdit', {})} />
    </View>
  );
}
