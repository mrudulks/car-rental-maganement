/**
 * Money arithmetic in integer paise.
 *
 * Every amount crossing this module is a decimal string as the database stores it
 * ("1500.50"). Converting to paise for the arithmetic and back at the end keeps the
 * totals exact -- GST across several lines is precisely where floating point produces
 * invoices that are a paisa out and impossible to explain to a customer.
 */

/** "1500.50" -> 150050. Throws rather than silently producing NaN. */
export function toPaise(amount: string | number): number {
  const text = String(amount).trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Not a money amount: ${JSON.stringify(amount)}`)
  }
  const negative = text.startsWith('-')
  const [rupees, fraction = ''] = text.replace('-', '').split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -paise : paise
}

/** 150050 -> "1500.50", always two decimal places. */
export function fromPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error(`Paise must be a whole number: ${paise}`)
  const negative = paise < 0
  const absolute = Math.abs(paise)
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
  return negative ? `-${text}` : text
}

/**
 * Round half away from zero, which is what a person doing this by hand would write.
 * `Math.round` rounds .5 towards positive infinity, so -0.5 becomes -0 rather than -1.
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export type GstSplit = {
  taxable: number
  cgst: number
  sgst: number
  tax: number
  total: number
}

/**
 * Intra-state GST: the rate is split evenly between CGST and SGST, and each half is
 * rounded on its own. Computing the whole tax and halving it can leave the two unequal,
 * which an invoice should never show for a same-state supply.
 *
 * All values are paise; `ratePercent` is the full GST rate (18 means 18%).
 */
export function splitGst(taxablePaise: number, ratePercent: number | string): GstSplit {
  const rate = Number(ratePercent)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error(`Not a GST rate: ${ratePercent}`)
  }

  const half = roundHalfUp((taxablePaise * rate) / 200)
  return {
    taxable: taxablePaise,
    cgst: half,
    sgst: half,
    tax: half * 2,
    total: taxablePaise + half * 2,
  }
}

/** Sum decimal-string amounts without ever leaving integer arithmetic. */
export function sumAmounts(amounts: Array<string | number>): string {
  return fromPaise(amounts.reduce<number>((total, a) => total + toPaise(a), 0))
}

/** quantity x unitAmount, rounded to the paisa. Quantity may be fractional (2.5 days). */
export function lineAmount(quantity: string | number, unitAmount: string | number): string {
  return fromPaise(roundHalfUp(Number(quantity) * toPaise(unitAmount)))
}
