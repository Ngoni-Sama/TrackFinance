# TrackFinance
### SMS-powered budget, invoice and expense app for Zimbabwe

An Android app that reads EcoCash / OneMoney / Kashagi / Omari / bank SMS,
logs transactions automatically, tracks daily expenses and budgets, and
produces branded PDF invoices with your logo and customer details.

- **Platform:** Android 8.0+ (API 26). iOS does not allow reading SMS.
- **Data:** on-device only (WatermelonDB on SQLite). No server, no account.
- **Stack:** Expo SDK 51 (prebuild / bare workflow), React Native 0.74, TypeScript.

---

## 1. What's in the app

| Tab | What it does |
|---|---|
| **Home** | Today's spend, month-to-date vs the same point last month, income received, *income spent* vs *month elapsed* dials, Kashagi loan repaid %, Omari savings balance, spending by category (donut + bars), budgets, 6-month trend, recent activity |
| **Activity** | All SMS + manual entries; search, filter (spent / received / savings / loans), per-currency |
| **Expenses** | Daily / weekly / monthly groups with category-share chips; tap a day to edit its entries; add expenses with receipt photo |
| **Invoices** | Collected % and overdue % dials, invoice list by status, builder with line items + tax, PDF preview / share (WhatsApp, email), paid / sent / draft |
| **Settings** | Business profile (logo, EcoCash number, bank details, tax, invoice prefix), customers, SMS tracking (disclosure → permission → backfill with progress), monthly budgets, CSV export, light / dark / system theme |

SMS tracking is opt-in. With it off the app works in **manual-only mode**.

## 2. Percentage UI (from pc_info)

