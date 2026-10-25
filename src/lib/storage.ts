// Stand-in for Claude's artifact `window.storage` until Phase 2 adds a backend.
// Backed by localStorage, so data is shared between tabs of the same browser
// only. The async API matches the prototype so the call sites stay the same.

export const STORAGE_KEY = "mizan:orders";
export const PRODUCTS_KEY = "mizan:products";

export const storage = {
  async get(key: string): Promise<{ value: string } | null> {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  },
};
