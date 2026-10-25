import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, todayISO } from "./dates";
import { parseDigits } from "./format";

describe("todayISO", () => {
  it("uses Tehran time, not UTC", () => {
    // 22:00 UTC on Oct 24 is 01:30 on Oct 25 in Tehran (UTC+3:30)
    expect(todayISO(new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(todayISO(new Date("2026-10-24T20:00:00Z"))).toBe("2026-10-24");
  });
});

describe("date arithmetic", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-10-20", "2026-10-25")).toBe(5);
    expect(daysBetween("2026-10-25", "2026-10-20")).toBe(-5);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-10-25T00:00")).toBe(false);
  });
});

describe("parseDigits", () => {
  it("accepts Persian digits and thousand separators", () => {
    expect(parseDigits("۴۵٬۰۰۰٬۰۰۰")).toBe(45000000);
    expect(parseDigits("12,500")).toBe(12500);
    expect(parseDigits("12.5")).toBeNaN();
  });
});
