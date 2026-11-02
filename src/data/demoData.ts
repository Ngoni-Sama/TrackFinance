import { addDays, setHours, startOfMonth, subDays, subMonths } from 'date-fns';
import { parseSms } from '../sms/parsers/parserRegistry';
import { ParsedTransaction } from '../sms/parsers/types';
import { database } from './db';
import {
  getProfile,
  insertParsedTransactions,
  queries,
  saveCustomer,
  saveExpense,
  saveInvoice,
  saveProfile,
  setBudget,
  setInvoiceStatus,
} from './repositories';
import { setLastSyncAt, setSmsEnabled } from './settings';

/**
 * Sample data for the web demo and store screenshots. Every transaction is a
 * made-up SMS run through the real parsers, so what you see is parser output.
 * Names and numbers are fictional.
 */
function sms(now: Date): [string, string, Date][] {
  const d = (daysAgo: number, hour: number) => setHours(subDays(now, daysAgo), hour);
  const out: [string, string, Date][] = [];
  const add = (sender: string, body: string, at: Date) => out.push([sender, body, at]);

  // Two previous months for the trend chart.
  for (let m = 2; m >= 1; m--) {
    const base = startOfMonth(subMonths(now, m));
    add('+263164USD', `You have received USD ${m === 2 ? '820.00' : '910.00'} from 263772000111 - ACME PVT LTD. Approval Code: SAL${m}. New wallet balance: USD 950.00.`, addDays(base, 0));
    add('+263164USD', `Payment of USD ${m === 2 ? '96.40' : '118.25'} to OK ZIMBABWE SAMORA was successful. Txn ID: PM${m}A. New wallet balance: USD 700.00.`, addDays(base, 4));
    add('+263164USD', `You have paid USD 250.00 to 0771234567 TENDAI MOYO. Txn ID: RENT${m}. New wallet balance: USD 400.00.`, addDays(base, 1));
    add('+263164USD', `Payment of USD ${m === 2 ? '42.00' : '55.00'} to ZESA PREPAID was successful. Txn ID: ZS${m}. New wallet balance: USD 345.00.`, addDays(base, 6));
    add('+263164USD', `Payment of USD ${m === 2 ? '61.00' : '74.50'} to ZUPCO was successful. Txn ID: ZP${m}. New wallet balance: USD 270.00.`, addDays(base, 12));
    add('+263164USD', `Payment of USD 29.00 to DSTV ZIMBABWE was successful. Txn ID: DS${m}. New wallet balance: USD 241.00.`, addDays(base, 4));
    add('+263164USD', `You have sent USD 20.00 to 0773111222 CHIPO MUSARA. Txn ID: CM${m}. New wallet balance: USD 221.00.`, addDays(base, 14));
  }

  // This month.
  add('+263164USD', 'You have received USD 950.00 from 263772000111 - ACME PVT LTD. Approval Code: SAL0. New wallet balance: USD 1,012.40.', setHours(startOfMonth(now), 9));
  add('+263164USD', 'You have paid USD 250.00 to 0771234567 TENDAI MOYO. Txn ID: RENT0. New wallet balance: USD 762.40.', setHours(addDays(startOfMonth(now), 1), 10));
  add('+263164USD', 'You have sent USD 40.00 to Omari. Txn ID: OM0. New wallet balance: USD 722.40.', d(12, 8));
  add('Omari', 'You have transferred USD 40.00 from EcoCash to your Omari account. New balance: USD 315.00.', d(12, 8));
  add('+263165', 'Your Kashagi loan of USD 30.00 has been credited to your EcoCash wallet. Please repay USD 33.00 by 28/' + String(addDays(now, 14).getMonth() + 1).padStart(2, '0') + '/' + addDays(now, 14).getFullYear() + '.', d(10, 15));
  add('+263165', 'You have repaid USD 15.00 for your Kashagi loan. Outstanding balance: USD 18.00.', d(3, 11));
  add('+263164USD', 'Payment of USD 64.80 to OK ZIMBABWE SAMORA was successful. Txn ID: PM01. New wallet balance: USD 627.60.', d(9, 17));
  add('+263164USD', 'Payment of USD 38.00 to ZESA PREPAID was successful. Txn ID: ZS01. New wallet balance: USD 589.60.', d(8, 7));
  add('+263164USD', 'Payment of USD 12.40 to CHICKEN INN BORROWDALE was successful. Txn ID: CI01. New wallet balance: USD 577.20.', d(6, 13));
  add('+263164USD', 'Payment of USD 26.00 to ZUPCO was successful. Txn ID: ZP01. New wallet balance: USD 551.20.', d(5, 7));
  add('+263164USD', 'You have bought USD 5.00 airtime. Txn ID: AT01. New wallet balance: USD 546.20.', d(4, 19));
  add('+263164USD', 'Payment of USD 18.50 to CITY PHARMACY was successful. Txn ID: PH01. New wallet balance: USD 527.70.', d(2, 16));
  add('+263164USD', 'You have received USD 120.00 from 263773555222 - RUDO NCUBE. Approval Code: INV01. New wallet balance: USD 647.70.', d(1, 12));
  add('+263164USD', 'Payment of USD 9.60 to TM PICK N PAY was successful. Txn ID: PM02. New wallet balance: USD 638.10.', d(0, 8));
  add('+263164USD', 'Payment of USD 29.00 to DSTV ZIMBABWE was successful. Txn ID: DS0. New wallet balance: USD 609.10.', setHours(addDays(startOfMonth(now), 4), 9));
  add('+263164USD', 'You have sent USD 20.00 to 0773111222 CHIPO MUSARA. Txn ID: CM0. New wallet balance: USD 589.10.', setHours(addDays(startOfMonth(now), 14), 18));
  add('+263164USD', 'You have sent USD 35.00 to 0712987654 BLESSING DUBE. Txn ID: BD0. New wallet balance: USD 554.10.', d(1, 20));
  add('CBZ', 'CBZ: Acc 01234XXXX debited with USD 45.00 POS purchase at SPAR BORROWDALE. Avail Bal USD 410.20', d(7, 18));
  add('+263143', 'Your 1GB data bundle has been activated.', d(4, 19)); // noise: ignored
  // Early in the month some "this month" samples would land in the future: drop those.
  return out.filter(([, , at]) => at.getTime() <= now.getTime());
}

