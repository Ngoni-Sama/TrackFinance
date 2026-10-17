import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { EmptyState, Fab, TextField } from '../../components/Controls';
import { Pane } from '../../components/Pane';
import { Body, Caption } from '../../components/Typography';
import { margin, useTheme } from '../../core/theme';
import { queries } from '../../data/repositories';
import { useQuery } from '../../data/useObservable';
import { ScreenProps } from '../../navigation/RootNavigator';

export function CustomersScreen({ navigation }: ScreenProps<'Customers'>) {
  const t = useTheme();
  const customers = useQuery(queries.customers);
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? customers.filter((c) => [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q))) : customers;
  }, [customers, search]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        contentContainerStyle={{ padding: margin, paddingBottom: 96 }}
        data={visible}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={<TextField label="Search" value={search} onChangeText={setSearch} placeholder="Name, phone or email" />}
        renderItem={({ item }) => (
          <Pane onPress={() => navigation.navigate('CustomerEdit', { id: item.id })}>
            <Body style={{ fontWeight: '600' }}>{item.name}</Body>
            <Caption upper={false}>{[item.phone, item.email].filter(Boolean).join(' · ') || 'No contact details'}</Caption>
          </Pane>
        )}
        ListEmptyComponent={<EmptyState text="No customers yet." />}
      />
      <Fab onPress={() => navigation.navigate('CustomerEdit', {})} />
    </View>
  );
}
