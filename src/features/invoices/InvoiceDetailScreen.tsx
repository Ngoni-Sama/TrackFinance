import { differenceInCalendarDays, format } from 'date-fns';
import * as Print from 'expo-print';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button, EmptyState, Row, Screen, Segmented } from '../../components/Controls';
import { Field, Pane, Separator } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Body, Highlight } from '../../components/Typography';
import { formatMoney } from '../../core/currency';
import { useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { deleteInvoice, find, getProfile, queries, setInvoicePdf, setInvoiceStatus } from '../../data/repositories';
import { useQuery, useRecord } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';
import { buildHtmlFor, generateInvoicePdf, shareInvoice } from '../../pdf/pdfGenerator';
import { useStatusColor } from './InvoicesScreen';

export function InvoiceDetailScreen({ route, navigation }: ScreenProps<'InvoiceDetail'>) {
  const t = useTheme();
  const statusColor = useStatusColor();
  const inv = useRecord(() => find.invoice(route.params.id), [route.params.id]);
  const items = useQuery(() => queries.invoiceItems(route.params.id), [route.params.id]);
  const customer = useRecord(() => (inv ? find.customer(inv.customerId) : Promise.reject()), [inv?.customerId]);
  const [busy, setBusy] = useState<'pdf' | 'preview' | null>(null);

  if (inv === undefined) return null;
  if (inv === null) return <EmptyState text="This invoice no longer exists." />;

  const html = async () => {
    if (!customer) throw new Error('Customer not found.');
    return buildHtmlFor(inv, items, customer, await getProfile());
  };

  const run = async (kind: 'pdf' | 'preview', fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onShare = () =>
    run('pdf', async () => {
      const path = inv.pdfPath ?? (await generateInvoicePdf(await html(), inv.invoiceNumber));
      if (!inv.pdfPath) await setInvoicePdf(inv, path);
      await shareInvoice(path);
      if (inv.status === 'draft') await setInvoiceStatus(inv, 'sent');
    });

  const onRegenerate = () =>
    run('pdf', async () => {
      const path = await generateInvoicePdf(await html(), inv.invoiceNumber);
      await setInvoicePdf(inv, path);
      Alert.alert('PDF saved', 'Saved in TrackFinance’s documents. Use Share to send it.');
    });

  const onPreview = () => run('preview', async () => void (await Print.printAsync({ html: await html() })));

  const onDelete = () =>
    Alert.alert(`Delete ${inv.invoiceNumber}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => (await deleteInvoice(inv), navigation.goBack()) },
    ]);

  const daysLeft = differenceInCalendarDays(inv.dueDate, Date.now());
  const term = Math.max(1, differenceInCalendarDays(inv.dueDate, inv.issueDate));
  const overdue = inv.status === 'sent' && daysLeft < 0;

  return (
    <Screen>
      <Pane title={inv.invoiceNumber}>
        <Highlight value={formatMoney(inv.total, inv.currency)} suffix={overdue ? 'overdue' : inv.status} color={statusColor(inv.status, overdue)} />
        {inv.status !== 'paid' && (
          <PercentBar
            percentage={percentOf(term - Math.max(0, daysLeft), term)}
            label="of payment term used"
            color={overdue ? t.notOk : daysLeft <= 3 ? t.warn : t.accent}
            footnote={daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} until due` : `${-daysLeft} day${daysLeft === -1 ? '' : 's'} overdue`}
          />
        )}
        <Field caption="Customer">
          <Body>{customer?.name ?? '…'}</Body>
        </Field>
        <Row style={{ justifyContent: 'space-between' }}>
          <Field caption="Issued">
            <Body>{format(inv.issueDate, 'd MMM yyyy')}</Body>
          </Field>
          <Field caption="Due">
            <Body>{format(inv.dueDate, 'd MMM yyyy')}</Body>
          </Field>
        </Row>
        <Segmented
          options={['draft', 'sent', 'paid'] as const}
          value={inv.status as 'draft' | 'sent' | 'paid'}
          onChange={(s) => setInvoiceStatus(inv, s)}
          labels={{ draft: 'Draft', sent: 'Sent', paid: 'Paid' }}
        />
      </Pane>

      <Pane title="Items">
        {items.map((i) => (
          <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Body style={{ flex: 1 }}>
              {i.quantity} × {i.description}
            </Body>
            <Body>{formatMoney(i.lineTotal, inv.currency)}</Body>
          </Row>
        ))}
        <Separator />
        <Row style={{ justifyContent: 'space-between' }}>
          <Body muted>Subtotal</Body>
          <Body>{formatMoney(inv.subtotal, inv.currency)}</Body>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body muted>Tax ({inv.taxRate}%)</Body>
          <Body>{formatMoney(inv.tax, inv.currency)}</Body>
        </Row>
      </Pane>

      <Button title="Share PDF (WhatsApp, email…)" onPress={onShare} loading={busy === 'pdf'} />
      <Button title="Preview / print" variant="secondary" onPress={onPreview} loading={busy === 'preview'} />
      <Button title="Regenerate PDF" variant="secondary" onPress={onRegenerate} disabled={!!busy} />
      <Button title="Edit" variant="secondary" onPress={() => navigation.navigate('InvoiceEdit', { id: inv.id })} />
      <Button title="Delete" variant="danger" onPress={onDelete} />
    </Screen>
  );
}
