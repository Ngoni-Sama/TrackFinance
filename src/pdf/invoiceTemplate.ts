import { format } from 'date-fns';
import { formatMoney } from '../core/currency';
import { escapeHtml as e } from '../core/utils';

export interface InvoiceDoc {
  invoiceNumber: string;
  issueDate: number;
  dueDate: number;
  currency: string;
  taxRate: number;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes?: string | null;
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

export interface CustomerDoc {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface BusinessDoc {
  businessName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  ecocashNumber?: string | null;
  bankDetails?: string | null;
  /** data: URI — Android's print WebView cannot load file:// images reliably. */
  logoDataUri?: string | null;
}

const nl2br = (s?: string | null) => e(s).replace(/\n/g, '<br/>');

/** Every user-supplied value is HTML-escaped: names like "A&B <Pvt>" must not break the PDF. */
export function buildInvoiceHtml(inv: InvoiceDoc, cust: CustomerDoc, biz: BusinessDoc): string {
  const money = (n: number) => e(formatMoney(n, inv.currency));
  const lines = inv.items
    .map(
      (i) => `
      <tr>
        <td>${e(i.description)}</td>
        <td class="c">${e(i.quantity)}</td>
        <td class="r">${money(i.unitPrice)}</td>
        <td class="r">${money(i.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const logo = biz.logoDataUri ? `<img src="${biz.logoDataUri}" class="logo" />` : '';
  const paid = inv.status === 'paid' ? '<div class="stamp">PAID</div>' : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 24px; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #202020; padding: 16px; font-size: 13px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { max-width: 110px; max-height: 90px; }
  .business { text-align: right; }
  .business h1 { margin: 0 0 4px; font-size: 20px; }
  .caption { color: #808080; font-size: 10px; letter-spacing: .6px; text-transform: uppercase; }
  h2 { margin: 28px 0 4px; font-size: 18px; color: #0078AA; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border-bottom: 1px solid #DCDCDC; padding: 8px; }
  th { background: #F0F0F0; text-align: left; font-weight: 600; }
  .c { text-align: center; } .r { text-align: right; }
  .totals { margin-top: 16px; margin-left: auto; width: 260px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
  .total-row { font-weight: 700; font-size: 15px; border-top: 1px solid #202020; padding-top: 6px !important; }
  .payment { margin-top: 32px; font-size: 12px; }
  .notes { margin-top: 16px; font-size: 12px; }
  .footer { margin-top: 32px; color: #808080; font-size: 12px; }
  .stamp { position: absolute; top: 160px; right: 40px; border: 3px solid #009600; color: #009600; font-size: 28px; font-weight: 700; padding: 4px 16px; transform: rotate(-12deg); }
</style>
</head>
<body>
  ${paid}
  <header>
    <div>${logo}</div>
    <div class="business">
      <h1>${e(biz.businessName)}</h1>
      <div>${nl2br(biz.address)}</div>
      <div>${e(biz.phone)}</div>
      <div>${e(biz.email)}</div>
    </div>
  </header>

  <h2>INVOICE #${e(inv.invoiceNumber)}</h2>
  <div><b>Date:</b> ${e(format(inv.issueDate, 'd MMM yyyy'))} &nbsp;&nbsp; <b>Due:</b> ${e(format(inv.dueDate, 'd MMM yyyy'))}</div>

  <p><span class="caption">Bill to</span><br/>
    <b>${e(cust.name)}</b><br/>
    ${cust.address ? nl2br(cust.address) + '<br/>' : ''}
    ${e(cust.phone)}${cust.phone && cust.email ? ' | ' : ''}${e(cust.email)}
  </p>

  <table>
    <thead>
      <tr><th>Description</th><th class="c">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
    <div><span>Tax (${e(inv.taxRate)}%)</span><span>${money(inv.tax)}</span></div>
    <div class="total-row"><span>TOTAL</span><span>${money(inv.total)}</span></div>
  </div>

  ${inv.notes ? `<div class="notes"><span class="caption">Notes</span><br/>${nl2br(inv.notes)}</div>` : ''}

  <div class="payment">
    <span class="caption">Payment details</span><br/>
    ${biz.ecocashNumber ? `EcoCash: ${e(biz.ecocashNumber)}<br/>` : ''}
    ${nl2br(biz.bankDetails)}
  </div>

  <div class="footer">Thank you for your business.</div>
</body>
</html>`;
}
