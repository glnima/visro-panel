"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, ExternalLink, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useToast } from "./Toast";
import { Empty, Modal, PageTitle, cardCls, inputCls, labelCls, linkBtn, primaryBtn } from "./ui";
import { DEMO, api, errorMessage, newIssueUrl } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { faDate, faTime } from "@/lib/format";
import { ROLE_LABELS, type Bootstrap, type Feedback, type FeedbackKind, type User } from "@/lib/types";

export const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "یه چیزی درست کار نمی‌کنه",
  idea: "پیشنهاد / ایده",
  other: "سؤال یا موارد دیگه",
};

const SHORT_KIND: Record<FeedbackKind, string> = { bug: "مشکل", idea: "پیشنهاد", other: "سایر" };

function issueText(kind: FeedbackKind, body: string, page: string, who: string) {
  const title = `[${SHORT_KIND[kind]}] ${body.split("\n")[0].slice(0, 60)}`;
  const details = `${body}\n\n---\nبخش: ${page || "—"}\nفرستنده: ${who}`;
  return { title, details };
}

// Header button. In the real app feedback is stored for the admin (no GitHub
// account needed); in the demo there's no shared database, so it opens a
// pre-filled GitHub issue instead.
export function FeedbackButton({ me, page }: { me: User; page: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return toast.error("چند کلمه بنویس که چی شد یا چی می‌خوای");
    if (DEMO) {
      const { title, details } = issueText(kind, body.trim(), page, `${ROLE_LABELS[me.role]} (نسخه‌ی نمایشی)`);
      window.open(newIssueUrl(title, details), "_blank", "noopener");
      setOpen(false);
      setBody("");
      return;
    }
    setBusy(true);
    try {
      await api("POST", "/api/feedback", { kind, body: body.trim(), page });
      toast.ok("ممنون! بازخوردت ثبت شد");
      setOpen(false);
      setBody("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-md border border-[#5C4033] px-2 py-1 hover:bg-[#4A2E22]">
        <MessageSquarePlus size={13} />
        بازخورد
      </button>
      {open && (
        <Modal title="بازخورد" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <p className="text-xs text-[#6B5E4F]">
              هر چیزی که کار رو سخت یا کند می‌کنه، یا هر ایده‌ای داری بنویس — همین‌ها برنامه رو بهتر می‌کنه.
              {DEMO && " (در نسخه‌ی نمایشی، بازخورد توی GitHub ثبت می‌شه.)"}
            </p>
            <label className={labelCls}>
              نوع
              <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} className={inputCls}>
                {(Object.keys(KIND_LABELS) as FeedbackKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              توضیح
              <textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={kind === "bug" ? "چی کار کردی، چی انتظار داشتی، چی شد؟" : "چی کمکت می‌کنه؟"}
                className={inputCls + " resize-none"}
              />
            </label>
            <button type="submit" disabled={busy} className={primaryBtn + " self-start"}>
              {DEMO ? <ExternalLink size={15} /> : <MessageSquarePlus size={15} />}
              {DEMO ? "ادامه در GitHub" : "ارسال"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

// Admin tab: everything employees sent, with a shortcut to file it on GitHub.
export function FeedbackView({ data }: { data: Bootstrap }) {
  const toast = useToast();
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ feedback: Feedback[] }>("GET", "/api/feedback")
      .then((r) => !cancelled && setItems(r.feedback))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [toast, data.version, reload]);

  const toggle = async (f: Feedback) => {
    try {
      await api("PATCH", `/api/feedback/${f.id}`, { done: !f.done });
      setReload((n) => n + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageTitle
        icon={<MessagesSquare size={18} />}
        title="بازخوردها"
        subtitle="پیام‌هایی که کارمندها از دکمه‌ی «بازخورد» فرستادن. «ثبت در GitHub» یه Issue آماده باز می‌کنه برای پیگیری توسعه."
      />
      <div className={cardCls + " overflow-hidden"}>
        {items === null && <Empty>در حال بارگذاری…</Empty>}
        {items?.length === 0 && <Empty>هنوز بازخوردی نیومده</Empty>}
        {items?.map((f) => {
          const { title, details } = issueText(f.kind, f.body, f.page, `${f.user ?? "—"}${f.role ? ` (${ROLE_LABELS[f.role]})` : ""}`);
          return (
            <div key={f.id} className={"px-4 py-3 border-b border-[#E4DCC8] last:border-0 " + (f.done ? "opacity-60" : "")}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                <span className="text-xs">
                  <span className="rounded-full bg-[#EDE6D6] px-2 py-0.5 font-medium">{SHORT_KIND[f.kind]}</span>{" "}
                  <span className="text-[#6B5E4F]">
                    {f.user ?? "—"}
                    {f.role && ` · ${ROLE_LABELS[f.role]}`}
                    {f.page && ` · ${f.page}`}
                  </span>
                </span>
                <span className="text-xs text-[#8A7B60]">
                  {faDate(localDate(f.at))} — {faTime(f.at)}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap">{f.body}</div>
              <div className="mt-2 flex items-center gap-4">
                <button onClick={() => toggle(f)} className={linkBtn}>
                  {f.done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                  {f.done ? "رسیدگی شد" : "علامت رسیدگی"}
                </button>
                <a href={newIssueUrl(title, details)} target="_blank" rel="noreferrer" className={linkBtn}>
                  <ExternalLink size={13} />
                  ثبت در GitHub
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
