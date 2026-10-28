"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, KeyRound, Plus, Settings, Trash2, UserPlus } from "lucide-react";
import { stationIcons } from "./stationIcons";
import { useToast } from "./Toast";
import { Modal, PageTitle, cardCls, inputCls, labelCls, linkBtn, primaryBtn, secondaryBtn } from "./ui";
import { api, errorMessage } from "@/lib/api";
import { parseDigits } from "@/lib/format";
import { ROLE_LABELS, type Bootstrap, type Category, type Role, type Station, type User } from "@/lib/types";

type Props = { data: Bootstrap; refresh: () => Promise<void> };

export default function SettingsView({ data, refresh }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <PageTitle icon={<Settings size={18} />} title="تنظیمات" subtitle="فقط مدیر این بخش رو می‌بینه" />
      <StationsSection stations={data.stations} refresh={refresh} />
      <CategoriesSection categories={data.categories} refresh={refresh} />
      <UsersSection me={data.me} />
    </div>
  );
}

function StationRow({ station, refresh }: { station: Station; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [label, setLabel] = useState(station.label);
  const [capacity, setCapacity] = useState(String(station.capacity));
  const Icon = stationIcons[station.key];
  const dirty = label !== station.label || capacity !== String(station.capacity);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const n = parseDigits(capacity);
      if (!(n >= 1)) throw new Error("ظرفیت باید یه عدد مثبت باشه");
      await api("PATCH", `/api/stations/${station.key}`, { label, capacity: n });
      await refresh();
      toast.ok(`ایستگاه «${label}» ذخیره شد`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={save} className="flex items-end gap-3 flex-wrap px-4 py-3 border-b border-[#E4DCC8] last:border-0">
      <Icon size={18} className="text-[#6B5E4F] mb-2.5" />
      <label className={labelCls + " flex-1 min-w-32"}>
        نام
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
      </label>
      <label className={labelCls}>
        ظرفیت
        <input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls + " w-20"} />
      </label>
      <button type="submit" disabled={!dirty} className={secondaryBtn}>
        <Check size={14} />
        ذخیره
      </button>
    </form>
  );
}

function StationsSection({ stations, refresh }: { stations: Station[]; refresh: () => Promise<void> }) {
  return (
    <section>
      <h2 className="text-sm font-bold mb-1">ایستگاه‌های کارگاه</h2>
      <p className="text-xs text-[#6B5E4F] mb-3">
        ظرفیت یعنی چند کار هم‌زمان؛ از ۶۰٪ نوار زرد و از ۱۰۰٪ قرمز می‌شه. ترتیب مراحل ثابته و فقط نام و ظرفیت قابل تغییره.
      </p>
      <div className={cardCls + " overflow-hidden"}>
        {stations.map((s) => (
          <StationRow key={`${s.key}-${s.label}-${s.capacity}`} station={s} refresh={refresh} />
        ))}
      </div>
    </section>
  );
}

function CategoriesSection({ categories, refresh }: { categories: Category[]; refresh: () => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<Category | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast.ok(ok);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  return (
    <section>
      <h2 className="text-sm font-bold mb-3">دسته‌های محصول</h2>
      <div className={cardCls + " p-4"}>
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-full border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-1 text-sm">
              <button onClick={() => setRenaming({ ...c })} title="تغییر نام">
                {c.name}
              </button>
              <button
                onClick={() => run(() => api("DELETE", `/api/categories/${c.id}`), `دسته «${c.name}» حذف شد`)}
                aria-label={`حذف ${c.name}`}
                className="text-[#8A7B60] hover:text-[#8A3C2F]"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("POST", "/api/categories", { name }), `دسته «${name.trim()}» اضافه شد`)) setName("");
          }}
          className="flex gap-2"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="دسته‌ی جدید" className={inputCls + " flex-1"} />
          <button type="submit" className={secondaryBtn}>
            <Plus size={14} />
            افزودن
          </button>
        </form>
      </div>
      {renaming && (
        <Modal title="تغییر نام دسته" onClose={() => setRenaming(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("PATCH", `/api/categories/${renaming.id}`, { name: renaming.name }), "دسته ذخیره شد")) setRenaming(null);
            }}
            className="flex flex-col gap-3"
          >
            <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={inputCls} />
            <button type="submit" className={primaryBtn + " self-start"}>
              ذخیره
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

type UserDraft = { id: number | null; username: string; displayName: string; role: Role; active: boolean; password: string };

function UsersSection({ me }: { me: User }) {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState<UserDraft | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: User[] }>("GET", "/api/users")).users);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    api<{ users: User[] }>("GET", "/api/users")
      .then((r) => !cancelled && setUsers(r.users))
      .catch((err) => !cancelled && toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    try {
      if (draft.id === null) {
        await api("POST", "/api/users", draft);
      } else {
        const body: Record<string, unknown> = { displayName: draft.displayName, role: draft.role, active: draft.active };
        if (draft.password) body.password = draft.password;
        await api("PATCH", `/api/users/${draft.id}`, body);
      }
      await load();
      toast.ok(draft.id === null ? `کاربر ${draft.username} ساخته شد` : "کاربر ذخیره شد");
      setDraft(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold">کاربران</h2>
        <button
          onClick={() => setDraft({ id: null, username: "", displayName: "", role: "store", active: true, password: "" })}
          className={secondaryBtn}
        >
          <UserPlus size={14} />
          کاربر جدید
        </button>
      </div>
      <p className="text-xs text-[#6B5E4F] mb-3">
        فروشگاه: سفارش‌ها، قیمت‌ها و مشتری‌ها · کارگاه: خط تولید بدون قیمت · مدیر: همه‌چیز به‌علاوه‌ی محصولات، تنظیمات و گزارش رویدادها
      </p>
      <div className={cardCls + " overflow-hidden"}>
        {users.map((u) => (
          <div key={u.id} className={"px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap " + (u.active ? "" : "opacity-60")}>
            <div>
              <span className="text-sm font-medium">{u.displayName}</span>
              <span className="text-xs text-[#6B5E4F] ms-1.5" dir="ltr">@{u.username}</span>
              {u.id === me.id && <span className="text-xs text-[#9C7A3C]"> (خودت)</span>}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="rounded-full bg-[#EDE6D6] px-2 py-0.5">{ROLE_LABELS[u.role]}</span>
              {!u.active && <span className="text-[#8A3C2F]">غیرفعال</span>}
              <button onClick={() => setDraft({ ...u, password: "" })} className={linkBtn}>
                <KeyRound size={13} />
                ویرایش
              </button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <Modal title={draft.id === null ? "کاربر جدید" : `ویرایش ${draft.displayName}`} onClose={() => setDraft(null)}>
          <form onSubmit={save} className="flex flex-col gap-3">
            {draft.id === null && (
              <label className={labelCls}>
                نام کاربری (انگلیسی، برای ورود)
                <input dir="ltr" autoCapitalize="none" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} className={inputCls} />
              </label>
            )}
            <label className={labelCls}>
              نام نمایشی
              <input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} className={inputCls} />
            </label>
            <label className={labelCls}>
              نقش
              <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} className={inputCls}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {draft.id === null ? "رمز عبور (حداقل ۸ حرف)" : "رمز عبور جدید (خالی بذار تا عوض نشه)"}
              <input dir="ltr" type="password" autoComplete="new-password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={inputCls} />
            </label>
            {draft.id !== null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                فعال (کاربر غیرفعال نمی‌تونه وارد بشه)
              </label>
            )}
            <button type="submit" className={primaryBtn + " self-start"}>
              ذخیره
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
