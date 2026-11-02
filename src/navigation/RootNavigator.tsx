import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { useTheme } from '../core/theme';
import { CoachScreen } from '../features/coach/CoachScreen';
import { BusinessProfileScreen } from '../features/businessProfile/BusinessProfileScreen';
import { CustomerEditScreen } from '../features/customers/CustomerEditScreen';
import { CustomersScreen } from '../features/customers/CustomersScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { BudgetsScreen } from '../features/expenses/BudgetsScreen';
import { DayDetailScreen } from '../features/expenses/DayDetailScreen';
import { ExpenseEditScreen } from '../features/expenses/ExpenseEditScreen';
import { ExpensesScreen } from '../features/expenses/ExpensesScreen';
import { InvoiceDetailScreen } from '../features/invoices/InvoiceDetailScreen';
import { InvoiceEditScreen } from '../features/invoices/InvoiceEditScreen';
import { InvoicesScreen } from '../features/invoices/InvoicesScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { SmsSetupScreen } from '../features/settings/SmsSetupScreen';
import { TransactionDetailScreen } from '../features/transactions/TransactionDetailScreen';
import { TransactionsScreen } from '../features/transactions/TransactionsScreen';
import { SortOutScreen } from '../features/transactions/SortOutScreen';
import { DuplicatesScreen } from '../features/transactions/DuplicatesScreen';
import { AiProviderScreen } from '../features/settings/AiProviderScreen';

export type RootStackParamList = {
  Tabs: undefined;
  TransactionDetail: { id: string };
  ExpenseEdit: { id?: string; date?: number };
  DayDetail: { day: string; currency: string };
  Budgets: undefined;
  InvoiceEdit: { id?: string };
  InvoiceDetail: { id: string };
  Customers: { pick?: boolean } | undefined;
  CustomerEdit: { id?: string; pick?: boolean };
  BusinessProfile: undefined;
  SmsSetup: undefined;
  SortOut: undefined;
  Duplicates: undefined;
  AiProvider: undefined;
};

export type ScreenProps<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'speedometer-outline',
  Activity: 'swap-vertical-outline',
  Expenses: 'wallet-outline',
  Coach: 'sparkles-outline',
  Invoices: 'document-text-outline',
  More: 'settings-outline',
};

function Tabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} color={color} size={size} />,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.caption,
        tabBarStyle: { backgroundColor: t.pane, borderTopColor: t.paneBorder },
        headerStyle: { backgroundColor: t.pane },
        headerTintColor: t.text,
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'TrackFinance', tabBarLabel: 'Home' }} />
      <Tab.Screen name="Activity" component={TransactionsScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} options={{ title: 'Coach' }} />
      <Tab.Screen name="Invoices" component={InvoicesScreen} />
      <Tab.Screen name="More" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator({ dark }: { dark: boolean }) {
  const t = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      theme={{ ...base, colors: { ...base.colors, primary: t.accent, background: t.background, card: t.pane, text: t.text, border: t.paneBorder } }}
    >
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: t.pane }, headerTintColor: t.text }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} options={{ title: 'Transaction' }} />
        <Stack.Screen name="ExpenseEdit" component={ExpenseEditScreen} options={{ title: 'Expense' }} />
        <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: 'Day' }} />
        <Stack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Monthly budgets' }} />
        <Stack.Screen name="InvoiceEdit" component={InvoiceEditScreen} options={{ title: 'Invoice' }} />
        <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Invoice' }} />
        <Stack.Screen name="Customers" component={CustomersScreen} />
        <Stack.Screen name="CustomerEdit" component={CustomerEditScreen} options={{ title: 'Customer' }} />
        <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} options={{ title: 'Business profile' }} />
        <Stack.Screen name="SmsSetup" component={SmsSetupScreen} options={{ title: 'SMS tracking' }} />
        <Stack.Screen name="SortOut" component={SortOutScreen} options={{ title: 'Sort out payments' }} />
        <Stack.Screen name="Duplicates" component={DuplicatesScreen} options={{ title: 'Duplicates' }} />
        <Stack.Screen name="AiProvider" component={AiProviderScreen} options={{ title: 'AI provider' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
