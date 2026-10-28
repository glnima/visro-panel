"use client";

import { useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";
import { inputCls } from "./ui";
import { faDate, faNum } from "@/lib/format";
import { rankMatches, searchKey } from "@/lib/text";
import type { Customer, Order } from "@/lib/types";

type Props = {
  value: string;
  onChange: (name: string) => void;
  customers: Customer[];
  orders: Order[];
};

const MAX_SUGGESTIONS = 8;

// Customer name field: suggests saved customers as you type (ignoring ی/ي,
// half-spaces and digit script) and says whether the name is new.
export default function CustomerInput({ value, onChange, customers, orders }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const m = new Map<number, { count: number; last: string }>();
    for (const o of orders) {
      const s = m.get(o.customerId) ?? { count: 0, last: "" };
      s.count++;
      if (o.orderDate > s.last) s.last = o.orderDate;
      m.set(o.customerId, s);
    }
    return m;
  }, [orders]);

  const matches = useMemo(() => rankMatches(customers, value, (c) => [c.name, c.phone]).slice(0, MAX_SUGGESTIONS), [customers, value]);
  const key = searchKey(value);
  const exact = key ? customers.find((c) => searchKey(c.name) === key) : undefined;
  const showList = open && matches.length > 0 && !(matches.length === 1 && matches[0] === exact && matches[0].name === value.trim());

  const choose = (c: Customer) => {
    onChange(c.name);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === "ArrowDown" && matches.length) {
        setOpen(true);
        setActive(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setActive((i) => (i + 1) % matches.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((i) => (i - 1 + matches.length) % matches.length);
      e.preventDefault();
    } else if (e.key === "Enter") {
      choose(matches[Math.min(active, matches.length - 1)]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
      e.preventDefault();
    }
  };

  const exactStats = exact ? stats.get(exact.id) : undefined;

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => value && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="اسم مشتری رو بنویس — مشتری‌های قبلی پیشنهاد می‌شن"
          className={inputCls + " w-full"}
        />

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute right-0 left-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-[#D9CDB6] bg-[#FBF8F1] p-1 shadow-lg"
          >
            {matches.map((c, i) => {
              const s = stats.get(c.id);
              return (
                <li
                  key={c.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: fires before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={"cursor-pointer rounded-lg px-3 py-2 " + (i === active ? "bg-[#F0E4C8]" : "")}
                >
                  <div className="text-sm font-medium text-[#2B2420]">{c.name}</div>
                  <div className="text-[11px] text-[#8A7B60]">
                    {[
                      c.phone && <span key="p" dir="ltr">{c.phone}</span>,
                      s ? `${faNum(s.count)} سفارش` : "بدون سفارش",
                      s?.last && `آخرین: ${faDate(s.last)}`,
                    ]
                      .filter(Boolean)
                      .map((part, j) => (
                        <span key={j}>
                          {j > 0 && " — "}
                          {part}
                        </span>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {value.trim() && (
        <div className="mt-1 flex items-center gap-1 text-[11px]">
          {exact ? (
            <span className="flex items-center gap-1 text-[#166534]">
              <CheckCircle2 size={12} />
              مشتری ثبت‌شده{exactStats ? ` — ${faNum(exactStats.count)} سفارش قبلی` : ""}
            </span>
          ) : matches.length > 0 ? (
            <span className="text-[#8A7B60]">از لیست انتخاب کن، یا ادامه بده برای مشتری جدید</span>
          ) : (
            <span className="flex items-center gap-1 text-[#7A5E28]">
              <UserPlus size={12} />
              مشتری جدید — با ثبت سفارش به لیست مشتری‌ها اضافه می‌شه
            </span>
          )}
        </div>
      )}
    </div>
  );
}
