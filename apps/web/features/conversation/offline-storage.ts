"use client";

import {
  ConversationOfflineSnapshotSchema,
  type ConversationOfflineSnapshot,
} from "../../../../packages/api/src/conversation/contracts";

/** One bounded encrypted snapshot. The nonextractable key lives only in this
 * authenticated view's memory; a reload cannot recover private cached text. */
export class ConversationOfflineStorage {
  private key?: CryptoKey;
  private revision = 0;
  private deadline = 0;
  private savedAt = 0;
  private savedTick = 0;
  private binding?: string;
  private readonly storageKey: string;
  constructor(
    private readonly accountId: string,
    private readonly sessionId: string,
    private readonly root: string,
    private readonly origin: string,
  ) {
    this.storageKey = `qelvora:conversation-offline:${origin}`;
    // No old key/authority survives a new view or account/issuer switch.
    this.purge();
  }
  private aad() {
    return new TextEncoder().encode(
      JSON.stringify({
        origin: this.origin,
        accountId: this.accountId,
        root: this.root,
        binding: this.binding,
      }),
    );
  }
  private valid(): boolean {
    const wall = Date.now() - this.savedAt,
      tick = performance.now() - this.savedTick;
    return Boolean(
      this.key &&
        this.binding &&
        performance.now() < this.deadline &&
        wall >= 0 &&
        tick >= 0 &&
        Math.abs(wall - tick) < 50,
    );
  }
  get current() {
    return this.valid();
  }
  purge(): void {
    this.revision++;
    this.key = undefined;
    this.binding = undefined;
    this.deadline = 0;
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      /* Storage can be disabled. */
    }
  }
  async save(raw: unknown, requestStarted: number): Promise<boolean> {
    const revision = ++this.revision;
    const value = ConversationOfflineSnapshotSchema.parse(raw);
    const { lease, page } = value;
    const expected = new TextEncoder().encode(
      JSON.stringify({
        accountId: this.accountId,
        issuer: lease.issuer,
        purpose: "conversation-offline-session-v1",
        sessionId: this.sessionId,
      }),
    );
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", expected),
    );
    const binding = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (revision !== this.revision) return false;
    const lifetime = Date.parse(lease.expiresAt) - Date.parse(lease.issuedAt);
    const remaining =
      Math.min(
        lifetime - (performance.now() - requestStarted),
        Date.parse(lease.expiresAt) - Date.now(),
      ) - 100;
    if (
      lease.accountId !== this.accountId ||
      lease.sessionBinding !== binding ||
      `${lease.creatorId}/${lease.fanId}` !== this.root ||
      page.threadId !== lease.threadId ||
      page.revision !== lease.revision ||
      page.cursor !== lease.cursor ||
      page.epoch !== lease.epoch ||
      page.offTheRecord ||
      page.canSend ||
      !page.consentCurrent ||
      lifetime <= 0 ||
      lifetime > 5000 ||
      remaining <= 0 ||
      lease.messages.length !== page.messages.length ||
      page.messages.some(
        (message, index) =>
          message.threadId !== lease.threadId ||
          message.offTheRecord ||
          message.recording ||
          message.id !== lease.messages[index]?.id ||
          message.version !== lease.messages[index]?.version,
      )
    ) {
      this.purge();
      return false;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.byteLength > 163840) {
      this.purge();
      return false;
    }
    const key =
      this.key ??
      (await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ));
    if (revision !== this.revision) return false;
    this.key = key;
    this.binding = binding;
    this.savedAt = Date.now();
    this.savedTick = performance.now();
    this.deadline = this.savedTick + remaining;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: this.aad() },
        key,
        bytes,
      ),
    );
    if (revision !== this.revision || !this.valid()) return false;
    const base64 = (data: Uint8Array) =>
      btoa(Array.from(data, (byte) => String.fromCharCode(byte)).join(""));
    try {
      sessionStorage.setItem(
        this.storageKey,
        JSON.stringify({ iv: base64(iv), body: base64(encrypted) }),
      );
    } catch {
      this.purge();
      return false;
    }
    return true;
  }
  async read(): Promise<ConversationOfflineSnapshot | null> {
    if (!this.valid()) {
      this.purge();
      return null;
    }
    const revision = this.revision;
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw || raw.length > 230000) throw new Error("Unavailable cache");
      const value = JSON.parse(raw) as { iv: string; body: string };
      const decode = (value: string) =>
        Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decode(value.iv), additionalData: this.aad() },
        this.key!,
        decode(value.body),
      );
      if (revision !== this.revision || !this.valid()) return null;
      return ConversationOfflineSnapshotSchema.parse(
        JSON.parse(new TextDecoder().decode(decrypted)),
      );
    } catch {
      this.purge();
      return null;
    }
  }
}
