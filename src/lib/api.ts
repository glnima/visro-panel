"use client";

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

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", "x-mizan": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "اتصال به سرور برقرار نشد — اینترنت رو چک کن");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/login") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data.error || "خطای سرور — دوباره امتحان کن");
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "خطای ناشناخته");
