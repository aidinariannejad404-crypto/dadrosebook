import type { OfflineLicense } from "./types";

/**
 * Encrypted local store for offline EPUB reading (Phase 6b, docs/api-contract.md «Offline reading»).
 *
 * IndexedDB database "dadrose-offline" with four object stores (out-of-line string keys):
 * - `keys`  — "aes": this browser's AES-GCM CryptoKey, generated with `extractable: false` and kept
 *             as a CryptoKey object (structured clone); it is never exported.
 * - `books` — per slug: the license (id, expiry, title) in clear plus `iv` + ciphertext of the
 *             JSON package (book info + every chapter, images as data: URIs).
 * - `state` — per slug, encrypted: the last known progress, highlights, bookmarks and copy quota.
 * - `queue` — per slug, encrypted: writes made offline, replayed when the network is back.
 *
 * Every ciphertext is bound to its store and slug with AES-GCM additional data, so a record cannot
 * be moved to another book. A missing IndexedDB / crypto.subtle (private windows, old browsers)
 * makes `getOfflineStore()` resolve to null: the caller says «offline not available» and reads online.
 *
 * The storage and the cipher sit behind small interfaces so the logic is unit-tested in Node with an
 * in-memory adapter (`memoryAdapter`) and the real WebCrypto.
 */

export const OFFLINE_DB_NAME = "dadrose-offline";
export const OFFLINE_DB_VERSION = 1;
export const RECORD_VERSION = 1;
/** Renew the license silently when fewer than this many days are left. */
export const RENEW_MARGIN_MS = 3 * 24 * 60 * 60 * 1000;

export type StoreName = "keys" | "books" | "state" | "queue";
export const STORE_NAMES: StoreName[] = ["keys", "books", "state", "queue"];

/** Key/value storage (IndexedDB in the browser, a Map in tests). */
export interface KvAdapter {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  /** Insert only when the key is absent; false when it already exists. */
  add(store: StoreName, key: string, value: unknown): Promise<boolean>;
  delete(store: StoreName, key: string): Promise<void>;
  entries<T>(store: StoreName): Promise<[string, T][]>;
}

/** Local copy of the license (no personal data beyond what the account page shows). */
export interface StoredLicense {
  id: number;
  book: string;
  title: string;
  expires_at: string;
}

type Bytes = Uint8Array<ArrayBuffer>;

export interface EncryptedBlob {
  iv: Bytes;
  data: ArrayBuffer;
}

export interface BookRecord extends EncryptedBlob {
  v: number;
  slug: string;
  license: StoredLicense;
  savedAt: string;
}

export interface SavedMeta {
  slug: string;
  license: StoredLicense;
  savedAt: string;
}

/* ---------- pure helpers (unit-tested) ---------- */

/** True when `expiresAt` is in the past (or unparseable). */
export function isExpired(expiresAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return true;
  return now >= t;
}

/** True when the license is still valid but ends within `marginMs` (default 3 days). */
export function needsRenewal(expiresAt: string, now: number = Date.now(), marginMs = RENEW_MARGIN_MS): boolean {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return now < t && t - now < marginMs;
}

export function toStoredLicense(l: Pick<OfflineLicense, "id" | "book" | "title" | "expires_at">): StoredLicense {
  return { id: l.id, book: l.book, title: l.title, expires_at: l.expires_at };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Versioned JSON → bytes. */
export function encodePayload(payload: unknown): Bytes {
  return encoder.encode(JSON.stringify({ v: RECORD_VERSION, payload }));
}

/** Bytes → payload, or null when the bytes are not a payload of this version. */
export function decodePayload<T = unknown>(bytes: ArrayBuffer | Uint8Array): T | null {
  try {
    const parsed: unknown = JSON.parse(decoder.decode(bytes));
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as { v?: unknown; payload?: unknown };
    if (rec.v !== RECORD_VERSION || !("payload" in rec)) return null;
    return rec.payload as T;
  } catch {
    return null;
  }
}

/** Additional authenticated data: binds a ciphertext to its store and book. */
export function aadFor(store: StoreName, slug: string): Bytes {
  return encoder.encode(`dadrose-offline:v${RECORD_VERSION}:${store}:${slug}`);
}

function isStoredLicense(v: unknown): v is StoredLicense {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return typeof l.id === "number" && typeof l.expires_at === "string" && typeof l.book === "string";
}

function isBookRecord(v: unknown): v is BookRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    r.v === RECORD_VERSION &&
    typeof r.slug === "string" &&
    typeof r.savedAt === "string" &&
    isStoredLicense(r.license) &&
    r.iv instanceof Uint8Array &&
    (r.data instanceof ArrayBuffer || ArrayBuffer.isView(r.data))
  );
}

/* ---------- cipher ---------- */

