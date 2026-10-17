import { parseMobileMoney } from './mobileMoney';
import { SmsParser } from './types';

/** EcoCash wallet SMS: +263164USD, +263164994, +263164. */
export const ecocashParser: SmsParser = {
  name: 'EcoCash',
  canParse(sender) {
    return sender.toUpperCase().includes('263164');
  },
  parse(sender, body, receivedAt) {
    if (!this.canParse(sender)) return null;
    return parseMobileMoney(sender, body, receivedAt);
  },
};
