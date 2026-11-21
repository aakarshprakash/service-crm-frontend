import { describe, expect, it } from 'vitest';
import { estimateTotals, gstLabel, sharedRate } from './estimateParts';

// The same figures the server test (EstimateGstDetailsTest) checks, so the live totals match what is saved.
describe('estimateTotals', () => {
  it('adds GST on top of rates typed before GST, as on a supply quotation', () => {
    // 3 × ₹2,28,832 = ₹6,86,496 · GST @18% ₹1,23,569.28 · ₹8,10,065.28
    const t = estimateTotals([{ gross: 3 * 22883200, rate: 18 }], 0, { on: true, inclusive: false });
    expect(t).toEqual({ gross: 68649600, discount: 0, taxable: 68649600, tax: 12356928, total: 81006528 });
  });

  it('uses each line’s own rate', () => {
    const t = estimateTotals([{ gross: 100000, rate: 18 }, { gross: 100000, rate: 5 }], 0, { on: true, inclusive: false });
    expect(t.tax).toBe(23000);
    expect(t.total).toBe(223000);
  });

  it('takes the discount off before GST is added', () => {
    const t = estimateTotals([{ gross: 68649600, rate: 18 }], 649600, { on: true, inclusive: false });
    expect(t.taxable).toBe(68000000);
    expect(t.total).toBe(80240000);
  });

  it('keeps the typed total when the rates include GST', () => {
    const t = estimateTotals([{ gross: 68649600, rate: 18 }], 0, { on: true, inclusive: true });
    expect(t.total).toBe(68649600);
    expect(t.taxable).toBe(58177627);
  });

  it('shows no tax on an estimate without GST', () => {
    const t = estimateTotals([{ gross: 100000, rate: 18 }, { gross: 50000, rate: 18 }], 10000, { on: false, inclusive: false });
    expect(t).toEqual({ gross: 150000, discount: 10000, taxable: 140000, tax: 0, total: 140000 });
  });
});

describe('labels', () => {
  it('names how the estimate treats GST', () => {
    expect(gstLabel({ is_gst: false, prices_include_gst: true })).toBe('No GST');
    expect(gstLabel({ is_gst: true, prices_include_gst: false })).toBe('GST added');
    expect(gstLabel({ is_gst: true, prices_include_gst: true })).toBe('GST included');
  });

  it('finds the rate shared by every line', () => {
    expect(sharedRate([18, 18])).toBe(18);
    expect(sharedRate([18, 5])).toBeNull();
    expect(sharedRate([])).toBeNull();
  });
});