export interface Cipher {
  encrypt(plain: Bytes, aad: Bytes): Promise<EncryptedBlob>;
  /** Throws when the key, iv, aad or data do not match (AES-GCM authentication). */
  decrypt(blob: EncryptedBlob, aad: Bytes): Promise<Bytes>;
}

const KEY_ID = "aes";

function subtle(): SubtleCrypto | null {
  try {
    return typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;
  } catch {
    return null;
  }
}

/** The browser's AES-GCM key: read it, or create a non-extractable one (first writer wins across tabs). */
export async function loadOrCreateKey(kv: KvAdapter): Promise<CryptoKey> {
  const s = subtle();
  if (!s) throw new Error("crypto.subtle unavailable");
  const existing = await kv.get<CryptoKey>("keys", KEY_ID);
  if (existing) return existing;
  const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  if (await kv.add("keys", KEY_ID, key)) return key;
  const winner = await kv.get<CryptoKey>("keys", KEY_ID);
  if (!winner) throw new Error("offline key missing");
  return winner;
}

/** AES-GCM-256 with a fresh 96-bit IV per record. */
export function webCryptoCipher(kv: KvAdapter): Cipher {
  let keyPromise: Promise<CryptoKey> | null = null;
  const key = () => {
    keyPromise ??= loadOrCreateKey(kv).catch((e) => {
      keyPromise = null;
      throw e;
    });
    return keyPromise;
  };
  return {
    async encrypt(plain, aad) {
      const s = subtle();
      if (!s) throw new Error("crypto.subtle unavailable");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await s.encrypt({ name: "AES-GCM", iv, additionalData: aad }, await key(), plain);
      return { iv, data };
    },
    async decrypt(blob, aad) {
      const s = subtle();
      if (!s) throw new Error("crypto.subtle unavailable");
      const out = await s.decrypt({ name: "AES-GCM", iv: blob.iv, additionalData: aad }, await key(), blob.data);
      return new Uint8Array(out);
    },
  };
}

/* ---------- store ---------- */

export interface LoadedPackage<P> {
  license: StoredLicense;
  savedAt: string;
  payload: P;
}

export interface OfflineStore {
  /** Encrypt and keep the book package (replaces an older copy). */
  savePackage(slug: string, license: StoredLicense, payload: unknown, now?: number): Promise<void>;
  /** The decrypted package, or null (and the copy is deleted) when it is missing, expired or unreadable. */
  loadPackage<P = unknown>(slug: string, now?: number): Promise<LoadedPackage<P> | null>;
  /** The license of the local copy without decrypting it (null when missing/expired). */
  getMeta(slug: string, now?: number): Promise<SavedMeta | null>;
  /** Update the stored license (renewed elsewhere / new expiry) without touching the package. */
  updateLicense(slug: string, license: StoredLicense): Promise<void>;
  /** Delete the package and the cached reading state (the write queue is kept until it is replayed). */
  deletePackage(slug: string): Promise<void>;
  /** Metadata of every live local copy; expired ones are deleted on the way. */
  listPackages(now?: number): Promise<SavedMeta[]>;
  /** Encrypted per-book JSON documents («state», «queue»). */
  readDoc<T>(store: "state" | "queue", slug: string): Promise<T | null>;
  writeDoc(store: "state" | "queue", slug: string, value: unknown): Promise<void>;
  deleteDoc(store: "state" | "queue", slug: string): Promise<void>;
}

