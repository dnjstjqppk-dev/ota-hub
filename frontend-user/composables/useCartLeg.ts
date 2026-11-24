/** GAP-07: pure cart-leg quote builder (no framework imports — unit-tested). */

export interface LegQuoteInput {
  domain: string
  itemId: string
  unitId?: string | null
  ratePlanId?: string
  startDate?: string
  endDate?: string
  returnDate?: string
  returnItemId?: string
  rooms?: number
  adults: number
  children?: number
  infants?: number
  slotStart?: string
  title: string
}

/** Card state → POST /quotes body. */
export function buildLegQuoteBody(i: LegQuoteInput): Record<string, unknown> {
  return {
    domain: i.domain,
    itemId: i.itemId,
    ...(i.unitId ? { unitId: i.unitId } : {}),
    ...(i.ratePlanId ? { ratePlanId: i.ratePlanId } : {}),
    ...(i.startDate ? { startDate: i.startDate } : {}),
    ...(i.endDate ? { endDate: i.endDate } : {}),
    ...(i.returnDate ? { returnDate: i.returnDate } : {}),
    ...(i.returnItemId ? { returnItemId: i.returnItemId } : {}),
    ...(typeof i.rooms === 'number' ? { rooms: i.rooms } : {}),
    travelers: { adults: i.adults, ...(i.children ? { children: i.children } : {}), ...(i.infants ? { infants: i.infants } : {}) },
    ...(i.slotStart ? { slotStart: i.slotStart } : {}),
  }
}
