import { crossSourceTwin, DedupeRow, findDuplicateGroups, fingerprint, senderFamily } from '../src/core/dedupe';
import { TxType } from '../src/sms/parsers/types';

const row = (p: Partial<DedupeRow>): DedupeRow => ({
  id: Math.random().toString(36), amount: 10, currency: 'USD', type: TxType.Debit, senderId: '+263164USD',
  rawBody: 'x', occurredAt: new Date(2026, 10, 1, 12).getTime(), ...p,
});

describe('dedupe', () => {
  it('fingerprints ignore sender format and seconds', () => {
    const body = 'You have paid USD 5.00 to A. Balance USD 9.00';
    expect(fingerprint({ senderId: '+263164USD', rawBody: body, date: new Date(2026, 10, 1, 7, 30, 2) })).toBe(
      fingerprint({ senderId: '263164 USD', rawBody: `${body}  `, date: new Date(2026, 10, 1, 7, 31, 0) }),
    );
  });

  it('groups sender families', () => {
    expect(senderFamily('+263164994')).toBe('ecocash');
    expect(senderFamily('+263165')).toBe('kashagi');
    expect(senderFamily('OMARI')).toBe('omari');
  });

  it('pairs EcoCash and Kashagi reports of the same loan', () => {
    const k = row({ senderId: '+263165', type: TxType.LoanDisbursement, rawBody: 'Your Kashagi loan of USD 30' });
    const e = row({ type: TxType.Credit, counterparty: 'KASHAGI', occurredAt: k.occurredAt + 120_000 });
    expect(crossSourceTwin(e, k)?.keep).toBe(k);
  });

  it('does not pair unrelated payments', () => {
    const k = row({ senderId: '+263165', type: TxType.LoanDisbursement });
    expect(crossSourceTwin(row({ counterparty: 'OK ZIMBABWE', rawBody: 'paid OK' }), k)).toBeNull();
    expect(crossSourceTwin(row({ senderId: 'Omari' }), row({ occurredAt: Date.now() }))).toBeNull();
  });

  it('finds saved duplicates and keeps the first copy', () => {
    const a = row({ reference: 'R1', id: 'a' });
    const b = row({ reference: 'R1', id: 'b', occurredAt: a.occurredAt + 5000 });
    const [g] = findDuplicateGroups([b, a, row({ reference: 'R2' })]);
    expect(g.keep.id).toBe('a');
    expect(g.remove.map((r) => r.id)).toEqual(['b']);
  });
});
