import { format } from 'date-fns';
import React, { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Button, CategoryPicker, EmptyState, Row, Screen, TextField } from '../../components/Controls';
import { Field, Pane } from '../../components/Pane';
import { Body, Caption, Highlight } from '../../components/Typography';
import { categoryLabel, CATEGORIES } from '../../core/constants';
import { formatMoney } from '../../core/currency';
import { directionOf } from '../../core/summaries';
import { margin, useTheme } from '../../core/theme';
import { Transaction } from '../../data/db';
import { deleteTransaction, find, recategoriseTransaction } from '../../data/repositories';
import { useRecord } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';

/** Category + "what was it for?" note, saved as the user's own label. */
function ClassifyPane({ tx, onSorted }: { tx: Transaction; onSorted: () => void }) {
  const t = useTheme();
  const [category, setCategory] = useState(tx.category ?? 'other');
  const [note, setNote] = useState(tx.note ?? '');
  const [all, setAll] = useState(true);
  const [saved, setSaved] = useState(false);
  const name = tx.counterparty ?? 'this merchant';

  const save = async () => {
    await recategoriseTransaction(tx, category, { remember: all, note });
    setSaved(true);
  };

  return (
    <Pane title="What was it for?" right={tx.userCategorised ? <Caption upper={false} style={{ color: t.ok }}>sorted by you</Caption> : undefined}>
      <CategoryPicker value={category} categories={CATEGORIES} onChange={(c) => (setCategory(c), setSaved(false))} />
      <TextField label="Note (optional)" value={note} onChangeText={(v) => (setNote(v), setSaved(false))} placeholder="e.g. rent, school fees, groceries for mum" />
      <Row style={{ justifyContent: 'space-between', marginBottom: margin }}>
        <View style={{ flex: 1, paddingRight: margin }}>
          <Body>All payments to {name}</Body>
          <Caption upper={false}>Also files their other and future payments as {categoryLabel(category)}</Caption>
        </View>
        <Switch value={all} onValueChange={setAll} trackColor={{ true: t.accent, false: t.progressEmpty }} />
      </Row>
      <Button title={saved ? 'Saved ✓' : 'Save'} onPress={save} disabled={saved} />
      <Body style={{ color: t.accent }} onPress={onSorted}>
        Sort out more payments ›
      </Body>
    </Pane>
  );
}

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

      {dir === 'out' && <ClassifyPane tx={tx} onSorted={() => navigation.navigate('SortOut')} />}

      <Pane title="Original SMS">
        <Body muted>{tx.rawBody}</Body>
      </Pane>

      <Button title="Delete" variant="danger" onPress={onDelete} />
    </Screen>
  );
}
