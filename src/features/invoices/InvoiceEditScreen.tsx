import { addDays } from 'date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, Chip, Row, Screen, Segmented, TextField } from '../../components/Controls';
import { DateField } from '../../components/DateField';
import { Pane, Separator } from '../../components/Pane';
import { Body, Caption, Highlight } from '../../components/Typography';
import { CURRENCIES } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { computeInvoiceTotals } from '../../core/invoiceMath';
import { margin, useTheme } from '../../core/theme';
import { Invoice } from '../../data/db';
import { find, getProfile, queries, saveInvoice } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';

interface DraftLine {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

let lineKey = 0;
const blankLine = (): DraftLine => ({ key: ++lineKey, description: '', quantity: '1', unitPrice: '' });
const num = (s: string) => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function InvoiceEditScreen({ route, navigation }: ScreenProps<'InvoiceEdit'>) {
  const t = useTheme();
  const id = route.params?.id;
  const customers = useQuery(queries.customers);
  const [existing, setExisting] = useState<Invoice>();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(Date.now());
  const [dueDate, setDueDate] = useState(addDays(new Date(), 14).getTime());
  const [currency, setCurrency] = useState<string>('USD');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) {
        const inv = await find.invoice(id);
        const items = await queries.invoiceItems(id).fetch();
        setExisting(inv);
        setCustomerId(inv.customerId);
        setIssueDate(inv.issueDate);
        setDueDate(inv.dueDate);
        setCurrency(inv.currency);
        setTaxRate(String(inv.taxRate));
        setNotes(inv.notes ?? '');
        setLines(items.map((i) => ({ key: ++lineKey, description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })));
        navigation.setOptions({ title: `Edit ${inv.invoiceNumber}` });
      } else {
        const p = await getProfile();
        if (p) {
          setCurrency(p.defaultCurrency);
          setTaxRate(String(p.taxRate));
        }
      }
    })();
  }, [id, navigation]);

  // A customer just created from here is the newest one: select it automatically.
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  useEffect(() => {
    if (customerCount != null && customers.length > customerCount) {
      const newest = [...customers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      setCustomerId(newest.id);
    }
    setCustomerCount(customers.length);
  }, [customers]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () => computeInvoiceTotals(lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice) })), num(taxRate)),
    [lines, taxRate],
  );

  const updateLine = (key: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onSave = async () => {
    if (!customerId) return Alert.alert('Pick a customer');
    if (dueDate < issueDate) return Alert.alert('Due date is before the issue date');
    setSaving(true);
    try {
      const inv = await saveInvoice(
        {
          customerId,
          issueDate,
          dueDate,
          currency,
          taxRate: num(taxRate),
          notes,
          items: lines.map((l) => ({ description: l.description.trim(), quantity: num(l.quantity), unitPrice: num(l.unitPrice) })),
        },
        existing,
      );
      navigation.replace('InvoiceDetail', { id: inv.id });
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Pane title="Bill to">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {customers.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === customerId} onPress={() => setCustomerId(c.id)} />
          ))}
          <Chip label="+ New customer" onPress={() => navigation.navigate('CustomerEdit', {})} />
        </View>
      </Pane>

      <Pane title="Details">
        <DateField label="Issue date" value={issueDate} onChange={setIssueDate} />
        <DateField label="Due date" value={dueDate} onChange={setDueDate} />
        <Caption upper={false}>Currency</Caption>
        <Segmented options={CURRENCIES} value={currency as (typeof CURRENCIES)[number]} onChange={setCurrency} />
        <TextField label="Tax rate (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="decimal-pad" />
      </Pane>

      <Pane title="Line items">
        {lines.map((l, idx) => (
          <View key={l.key}>
            {idx > 0 && <Separator />}
            <TextField label={`Item ${idx + 1}`} value={l.description} onChangeText={(v) => updateLine(l.key, { description: v })} placeholder="Description" />
            <Row style={{ gap: margin }}>
              <View style={{ flex: 1 }}>
                <TextField label="Qty" value={l.quantity} onChangeText={(v) => updateLine(l.key, { quantity: v })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 2 }}>
                <TextField label="Unit price" value={l.unitPrice} onChangeText={(v) => updateLine(l.key, { unitPrice: v })} keyboardType="decimal-pad" />
              </View>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body muted>{formatMoney(num(l.quantity) * num(l.unitPrice), currency)}</Body>
              {lines.length > 1 && (
                <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Body style={{ color: t.notOk }}>Remove</Body>
                </Pressable>
              )}
            </Row>
          </View>
        ))}
        <Button title="Add line" variant="secondary" onPress={() => setLines((ls) => [...ls, blankLine()])} />
      </Pane>

      <Pane title="Totals">
        <Row style={{ justifyContent: 'space-between' }}>
          <Body muted>Subtotal</Body>
          <Body>{formatMoney(totals.subtotal, currency)}</Body>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body muted>Tax ({num(taxRate)}%)</Body>
          <Body>{formatMoney(totals.tax, currency)}</Body>
        </Row>
        <Separator />
        <Highlight value={formatMoney(totals.total, currency)} suffix="total" />
      </Pane>

      <Pane title="Notes / payment terms">
        <TextField label="Shown at the bottom of the invoice" value={notes} onChangeText={setNotes} multiline placeholder="e.g. Payment due within 14 days" />
      </Pane>

      <Button title={existing ? 'Save changes' : 'Create invoice'} onPress={onSave} loading={saving} />
    </Screen>
  );
}
