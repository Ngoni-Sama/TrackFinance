import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Button, Screen, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { formatMoney } from '../../core/currency';
import { collectionRate } from '../../core/invoiceMath';
import { useTheme } from '../../core/theme';
import { Customer } from '../../data/db';
import { deleteCustomer, find, queries, saveCustomer } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';

export function CustomerEditScreen({ route, navigation }: ScreenProps<'CustomerEdit'>) {
  const t = useTheme();
  const id = route.params?.id;
  const [existing, setExisting] = useState<Customer>();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const invoices = useQuery(queries.invoices);

  useEffect(() => {
    if (!id) return;
    find.customer(id).then((c) => {
      setExisting(c);
      setForm({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    });
  }, [id]);

  const mine = useMemo(() => invoices.filter((i) => i.customerId === id), [invoices, id]);
  const currencies = [...new Set(mine.map((i) => i.currency))];

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSave = async () => {
    if (!form.name.trim()) return Alert.alert('Add a name');
    await saveCustomer({ ...form, name: form.name.trim() }, existing);
    navigation.goBack();
  };

  const onDelete = () =>
    existing &&
    Alert.alert(`Delete ${existing.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomer(existing);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Cannot delete', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <Screen>
      {currencies.map((c) => {
        const r = collectionRate(mine, c);
        return r.billed > 0 ? (
          <Pane key={c} title={`Paid up (${c})`}>
            <PercentBar percentage={r.percentage} label="of invoiced amount paid" color={t.ok} footnote={`${formatMoney(r.outstanding, c)} outstanding`} />
          </Pane>
        ) : null;
      })}
      <Pane>
        <TextField label="Name" value={form.name} onChangeText={set('name')} />
        <TextField label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <TextField label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" />
        <TextField label="Address" value={form.address} onChangeText={set('address')} multiline />
        <TextField label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      </Pane>
      <Button title="Save" onPress={onSave} />
      {existing ? <Button title="Delete" variant="danger" onPress={onDelete} /> : null}
    </Screen>
  );
}