export function createOfflineStore(kv: KvAdapter, cipher: Cipher = webCryptoCipher(kv)): OfflineStore {
  const purge = async (slug: string) => {
    await kv.delete("books", slug);
    await kv.delete("state", slug);
  };

  const store: OfflineStore = {
    async savePackage(slug, license, payload, now = Date.now()) {
      const blob = await cipher.encrypt(encodePayload(payload), aadFor("books", slug));
      const rec: BookRecord = {
        v: RECORD_VERSION,
        slug,
        license: toStoredLicense(license),
        savedAt: new Date(now).toISOString(),
        iv: blob.iv,
        data: blob.data,
      };
      await kv.put("books", slug, rec);
    },

    async loadPackage<P>(slug: string, now = Date.now()) {
      const rec = await kv.get<unknown>("books", slug);
      if (!rec) return null;
      if (!isBookRecord(rec) || rec.slug !== slug || isExpired(rec.license.expires_at, now)) {
        await purge(slug);
        return null;
      }
      let payload: P | null = null;
      try {
        payload = decodePayload<P>(await cipher.decrypt(rec, aadFor("books", slug)));
      } catch {
        payload = null;
      }
      if (payload === null) {
        await purge(slug);
        return null;
      }
      return { license: rec.license, savedAt: rec.savedAt, payload };
    },

    async getMeta(slug, now = Date.now()) {
      const rec = await kv.get<unknown>("books", slug);
      if (!rec) return null;
      if (!isBookRecord(rec) || isExpired(rec.license.expires_at, now)) {
        await purge(slug);
        return null;
      }
      return { slug, license: rec.license, savedAt: rec.savedAt };
    },

    async updateLicense(slug, license) {
      const rec = await kv.get<unknown>("books", slug);
      if (!isBookRecord(rec)) return;
      await kv.put("books", slug, { ...rec, license: toStoredLicense(license) });
    },

    deletePackage: purge,

    async listPackages(now = Date.now()) {
      const out: SavedMeta[] = [];
      for (const [slug, rec] of await kv.entries<unknown>("books")) {
        if (!isBookRecord(rec) || isExpired(rec.license.expires_at, now)) {
          await purge(slug);
          continue;
        }
        out.push({ slug, license: rec.license, savedAt: rec.savedAt });
      }
      return out.sort((a, b) => a.license.expires_at.localeCompare(b.license.expires_at));
    },

    async readDoc<T>(name: "state" | "queue", slug: string) {
      const rec = await kv.get<EncryptedBlob & { v?: number }>(name, slug);
      if (!rec || !(rec.iv instanceof Uint8Array)) return null;
      try {
        return decodePayload<T>(await cipher.decrypt(rec, aadFor(name, slug)));
      } catch {
        await kv.delete(name, slug);
        return null;
      }
    },

    async writeDoc(name, slug, value) {
      const blob = await cipher.encrypt(encodePayload(value), aadFor(name, slug));
      await kv.put(name, slug, { v: RECORD_VERSION, iv: blob.iv, data: blob.data });
    },

    async deleteDoc(name, slug) {
      await kv.delete(name, slug);
    },
  };
  return store;
}

/* ---------- adapters ---------- */

/** In-memory adapter (tests; values are kept as-is, like IndexedDB's structured clone of CryptoKey). */
export function memoryAdapter(): KvAdapter & { dump: () => Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const k = (s: StoreName, key: string) => `${s}\u0000${key}`;
  return {
    async get<T>(s: StoreName, key: string) {
      return data.get(k(s, key)) as T | undefined;
    },
    async put(s, key, value) {
      data.set(k(s, key), value);
    },
    async add(s, key, value) {
      if (data.has(k(s, key))) return false;
      data.set(k(s, key), value);
      return true;
    },
    async delete(s, key) {
      data.delete(k(s, key));
    },
    async entries<T>(s: StoreName) {
      const prefix = `${s}\u0000`;
      return [...data.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, v]) => [key.slice(prefix.length), v as T] as [string, T]);
    },
    dump: () => data,
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let r: IDBOpenDBRequest;
    try {
      r = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const name of STORE_NAMES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    r.onsuccess = () => {
      const db = r.result;
      // another tab upgrades the schema: let it
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

/** IndexedDB adapter (one connection, one short transaction per call). */
export function indexedDbAdapter(db: IDBDatabase): KvAdapter {
  const tx = (s: StoreName, mode: IDBTransactionMode) => db.transaction(s, mode).objectStore(s);
  const done = (t: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("transaction aborted"));
    });
  return {
    get: <T>(s: StoreName, key: string) => req(tx(s, "readonly").get(key)) as Promise<T | undefined>,
    async put(s, key, value) {
      const os = tx(s, "readwrite");
      os.put(value, key);
      await done(os.transaction);
    },
    async add(s, key, value) {
      const os = tx(s, "readwrite");
      const r = os.add(value, key);
      return new Promise<boolean>((resolve, reject) => {
        r.onerror = (e) => {
          if (r.error?.name === "ConstraintError") {
            e.preventDefault();
            resolve(false);
          }
        };
        os.transaction.oncomplete = () => resolve(true);
        os.transaction.onabort = () => (r.error?.name === "ConstraintError" ? resolve(false) : reject(os.transaction.error));
      });
    },
    async delete(s, key) {
      const os = tx(s, "readwrite");
      os.delete(key);
      await done(os.transaction);
    },
    async entries<T>(s: StoreName) {
      const os = tx(s, "readonly");
      const [keys, values] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
      return keys.map((key, i) => [String(key), values[i] as T] as [string, T]);
    },
  };
}

let storePromise: Promise<OfflineStore | null> | null = null;

/**
 * This browser's offline store, or null when offline reading is not possible here (no IndexedDB,
 * no WebCrypto, storage blocked, key creation refused). Never throws.
 */
export function getOfflineStore(): Promise<OfflineStore | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  storePromise ??= (async () => {
    try {
      if (typeof indexedDB === "undefined" || !subtle()) return null;
      const kv = indexedDbAdapter(await openDb());
      // fail early (e.g. Safari private mode refusing writes) instead of at the first save
      await loadOrCreateKey(kv);
      return createOfflineStore(kv);
    } catch {
      return null;
    }
  })();
  return storePromise;
}
