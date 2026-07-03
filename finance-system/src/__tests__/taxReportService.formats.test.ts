import { TaxReportService, TaxRow } from '../services/TaxReportService';

const svc = new TaxReportService();

const sampleRows: TaxRow[] = [
  {
    date: '2026-01-15',
    type: 'SUBSCRIPTION_PAYMENT',
    asset: 'USD',
    amount: '29.00',
    usdValue: '29.00',
    fee: '0',
    txHash: '0xabc',
    source: 'Pro subscription',
  },
  {
    date: '2026-02-03',
    type: 'FIAT_PAYMENT', // Classified as Expenditure
    asset: 'JY',
    amount: '500',
    usdValue: '50.00',
    fee: '0.5',
    txHash: '0xdef',
    source: 'Business expense',
  },
];

describe('TaxReportService format adapters', () => {
  it('produces TokenTax-compatible header', () => {
    const csv = svc.toTokenTaxCsv(svc.categorizeTransactions(sampleRows));
    const header = csv.split('\n')[0];
    for (const col of [
      'Type',
      'BuyAmount',
      'BuyCurrency',
      'SellAmount',
      'SellCurrency',
      'FeeAmount',
      'FeeCurrency',
      'Exchange',
      'Date',
    ]) {
      expect(header).toContain(col);
    }
  });

  it('classifies inbound vs outbound rows in TokenTax format', () => {
    const csv = svc.toTokenTaxCsv(svc.categorizeTransactions(sampleRows));
    const lines = csv.split('\n').slice(1);
    expect(lines[0]).toContain('Income');
    expect(lines[0]).toContain('USD');
    expect(lines[1]).toContain('Spend');
    expect(lines[1]).toContain('JY');
  });

  it('produces Koinly-compatible header', () => {
    const csv = svc.toKoinlyCsv(svc.categorizeTransactions(sampleRows));
    const header = csv.split('\n')[0];
    for (const col of [
      'Date',
      'Sent Amount',
      'Sent Currency',
      'Received Amount',
      'Received Currency',
      'Fee Amount',
      'Fee Currency',
      'TxHash',
    ]) {
      expect(header).toContain(col);
    }
  });

  it('Koinly: inbound has Received populated and Sent empty', () => {
    const csv = svc.toKoinlyCsv(svc.categorizeTransactions(sampleRows));
    const lines = csv.split('\n').slice(1);
    expect(lines[0]).toContain('29');
    // Sent currency should be empty for inbound subscription payment.
    const inbound = lines[0].split(',');
    expect(inbound[1]).toBe(''); // Sent Amount
    expect(inbound[2]).toBe(''); // Sent Currency
  });

  it('escapes quotes in description fields', () => {
    const csv = svc.toCsv([
      {
        date: '2026-01-15',
        type: 'FEE',
        asset: 'JY',
        amount: '1',
        usdValue: '',
        fee: '0',
        txHash: '0xabc',
        source: 'Says "hi" with quotes',
      },
    ]);
    expect(csv).toContain('""hi""');
  });
});
