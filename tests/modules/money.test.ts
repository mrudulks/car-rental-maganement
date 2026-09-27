import { describe, expect, it } from 'vitest'
import {
  toPaise,
  fromPaise,
  roundHalfUp,
  splitGst,
  sumAmounts,
  lineAmount,
} from '@/server/modules/billing/money'

describe('paise conversion', () => {
  it('round-trips amounts exactly', () => {
    for (const amount of ['0.00', '1.00', '1500.50', '99999.99', '0.01']) {
      expect(fromPaise(toPaise(amount))).toBe(amount)
    }
  })

  it('pads a single decimal place', () => {
    expect(toPaise('1500.5')).toBe(150050)
    expect(toPaise('1500')).toBe(150000)
  })

  it('handles negatives, for refunds', () => {
    expect(toPaise('-250.75')).toBe(-25075)
    expect(fromPaise(-25075)).toBe('-250.75')
  })

  it('refuses anything that is not money, rather than returning NaN', () => {
    for (const bad of ['', 'free', '1.234', '1,500', '1.2.3']) {
      expect(() => toPaise(bad)).toThrow(/Not a money amount/)
    }
  })
})

describe('rounding', () => {
  it('rounds half away from zero in both directions', () => {
    expect(roundHalfUp(0.5)).toBe(1)
    expect(roundHalfUp(1.5)).toBe(2)
    expect(roundHalfUp(-0.5)).toBe(-1)
    expect(roundHalfUp(-1.5)).toBe(-2)
    expect(roundHalfUp(2.4)).toBe(2)
  })
})

describe('GST', () => {
  it('splits a clean amount evenly', () => {
    // 1500.00 at 18% -> 270.00 tax, 135.00 each half.
    expect(splitGst(150000, 18)).toEqual({
      taxable: 150000,
      cgst: 13500,
      sgst: 13500,
      tax: 27000,
      total: 177000,
    })
  })

  it('always gives CGST and SGST as equal halves', () => {
    // 1500.50 at 18% would be 270.09 tax; halved it is 135.045, which must not leave
    // the two halves unequal on an intra-state invoice.
    const split = splitGst(150050, 18)
    expect(split.cgst).toBe(split.sgst)
    expect(split.tax).toBe(split.cgst + split.sgst)
    expect(split.total).toBe(split.taxable + split.tax)
  })

  it('works at each rate a rental business might be registered for', () => {
    expect(splitGst(100000, 5).tax).toBe(5000)
    expect(splitGst(100000, 12).tax).toBe(12000)
    expect(splitGst(100000, 18).tax).toBe(18000)
  })

  it('charges nothing at zero percent', () => {
    expect(splitGst(150000, 0)).toMatchObject({ cgst: 0, sgst: 0, tax: 0, total: 150000 })
  })

  it('refuses a nonsense rate', () => {
    expect(() => splitGst(1000, -1)).toThrow(/Not a GST rate/)
    expect(() => splitGst(1000, 101)).toThrow(/Not a GST rate/)
  })

  it('keeps the total exact across many lines', () => {
    // Summing rounded per-line tax must equal the sum of the parts, with no drift.
    const lines = [150050, 40033, 210017, 99999]
    const splits = lines.map((l) => splitGst(l, 18))
    const taxable = splits.reduce((t, s) => t + s.taxable, 0)
    const tax = splits.reduce((t, s) => t + s.tax, 0)
    const total = splits.reduce((t, s) => t + s.total, 0)
    expect(total).toBe(taxable + tax)
  })
})

describe('totals', () => {
  it('sums without floating point drift', () => {
    // 0.1 + 0.2 is the classic float failure; in paise it cannot happen.
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30')
    expect(sumAmounts(['1500.50', '400.33', '2100.17'])).toBe('4001.00')
    expect(sumAmounts([])).toBe('0.00')
  })

  it('multiplies a fractional quantity correctly', () => {
    expect(lineAmount(3, '1500.50')).toBe('4501.50')
    expect(lineAmount('2.5', '1000.00')).toBe('2500.00')
    expect(lineAmount(1, '0.01')).toBe('0.01')
  })
})
