import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image } from 'react-native';
import { Button, CategoryPicker, Screen, Segmented, TextField } from '../../components/Controls';
import { DateField } from '../../components/DateField';
import { Pane } from '../../components/Pane';
import { CATEGORIES, CURRENCIES } from '../../core/constants';
import { margin, radius } from '../../core/theme';
import { Expense } from '../../data/db';
import { deleteExpense, find, saveExpense } from '../../data/repositories';
import { ScreenProps } from '../../navigation/RootNavigator';
import { persistImage } from '../../pdf/pdfGenerator';
import { useCurrency } from '../shared';

export function ExpenseEditScreen({ route, navigation }: ScreenProps<'ExpenseEdit'>) {
  const id = route.params?.id;
  const [defaultCurrency] = useCurrency();
  const [existing, setExisting] = useState<Expense>();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [category, setCategory] = useState('food');
  const [occurredAt, setOccurredAt] = useState(route.params?.date ?? Date.now());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    find.expense(id).then((e) => {
      setExisting(e);
      setDescription(e.description);
      setAmount(String(e.amount));
      setCurrency(e.currency);
      setCategory(e.category);
      setOccurredAt(e.occurredAt);
      setReceipt(e.receiptPath);
    });
    navigation.setOptions({ title: 'Edit expense' });
  }, [id, navigation]);

  const pickReceipt = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!res.canceled) setReceipt(await persistImage(res.assets[0].uri, 'receipt'));
  };

  const onSave = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!description.trim()) return Alert.alert('Add a description');
    if (!Number.isFinite(value) || value <= 0) return Alert.alert('Enter an amount above zero');
    setSaving(true);
    try {
      await saveExpense(
        { description: description.trim(), amount: value, currency: currency ?? defaultCurrency, category, occurredAt, receiptPath: receipt },
        existing,
      );
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () =>
    existing &&
    Alert.alert('Delete expense?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => (await deleteExpense(existing), navigation.goBack()) },
    ]);

  return (
    <Screen>
      <Pane>
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Kombi to town" />
        <TextField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Segmented options={CURRENCIES} value={(currency ?? defaultCurrency) as (typeof CURRENCIES)[number]} onChange={setCurrency} />
        <CategoryPicker value={category} onChange={setCategory} categories={CATEGORIES} />
        <DateField label="When" value={occurredAt} onChange={setOccurredAt} withTime />
        {receipt ? <Image source={{ uri: receipt }} style={{ height: 160, borderRadius: radius, marginBottom: margin }} resizeMode="cover" /> : null}
        <Button title={receipt ? 'Change receipt photo' : 'Attach receipt photo'} variant="secondary" onPress={pickReceipt} />
      </Pane>
      <Button title="Save" onPress={onSave} loading={saving} />
      {existing ? <Button title="Delete" variant="danger" onPress={onDelete} /> : null}
    </Screen>
  );
}
