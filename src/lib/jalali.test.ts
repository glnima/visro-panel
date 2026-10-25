import { describe, expect, it } from "vitest";
import {
  daysInJalaliMonth,
  gregorianToJalali,
  isJalaliLeap,
  isoToJalali,
  jalaliToGregorian,
  jalaliToIso,
} from "./jalali";

describe("gregorianToJalali", () => {
  it.each([
    ["2023-03-21", [1402, 1, 1]],
    ["2024-03-20", [1403, 1, 1]],
    ["2025-03-20", [1403, 12, 30]],
    ["2025-03-21", [1404, 1, 1]],
    ["2025-09-23", [1404, 7, 1]],
    ["2026-10-25", [1405, 8, 3]],
  ])("%s → %j", (iso, expected) => {
    expect(isoToJalali(iso)).toEqual(expected);
  });
});

describe("jalaliToGregorian", () => {
  it("converts Nowruz 1404", () => {
    expect(jalaliToGregorian(1404, 1, 1)).toEqual([2025, 3, 21]);
  });

  it("formats as zero-padded ISO", () => {
    expect(jalaliToIso(1403, 1, 1)).toBe("2024-03-20");
  });
});

describe("round trip", () => {
  it("is lossless for every day from 2020 to 2030", () => {
    const d = new Date(Date.UTC(2020, 0, 1));
    const end = Date.UTC(2031, 0, 1);
    while (d.getTime() < end) {
      const [gy, gm, gd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
      expect(jalaliToGregorian(jy, jm, jd)).toEqual([gy, gm, gd]);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  });
});

describe("leap years and month lengths", () => {
  it("knows which years are leap", () => {
    expect(isJalaliLeap(1399)).toBe(true);
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1404)).toBe(false);
  });

  it("gives month lengths", () => {
    expect(daysInJalaliMonth(1404, 1)).toBe(31);
    expect(daysInJalaliMonth(1404, 7)).toBe(30);
    expect(daysInJalaliMonth(1404, 12)).toBe(29);
    expect(daysInJalaliMonth(1403, 12)).toBe(30);
  });
});
