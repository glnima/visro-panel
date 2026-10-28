"use client";

// Build-time flags, inlined by Next.
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/glnima/visro-panel";

// Prefixes app paths for plain <a href> links (GitHub Pages serves under /<repo>).
export const withBase = (path: string) => BASE_PATH + path;

// The static demo uses trailing-slash URLs (print/index.html); the server doesn't.
export const printUrl = (code: string) => withBase(`/print${DEMO ? "/" : ""}?code=${encodeURIComponent(code)}`);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// Fired when the session has expired so the app can show the login screen.
export const UNAUTHORIZED_EVENT = "mizan:unauthorized";

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  if (DEMO) {
    const { demoFetch } = await import("@/demo/runtime");
    return demoFetch(method, path, body);
  }
  return fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-mizan": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body);
  } catch {
    throw new ApiError(0, DEMO ? "بارگذاری نسخه‌ی نمایشی ناموفق بود — صفحه رو تازه کن" : "اتصال به سرور برقرار نشد — اینترنت رو چک کن");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data.error || "خطای سرور — دوباره امتحان کن");
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "خطای ناشناخته");

export function newIssueUrl(title: string, details: string): string {
  const q = new URLSearchParams({ template: "feedback.yml", title, details });
  return `${REPO_URL}/issues/new?${q}`;
}
