import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { Button, Screen, Segmented, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { PercentBar } from '../../components/PercentStat';
import { Caption } from '../../components/Typography';
import { CURRENCIES } from '../../core/constants';
import { margin, radius, useTheme } from '../../core/theme';
import { percentOf } from '../../core/utils';
import { getProfile, ProfileInput, saveProfile } from '../../data/repositories';
import { ScreenProps } from '../../navigation/RootNavigator';
import { persistImage } from '../../pdf/pdfGenerator';

const EMPTY: ProfileInput = {
  businessName: '',
  logoPath: null,
  email: '',
  phone: '',
  address: '',
  ecocashNumber: '',
  bankDetails: '',
  defaultCurrency: 'USD',
  taxRate: 0,
  invoicePrefix: 'INV',
};

export function BusinessProfileScreen({ navigation }: ScreenProps<'BusinessProfile'>) {
  const t = useTheme();
  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [taxText, setTaxText] = useState('0');

  useEffect(() => {
    getProfile().then((p) => {
      if (!p) return;
      setForm({
        businessName: p.businessName,
        logoPath: p.logoPath,
        email: p.email ?? '',
        phone: p.phone ?? '',
        address: p.address ?? '',
        ecocashNumber: p.ecocashNumber ?? '',
        bankDetails: p.bankDetails ?? '',
        defaultCurrency: p.defaultCurrency,
        taxRate: p.taxRate,
        invoicePrefix: p.invoicePrefix,
      });
      setTaxText(String(p.taxRate));
    });
  }, []);

  const set = (k: keyof ProfileInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
    if (res.canceled) return;
    const logoPath = await persistImage(res.assets[0].uri, 'logo');
    setForm((f) => ({ ...f, logoPath }));
  };

  const onSave = async () => {
    if (!form.businessName.trim()) return Alert.alert('Add your business name');
    const tax = parseFloat(taxText);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) return Alert.alert('Tax rate must be between 0 and 100');
    await saveProfile({ ...form, businessName: form.businessName.trim(), taxRate: tax, invoicePrefix: form.invoicePrefix.trim() || 'INV' });
    navigation.goBack();
  };

  // How complete the invoice header is — the fields customers see on every PDF.
  const filled = [form.businessName, form.logoPath, form.phone, form.email, form.address, form.ecocashNumber || form.bankDetails].filter(Boolean).length;

  return (
    <Screen>
      <Pane title="Invoice header">
        <PercentBar percentage={percentOf(filled, 6)} label="complete" color={filled === 6 ? t.ok : t.accent} footnote="Name, logo, phone, email, address and a payment method" />
      </Pane>
      <Pane title="Logo">
        <View style={{ alignItems: 'center' }}>
          {form.logoPath ? (
            <Image source={{ uri: form.logoPath }} style={{ width: 120, height: 120, borderRadius: radius, marginBottom: margin }} resizeMode="contain" />
          ) : (
            <Caption upper={false}>No logo yet</Caption>
          )}
        </View>
        <Button title={form.logoPath ? 'Change logo' : 'Choose logo'} variant="secondary" onPress={pickLogo} />
        {form.logoPath ? <Button title="Remove logo" variant="secondary" onPress={() => setForm({ ...form, logoPath: null })} /> : null}
      </Pane>
      <Pane title="Business">
        <TextField label="Business name" value={form.businessName} onChangeText={set('businessName')} />
        <TextField label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <TextField label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" />
        <TextField label="Address" value={form.address} onChangeText={set('address')} multiline />
      </Pane>
      <Pane title="Getting paid">
        <TextField label="EcoCash number" value={form.ecocashNumber} onChangeText={set('ecocashNumber')} keyboardType="phone-pad" placeholder="+263 77 123 4567" />
        <TextField label="Bank details" value={form.bankDetails} onChangeText={set('bankDetails')} multiline placeholder={'CBZ Bank\nAcc: 0123456789\nBranch: Kopje'} />
      </Pane>
      <Pane title="Invoice defaults">
        <Caption upper={false}>Default currency</Caption>
        <Segmented options={CURRENCIES} value={form.defaultCurrency as (typeof CURRENCIES)[number]} onChange={set('defaultCurrency')} />
        <TextField label="Tax rate (%)" value={taxText} onChangeText={setTaxText} keyboardType="decimal-pad" />
        <TextField label="Invoice number prefix" value={form.invoicePrefix} onChangeText={set('invoicePrefix')} />
      </Pane>
      <Button title="Save" onPress={onSave} />
    </Screen>
  );
}
