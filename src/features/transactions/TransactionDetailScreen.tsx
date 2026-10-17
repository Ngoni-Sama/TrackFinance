import { format } from 'date-fns';
import React from 'react';
import { Alert } from 'react-native';
import { Button, CategoryPicker, EmptyState, Screen } from '../../components/Controls';
import { Field, Pane } from '../../components/Pane';
import { Body, Highlight } from '../../components/Typography';
import { categoryLabel, CATEGORIES } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { directionOf } from '../../core/summaries';
import { useTheme } from '../../core/theme';
import { deleteTransaction, find, recategoriseTransaction } from '../../data/repositories';
import { useRecord } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';

export function TransactionDetailScreen({ route, navigation }: ScreenProps<'TransactionDetail'>) {
  const t = useTheme();
  const tx = useRecord(() => find.transaction(route.params.id), [route.params.id]);
  if (tx === undefined) return null;
  if (tx === null) return <EmptyState text="This transaction no longer exists." />;

  const dir = directionOf(tx.type);
  const color = dir === 'in' ? t.ok : dir === 'out' ? t.notOk : t.text;

  const onDelete = () =>
    Alert.alert('Delete transaction?', 'It will be removed from your totals. A full inbox re-scan may add it back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(tx);
          navigation.goBack();
        },
      },
    ]);

  return (
    <Screen>
      <Pane title={tx.counterparty ?? 'Transaction'}>
        <Highlight value={formatMoney(tx.amount, tx.currency)} suffix={tx.type.replace(/_/g, ' ')} color={color} />
        <Field caption="When" style={{ marginTop: 10 }}>
          <Body>{format(tx.occurredAt, 'EEE d MMM yyyy, HH:mm')}</Body>
        </Field>
        {tx.reference ? (
          <Field caption="Reference">
            <Body>{tx.reference}</Body>
          </Field>
        ) : null}
        {tx.balanceAfter != null ? (
          <Field caption="Balance after">
            <Body>{formatMoney(tx.balanceAfter, tx.currency)}</Body>
          </Field>
        ) : null}
        {tx.charges ? (
          <Field caption="Charges">
            <Body>{formatMoney(tx.charges, tx.currency)}</Body>
          </Field>
        ) : null}
        {tx.dueAt ? (
          <Field caption="Due">
            <Body>{format(tx.dueAt, 'd MMM yyyy')}</Body>
          </Field>
        ) : null}
        <Field caption="Sender">
          <Body>{tx.senderId}</Body>
        </Field>
      </Pane>

      {dir === 'out' && (
        <Pane title="Category">
          <CategoryPicker value={tx.category ?? 'other'} categories={CATEGORIES} onChange={(c) => recategoriseTransaction(tx, c)} />
          <Body muted>
            Changing this also files future {tx.counterparty ?? 'payments to this merchant'} under {categoryLabel(tx.category ?? 'other')}.
          </Body>
        </Pane>
      )}

      <Pane title="Original SMS">
        <Body muted>{tx.rawBody}</Body>
      </Pane>

      <Button title="Delete" variant="danger" onPress={onDelete} />
    </Screen>
  );
}
