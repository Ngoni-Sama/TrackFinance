import { parseMobileMoney } from './mobileMoney';
import { SmsParser } from './types';

/** NetOne OneMoney. Sender shows as "OneMoney" on most handsets. */
export const onemoneyParser: SmsParser = {
  name: 'OneMoney',
  canParse(sender) {
    return sender.toUpperCase().replace(/[\s_-]/g, '').includes('ONEMONEY');
  },
  parse(sender, body, receivedAt) {
    if (!this.canParse(sender)) return null;
    const tx = parseMobileMoney(sender, body, receivedAt);
    // OneMoney wallets default to ZWG when the SMS does not name a currency.
    if (tx && !/\b(USD|US\$|\$)/i.test(body) && !/\b(ZWG|ZWL|RTGS)\b/i.test(body)) tx.currency = 'ZWG';
    return tx;
  },
};
