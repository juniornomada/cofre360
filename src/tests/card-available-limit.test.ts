import { describe, expect, it } from "vitest";
import {
  getCardAvailableLimit,
  getCurrentAndFutureOutstanding,
} from "@/lib/card-available-limit";

describe("card available limit", () => {
  it("matches Mercado Pago when only the payment from the current invoice restores limit", () => {
    const periods = [
      {
        key: "past_1",
        endDate: new Date("2026-09-12T00:00:00.000Z"),
        total: 2746.25,
      },
      {
        key: "current",
        endDate: new Date("2026-10-12T00:00:00.000Z"),
        total: 2340.46,
      },
      {
        key: "future_1",
        endDate: new Date("2026-11-12T00:00:00.000Z"),
        total: 2669.9,
      },
    ];

    const paymentsByPeriod = {
      "2026-09-12": 2746.25,
      "2026-10-12": 15,
    };

    expect(getCurrentAndFutureOutstanding(periods, paymentsByPeriod)).toBe(4995.36);
    expect(getCardAvailableLimit(5000, periods, paymentsByPeriod)).toBe(4.64);
  });

  it("does not let historical invoice payments inflate the available limit", () => {
    const periods = [
      {
        key: "current",
        endDate: new Date("2026-10-12T00:00:00.000Z"),
        total: 5010.36,
      },
    ];

    const paymentsByPeriod = {
      "2026-09-12": 2746.25,
      "2026-10-12": 15,
    };

    expect(getCardAvailableLimit(5000, periods, paymentsByPeriod)).toBe(4.64);
  });

  it("can be negative when future commitments exceed the card limit", () => {
    const periods = [
      {
        key: "current",
        endDate: new Date("2026-10-12T00:00:00.000Z"),
        total: 5100,
      },
    ];

    expect(getCardAvailableLimit(5000, periods, {})).toBe(-100);
  });

  it("keeps the summary invariant: available = limit - current/future outstanding", () => {
    const periods = [
      {
        key: "current",
        endDate: new Date("2026-10-03T00:00:00.000Z"),
        total: 5980.49,
      },
    ];

    expect(getCardAvailableLimit(6000, periods, {})).toBe(19.51);
  });
});
