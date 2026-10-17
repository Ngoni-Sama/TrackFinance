import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BusinessProfile, Customer, Invoice, InvoiceItem } from '../data/db';
import { buildInvoiceHtml } from './invoiceTemplate';

const INVOICE_DIR = `${FileSystem.documentDirectory}invoices/`;

async function logoDataUri(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch {
    return null; // logo removed or unreadable: render without it
  }
}

export async function buildHtmlFor(inv: Invoice, items: InvoiceItem[], cust: Customer, biz: BusinessProfile | null) {
  return buildInvoiceHtml(
    {
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: inv.currency,
      taxRate: inv.taxRate,
      subtotal: inv.subtotal,
      tax: inv.tax,
      total: inv.total,
      status: inv.status,
      notes: inv.notes,
      items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    },
    { name: cust.name, address: cust.address, phone: cust.phone, email: cust.email },
    {
      businessName: biz?.businessName ?? 'My Business',
      address: biz?.address,
      phone: biz?.phone,
      email: biz?.email,
      ecocashNumber: biz?.ecocashNumber,
      bankDetails: biz?.bankDetails,
      logoDataUri: await logoDataUri(biz?.logoPath),
    },
  );
}

/** Render to PDF and move it into app documents as "<invoice number>.pdf". */
export async function generateInvoicePdf(html: string, invoiceNumber: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await FileSystem.makeDirectoryAsync(INVOICE_DIR, { intermediates: true }).catch(() => undefined);
  const dest = `${INVOICE_DIR}${invoiceNumber.replace(/[^\w.-]/g, '_')}.pdf`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: dest });
  return dest;
}

/** Opens the Android share sheet (WhatsApp, Gmail, Drive, …). */
export async function shareInvoice(fileUri: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Share invoice', UTI: 'com.adobe.pdf' });
}

export async function shareCsv(csv: string) {
  const path = `${FileSystem.cacheDirectory}trackfinance-export.csv`;
  await FileSystem.writeAsStringAsync(path, csv);
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export transactions' });
}

/** Copy a picked image into app storage so it survives the picker's cache being cleared. */
export async function persistImage(srcUri: string, name: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}images/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const ext = srcUri.match(/\.(png|jpe?g|webp)$/i)?.[0] ?? '.jpg';
  const dest = `${dir}${name}-${Date.now()}${ext}`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}
