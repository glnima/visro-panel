import { describe, expect, it } from "vitest";
import { normalizeName, rankMatches, searchKey } from "./text";

describe("normalizeName", () => {
  it("turns Arabic letters into Persian and tidies spaces", () => {
    expect(normalizeName("  بوتيك   مبلمان  الوند ")).toBe("بوتیک مبلمان الوند");
    expect(normalizeName("كاشي")).toBe("کاشی");
  });
});

describe("searchKey", () => {
  it("ignores half-spaces and digit script", () => {
    expect(searchKey("رویه‌کوب")).toBe(searchKey("رویهکوب"));
    expect(searchKey("۰۹۱۲ ۳۴۵")).toBe("0912345");
  });
});

describe("rankMatches", () => {
  const people = [
    { name: "فروشگاه رویا", phone: "09121111111" },
    { name: "بوتیک مبلمان الوند", phone: "۰۹۳۵۲۲۲۲۲۲۲" },
    { name: "دکوراسیون ماهور", phone: "" },
    { name: "مبل رویال", phone: "" },
  ];
  const fields = (p: (typeof people)[number]) => [p.name, p.phone];
  const names = (q: string) => rankMatches(people, q, fields).map((p) => p.name);

  it("puts names starting with the query first, then word starts, then anywhere", () => {
    expect(names("مبل")).toEqual(["مبل رویال", "بوتیک مبلمان الوند"]);
    expect(names("روی")).toEqual(["فروشگاه رویا", "مبل رویال"]);
  });

  it("matches across Arabic/Persian letters and phone digits", () => {
    expect(names("بوتيك")).toEqual(["بوتیک مبلمان الوند"]);
    expect(names("0935")).toEqual(["بوتیک مبلمان الوند"]);
    expect(names("۰۹۱۲")).toEqual(["فروشگاه رویا"]);
  });

  it("returns nothing for an empty query", () => {
    expect(names("  ")).toEqual([]);
  });
});
