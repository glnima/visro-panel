"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import MizanApp from "./MizanApp";
import { ToastProvider } from "./Toast";
import { inputCls, labelCls, primaryBtn } from "./ui";
import { InstallButton } from "./AppInstall";
import { ApiError, DEMO, REPO_URL, UNAUTHORIZED_EVENT, api, errorMessage } from "@/lib/api";
import { disablePush, enablePush, registerServiceWorker } from "@/lib/pwa";
import { ROLES, ROLE_LABELS, type User } from "@/lib/types";

// Offer to save the login in the browser / phone password manager (Chromium;
// Safari and Firefox pick it up from the form's autocomplete attributes).
function rememberLogin(username: string, password: string, name: string) {
  const PC = (
    window as unknown as {
      PasswordCredential?: new (d: { id: string; password: string; name: string }) => Credential;
    }
  ).PasswordCredential;
  if (!PC || !username || !password) return;
  navigator.credentials.store(new PC({ id: username, password, name })).catch(() => {});
}

type Session = { me: User | null; needsSetup: boolean };

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      setSession(await api<Session>("GET", "/api/session"));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<Session>("GET", "/api/session")
      .then((s) => !cancelled && setSession(s))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    const onUnauthorized = () => setSession((s) => (s ? { ...s, me: null } : s));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  if (!session) {
    return (
      <Shell>
        {error ? (
          <div className="text-sm text-[#8A3C2F]">
            {error}{" "}
            <button onClick={check} className="underline">
              دوباره
            </button>
          </div>
        ) : (
          <div className="text-sm text-[#6B5E4F]">در حال بارگذاری…</div>
        )}
      </Shell>
    );
  }

  if (!session.me) {
    return (
      <Shell>
        <AuthForm setup={session.needsSetup} onDone={(me) => setSession({ me, needsSetup: false })} />
      </Shell>
    );
  }

  return (
    <ToastProvider>
      <MizanApp
        me={session.me}
        onLogout={async () => {
          // a shared shop tablet shouldn't keep getting the previous person's notifications
          await disablePush().catch(() => {});
          await api("POST", "/api/logout").catch(() => {});
          setSession({ me: null, needsSetup: false });
        }}
      />
    </ToastProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-[#3B241A]">میزان</div>
          <div className="text-xs text-[#6B5E4F] mt-1">هماهنگی فروش و تولید مبل</div>
        </div>
        <div className="w-full max-w-sm rounded-2xl border border-[#D9CDB6] bg-[#F7F2E7] p-6 shadow-sm">{children}</div>
        <div className="mt-4">
          <InstallButton compact />
        </div>
      </div>
    </ToastProvider>
  );
}

function AuthForm({ setup, onDone }: { setup: boolean; onDone: (me: User) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent | null, as?: { username: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { me } = await api<{ me: User }>(
        "POST",
        setup ? "/api/setup" : "/api/login",
        setup ? { username, displayName, password } : (as ?? { username, password }),
      );
      rememberLogin(username, password, me.displayName);
      // this device already allowed notifications: subscribe it for the person who just logged in
      if (!DEMO && "Notification" in window && Notification.permission === "granted") enablePush().catch(() => {});
      onDone(me);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h1 className="text-sm font-bold">{setup ? "راه‌اندازی — ساخت حساب مدیر" : "ورود"}</h1>
      {DEMO && !setup && (
        <div className="rounded-lg bg-[#FEF3C7] border border-[#FCD34D] p-3 text-xs text-[#78350F]">
          <div className="mb-2">
            این نسخه‌ی نمایشیه. با یکی از نقش‌ها وارد شو و همه‌چیز رو امتحان کن — داده‌ها فقط توی مرورگر خودت می‌مونه.{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline">
              کد پروژه
            </a>
          </div>
          <div className="mb-1.5 font-semibold">ورود به‌عنوان:</div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => submit(null, { username: r, password: "demo1234" })}
                className="rounded-md bg-[#3B241A] text-[#F3EEE1] px-3 py-1.5 font-medium disabled:opacity-60"
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          {busy && <div className="mt-2">بار اول چند ثانیه طول می‌کشه تا پایگاه داده توی مرورگر آماده بشه…</div>}
        </div>
      )}
      {setup && (
        <p className="text-xs text-[#6B5E4F]">
          اولین بار است که برنامه اجرا می‌شه. حساب مدیر رو بساز؛ بعداً از بخش تنظیمات برای کارمندها حساب جدا بساز.
        </p>
      )}
      <label className={labelCls}>
        نام کاربری
        <input
          dir="ltr"
          autoCapitalize="none"
          autoComplete="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputCls}
        />
      </label>
      {setup && (
        <label className={labelCls}>
          نام نمایشی
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="مثلاً مدیر فروشگاه"
            className={inputCls}
          />
        </label>
      )}
      <label className={labelCls}>
        رمز عبور{setup && " (حداقل ۸ حرف)"}
        <input
          dir="ltr"
          type="password"
          autoComplete={setup ? "new-password" : "current-password"}
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </label>
      {error && <div className="text-xs text-[#DC2626]">{error}</div>}
      <button type="submit" disabled={busy} className={primaryBtn}>
        <LogIn size={15} />
        {setup ? "ساخت حساب و ورود" : "ورود"}
      </button>
    </form>
  );
}
