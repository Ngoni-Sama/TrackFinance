import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { EmptyState, Fab, Row, Segmented, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { categoryLabel } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { Entry } from '../../core/summaries';
import { margin, useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { TxType } from '../../sms/parsers/types';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { loadDuplicateGroups } from '../../data/repositories';
import { Body } from '../../components/Typography';
import { CurrencySwitch, EntryRow, useCurrency, useEntries } from '../shared';

type Filter = 'all' | 'out' | 'in' | 'savings' | 'loans';
const FILTERS: Filter[] = ['all', 'out', 'in', 'savings', 'loans'];
const LABELS: Record<Filter, string> = { all: 'All', out: 'Spent', in: 'Received', savings: 'Savings', loans: 'Loans' };

function matches(e: Entry, f: Filter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'out':
    case 'in':
      return e.direction === f;
    case 'savings':
      return e.type === TxType.TransferToSavings || e.type === TxType.TransferFromSavings;
    case 'loans':
      return [TxType.LoanDisbursement, TxType.LoanRepayment, TxType.LoanReminder].includes(e.type as TxType);
  }
}

export function TransactionsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useTheme();
  const { entries, txs } = useEntries();
  const focused = useIsFocused();
  const [dupCount, setDupCount] = useState(0);
  useEffect(() => {
    if (focused) loadDuplicateGroups().then((g) => setDupCount(g.reduce((a, x) => a + x.remove.length, 0))).catch(() => undefined);
  }, [focused, txs.length]);
  const unsorted = useMemo(
    () => new Set(txs.filter((x) => !x.userCategorised && x.category === 'other' && ['debit', 'expense_loan'].includes(x.type)).map((x) => (x.counterparty ?? '').toUpperCase())).size,
    [txs],
  );
  const [currency, setCurrency] = useCurrency();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(
      (e) =>
        e.currency === currency &&
        matches(e, filter) &&
        (!q || e.title.toLowerCase().includes(q) || categoryLabel(e.category).toLowerCase().includes(q) || String(e.amount).includes(q)),
    );
  }, [entries, currency, filter, search]);

  const inTotal = visible.filter((e) => e.direction === 'in').reduce((a, e) => a + e.amount, 0);
  const outTotal = visible.filter((e) => e.direction === 'out').reduce((a, e) => a + e.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        contentContainerStyle={{ padding: margin, paddingBottom: 96 }}
        data={visible}
        keyExtractor={(e) => `${e.kind}-${e.id}`}
        ListHeaderComponent={
          <>
            <CurrencySwitch value={currency} onChange={setCurrency} />
            {dupCount > 0 && (
              <Pane onPress={() => nav.navigate('Duplicates')} style={{ borderColor: t.notOk }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body style={{ flex: 1 }}>{dupCount} duplicate transaction{dupCount === 1 ? '' : 's'} found</Body>
                  <Body style={{ color: t.accent, fontWeight: '600' }}>Review ›</Body>
                </Row>
              </Pane>
            )}
            <Pane onPress={() => nav.navigate('SortOut')}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ flex: 1 }}>
                  {unsorted > 0 ? `Payments to ${unsorted} ${unsorted === 1 ? 'person or merchant need' : 'people or merchants need'} sorting` : 'Sort out and label your payments'}
                </Body>
                <Body style={{ color: t.accent, fontWeight: '600' }}>Sort out ›</Body>
              </Row>
            </Pane>
            <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Merchant, category or amount" />
            <Segmented options={FILTERS} value={filter} onChange={setFilter} labels={LABELS} />
            {(inTotal > 0 || outTotal > 0) && (
              <Pane>
                <PercentBar
                  percentage={percentOf(outTotal, inTotal + outTotal)}
                  label="of money moved was spending"
                  color={t.notOk}
                  footnote={`${formatMoney(outTotal, currency)} out · ${formatMoney(inTotal, currency)} in`}
                />
              </Pane>
            )}
          </>
        }
        renderItem={({ item }) => (
          <View style={{ backgroundColor: t.pane, paddingHorizontal: margin, borderBottomColor: t.paneBorder, borderBottomWidth: 0.5 }}>
            <EntryRow
              entry={item}
              onPress={() => (item.kind === 'sms' ? nav.navigate('TransactionDetail', { id: item.id }) : nav.navigate('ExpenseEdit', { id: item.id }))}
            />
          </View>
        )}
        ListEmptyComponent={<EmptyState text="No transactions match." />}
      />
      <Fab onPress={() => nav.navigate('ExpenseEdit', {})} />
    </View>
  );
}