Every percentage in the app uses the look of [pc_info](https://github.com/alecmus/pc_info)'s
lecui widgets, via two components in [`src/components/PercentStat.tsx`](src/components/PercentStat.tsx):

| Component | pc_info origin | Layout | Used for |
|---|---|---|---|
| `PercentBar` | `progress_bar` (power level) | **"NN%** small label", thin flat bar, grey footnote | category shares, budget used, loan repaid, payment term used, profile completeness, scan results |
| `PercentDial` | `progress_indicator` (BATTERY HEALTH) | grey UPPERCASE caption, ring with centred % | income spent, month elapsed, invoices collected / overdue |

The surrounding style follows pc_info too ([`src/core/theme.ts`](src/core/theme.ts)):
flat bordered panes, grey captions over values, a 10pt margin grid, the lecui
accent blue `#0078AA`, and pc_info's ok/not-ok green `rgb(0,150,0)` / red `rgb(200,0,0)`.
Don't render percentages as plain text — use these components so the app stays consistent.

## 3. Project layout

```
index.ts                     entry; registers the headless background-sync task
app.json                     Expo config: SMS permissions, blocked permissions, plugins
modules/tf-sms/              local Expo native module (Kotlin): inbox reader + live SMS receiver
src/
  App.tsx                    settings hydrate, SMS listener / background sync start
  core/                      theme, constants, currency, summaries, categorise, invoiceMath, utils
  components/                Pane, PercentBar/Dial, ProgressBar/Indicator, Controls, DateField
  data/db/                   WatermelonDB schema, migrations, models
  data/repositories.ts       all reads/writes (transactions, expenses, invoices, customers, budgets, CSV)
  data/settings.ts           persisted settings (DB key-value store)
  sms/                       smsFilter, parsers/, smsProcessor, smsListener, backgroundSync, permissions
  pdf/                       invoiceTemplate (HTML), pdfGenerator (expo-print, share, logo embedding)
  features/                  screens per tab
  navigation/RootNavigator.tsx
__tests__/                   parsers, summaries/invoice logic, percentage components
```

## 4. SMS senders

| Sender ID | Meaning | Handling |
|---|---|---|
| `+263164USD`, `+263164994`, `+263164` | EcoCash wallet | transaction (`ecocashParser`) |
| `+263165` | Kashagi micro-loans | loan (`kashagiParser`) |
| `Omari` | EcoCash Omari savings | savings transfer (`omariParser`) |
| `OneMoney` | NetOne OneMoney | transaction (`onemoneyParser`) |
| `CBZ`, `STEWARD`, `FBC`, `ZB`, `NMB`, `STANBIC`, `BANCABC` | banks | `bankParser` rules |
| `+263143`, `ECONET`, `Econet`, everything else | airtime, network alerts | ignored |

### Parsing rules worth knowing

- Amounts are read as `$10.00`, `USD 10.00`, `USD10`, `ZWG 1,250.50`; currency comes from the SMS, else the sender suffix (`+263164USD`), else USD (OneMoney: ZWG).
- Failed / insufficient-funds / declined messages are dropped.
- EcoCash sends **to Omari** become `transfer_to_savings`, and sends to Kashagi become loan repayments, so they don't inflate spending.
- Kashagi "repay $X by DD/MM/YYYY" on its own is stored as `loan_reminder`: it drives the *Kashagi loan* card but is never counted as money spent.
- Re-scans don't duplicate: each SMS gets a fingerprint (EcoCash Txn ID if present, else a hash of sender + time + body).
- Parsers never throw; malformed SMS simply produce nothing.
- Recategorising a transaction remembers the merchant, and updates that merchant's other uncategorised rows.

> **The SMS samples in `__tests__/parsers.test.ts` are modelled on real formats but are not a verified device corpus.**
> Before release, collect 20+ real messages per provider from a phone and add them as test cases;
> wording changes between EcoCash system versions.

## 5. Data model

Tables (see [`schema.ts`](src/data/db/schema.ts)): `transactions` (incl. `due_at`, `fingerprint`),
`expenses` (optional `transaction_id`, `receipt_path`), `customers`, `business_profile` (single row, id `default`),
`invoices` (incl. `tax_rate`, `pdf_path`), `invoice_items`, `merchant_categories` (merchant memory), `budgets`.

Totals: *spending* = `debit` + `expense_loan` transactions + manual expenses; *income* = `credit` + `income_loan`.
Savings transfers and loan reminders are neutral. Currencies are never mixed — every view has a USD / ZWG switch.

## 6. Running it

There's no Expo Go support (SMS needs native code). You need the Android SDK and JDK 17.

```bash
npm install
npx expo prebuild --platform android
npx expo run:android
```

Test SMS features on a **physical phone with a SIM** — emulators don't receive EcoCash SMS.

```bash
npm test            # Jest: parsers, summaries, invoice maths, percentage components
npm run typecheck   # tsc --noEmit
```

## 7. Background processing

- **Foreground:** `modules/tf-sms` registers an `SMS_RECEIVED` receiver while the JS listener is active and parses each SMS immediately.
- **On launch:** the inbox is synced from `last_sync_at` (first run: last 180 days, paged 300 at a time).
- **Background / terminated:** `react-native-background-fetch` runs the same sync roughly every 15 minutes (Android's minimum) and after reboot, via a headless task registered in `index.ts`.

## 8. Google Play: SMS permission policy

This is the main release risk. `READ_SMS` / `RECEIVE_SMS` are restricted to default SMS apps or approved exceptions.

- In the Play Console **Permissions Declaration Form**, declare SMS-based money management:
  *"TrackFinance reads SMS from mobile money providers (EcoCash, OneMoney) and banks solely to detect financial transactions for personal budgeting. All parsing happens on-device. No SMS content is uploaded to any server."*
- The app already shows a prominent disclosure (`SmsSetupScreen`) before the system permission prompt.
- `SEND_SMS`, storage and microphone permissions are explicitly blocked in `app.json`.
- Manual-only mode keeps the app useful if SMS access is refused.
- Publish a privacy policy URL stating: *"SMS content is read locally on your device to detect mobile money transactions. No SMS content leaves your device."*
- If Play rejects the declaration, the fallback is a sideloaded APK.

## 9. Differences from the original spec

| Spec | Implemented | Why |
|---|---|---|
| `react-native-android-sms-listener` + `@maniac-tech/react-native-expo-read-sms` | Local Expo module `modules/tf-sms` (Kotlin) | One maintained module for inbox + live SMS; survives `expo prebuild` |
| `react-native-html-to-pdf`, `react-native-share`, `react-native-fs`, `react-native-image-picker` | `expo-print`, `expo-sharing`, `expo-file-system`, `expo-image-picker` | First-party for SDK 51, no manual native setup |
| `react-native-permissions` | `PermissionsAndroid` | Android only; no extra native dep |
| React Query | Not used | WatermelonDB queries are already reactive |
| `<receiver>` in AndroidManifest | Runtime-registered receiver + background fetch | `android/` is generated by prebuild and not committed |
| Logo as `file://` in PDF | Logo embedded as base64 `data:` URI | Android's print WebView doesn't reliably load `file://` images |
| Template string interpolation | All values HTML-escaped | Names like `A&B <Pvt>` would break or inject into the PDF |
| — | Budgets, `loan_reminder`, merchant memory, CSV export, dark mode | From the roadmap / nice-to-haves |

## 10. Still to do

- Real SMS corpus for every provider + bank rules tuned per bank.
- On-device verification of the native module, background fetch and PDF output (not possible in CI here).
- App icon and splash (`assets/`), Play listing, privacy policy page.
- v1.1: SQLCipher-encrypted DB, PIN lock, invoice ↔ EcoCash credit reconciliation, Google Drive backup.

## License

MIT