export async function isEmpty(): Promise<boolean> {
  return (await queries.transactions().fetchCount()) === 0 && (await queries.expenses().fetchCount()) === 0;
}

let seeding: Promise<void> | null = null;

/** Safe to call more than once: concurrent calls share one seed. */
export function seedDemoData(now = new Date()): Promise<void> {
  seeding ??= seed(now).finally(() => (seeding = null));
  return seeding;
}

async function seed(now: Date) {
  const parsed = sms(now)
    .map(([s, b, at]) => parseSms(s, b, at))
    .filter((t): t is ParsedTransaction => t != null);
  // The airtime SMS has no counterparty, so file it as airtime explicitly.
  parsed.forEach((t) => /airtime/i.test(t.rawBody) && (t.category = 'airtime'));
  // Rent goes to a person, which no merchant list can know; in the app you recategorise it once.
  parsed.forEach((t) => t.counterparty === 'TENDAI MOYO' && (t.category = 'rent'));
  await insertParsedTransactions(parsed);

  const dayAt = (daysAgo: number, h: number) => setHours(subDays(now, daysAgo), h).getTime();
  await saveExpense({ description: 'Kombi to town', amount: 2, currency: 'USD', category: 'transport', occurredAt: dayAt(0, 7) });
  await saveExpense({ description: 'Sadza & beef, lunch', amount: 4.5, currency: 'USD', category: 'food', occurredAt: dayAt(0, 13) });
  await saveExpense({ description: 'Bread and milk', amount: 3.2, currency: 'USD', category: 'food', occurredAt: dayAt(1, 8) });
  await saveExpense({ description: 'School stationery', amount: 14, currency: 'USD', category: 'education', occurredAt: dayAt(3, 15) });
  await saveExpense({ description: 'Market vegetables', amount: 1500, currency: 'ZWG', category: 'food', occurredAt: dayAt(2, 10) });

  await setBudget('food', 'USD', 150);
  await setBudget('transport', 'USD', 60);
  await setBudget('utilities', 'USD', 50);
  await setBudget('entertainment', 'USD', 25);

  if (!(await getProfile())) {
    await saveProfile({
      businessName: 'Ngoni Designs',
      logoPath: null,
      email: 'hello@ngonidesigns.example',
      phone: '+263 77 123 4567',
      address: '12 Samora Machel Ave\nHarare',
      ecocashNumber: '+263 77 123 4567',
      bankDetails: 'CBZ Bank, Kopje branch\nAcc: 0123456789',
      defaultCurrency: 'USD',
      taxRate: 15,
      invoicePrefix: 'INV',
    });
  }

  const rudo = await saveCustomer({ name: 'Rudo Ncube', email: 'rudo@example.com', phone: '+263 77 355 5222', address: 'Avondale, Harare', notes: '' });
  const acme = await saveCustomer({ name: 'Acme (Pvt) Ltd', email: 'accounts@acme.example', phone: '+263 24 270 0111', address: '5 Kwame Nkrumah Ave, Harare', notes: '' });
  const kuda = await saveCustomer({ name: 'Kuda Electrical', email: '', phone: '+263 71 900 1234', address: 'Msasa, Harare', notes: '' });

  const inv = (customerId: string, issuedDaysAgo: number, term: number, items: [string, number, number][]) =>
    saveInvoice({
      customerId,
      issueDate: dayAt(issuedDaysAgo, 9),
      dueDate: dayAt(issuedDaysAgo - term, 9),
      currency: 'USD',
      taxRate: 15,
      notes: 'Payment within 14 days via EcoCash or bank transfer.',
      items: items.map(([description, quantity, unitPrice]) => ({ description, quantity, unitPrice })),
    });

  const a = await inv(rudo.id, 20, 14, [['Logo design', 1, 80], ['Business cards (box of 100)', 2, 12]]);
  const b = await inv(acme.id, 9, 14, [['Website redesign — phase 1', 1, 450], ['Hosting setup', 1, 60]]);
  const c = await inv(kuda.id, 25, 7, [['Flyer design', 3, 25]]);
  await inv(acme.id, 1, 30, [['Social media kit', 1, 120]]);
  await setInvoiceStatus(a, 'paid');
  await setInvoiceStatus(b, 'sent');
  await setInvoiceStatus(c, 'sent');

  await setSmsEnabled(true);
  await setLastSyncAt(now.getTime());
}

export async function clearAllData() {
  await database.write(() => database.unsafeResetDatabase());
}
