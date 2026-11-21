import { describe, expect, it } from "vitest";
import { isCheckoutPaid } from "./payment-status";

describe("isCheckoutPaid", () => {
  it("normale Zahlung", () => {
    expect(isCheckoutPaid({ payment_status: "paid", amount_total: 24900 })).toBe(true);
  });
  it("100-%-Rabattcode", () => {
    expect(isCheckoutPaid({ payment_status: "no_payment_required", amount_total: 0 })).toBe(true);
  });
  it("no_payment_required mit offenem Betrag zählt nicht", () => {
    expect(isCheckoutPaid({ payment_status: "no_payment_required", amount_total: 24900 })).toBe(false);
    expect(isCheckoutPaid({ payment_status: "no_payment_required", amount_total: null })).toBe(false);
  });
  it("verzögerte Zahlung ist noch nicht bezahlt", () => {
    expect(isCheckoutPaid({ payment_status: "unpaid", amount_total: 24900 })).toBe(false);
  });
});
