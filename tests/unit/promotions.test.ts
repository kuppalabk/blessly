import { describe, expect, it } from 'vitest';
import { discountFor, normaliseCode, promoInputSchema } from '@/server/services/promotions';

describe('discount maths', () => {
  it('takes a percentage and rounds down to the minor unit', () => {
    expect(discountFor({ kind: 'percent', value: 10 }, 49900)).toBe(4990);
    expect(discountFor({ kind: 'percent', value: 15 }, 1001)).toBe(150);
    expect(discountFor({ kind: 'percent', value: 100 }, 500)).toBe(500);
  });

  it('takes a fixed amount but never more than the price', () => {
    expect(discountFor({ kind: 'fixed', value: 500 }, 49900)).toBe(500);
    expect(discountFor({ kind: 'fixed', value: 5000 }, 1200)).toBe(1200);
  });

  it('gives nothing for a zero price', () => {
    expect(discountFor({ kind: 'percent', value: 50 }, 0)).toBe(0);
  });
});

describe('codes', () => {
  it('normalises case and spaces', () => {
    expect(normaliseCode('  diwali 25 ')).toBe('DIWALI25');
  });

  it('accepts sensible codes and rejects the rest', () => {
    const ok = promoInputSchema.safeParse({ code: 'diwali-25', label: 'Diwali', kind: 'percent', value: 10, appliesTo: ['shop'] });
    expect(ok.success).toBe(true);
    expect(promoInputSchema.safeParse({ code: 'a b', label: 'Bad', kind: 'percent', value: 10, appliesTo: ['shop'] }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: 'OK1', label: 'Big', kind: 'percent', value: 150, appliesTo: ['shop'] }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: 'OK2', label: 'Fixed', kind: 'fixed', value: 500, appliesTo: ['shop'] }).success).toBe(false);
    expect(promoInputSchema.safeParse({ code: 'OK3', label: 'Nothing', kind: 'percent', value: 10, appliesTo: [] }).success).toBe(false);
  });
});
