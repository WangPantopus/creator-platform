import { performance } from "node:perf_hooks";
import { copy } from "@qelvora/copy";
import { DomainError } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PublicContent, PublicCreator } from "./contracts.js";
import type { GrowthService } from "./service.js";

export interface PublicCreatorPage {
  creator: PublicCreator;
  posts: PublicContent[];
}

/** A public cache is an optimization, never permission to serve an old page.
 * Each hit checks current identity, AI state and public projection versions.
 * Concurrent reads of one handle share that check and, if needed, one refresh.
 * No stale response is returned after a failed read. All state is process-local. */
export class PublicCreatorPages {
  private readonly pages = new Map<
    string,
    { page: PublicCreatorPage; expiresAt: number }
  >();
  private readonly pending = new Map<
    string,
    {
      anonymous: boolean;
      work: Promise<{ page: PublicCreatorPage | null; hit: boolean }>;
    }
  >();
  private readonly addresses = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(private readonly service: GrowthService) {}

  /** Use the socket peer; untrusted forwarding headers must not reset a limit.
   * A deployment with a proxy must enforce the visitor limit at that proxy too. */
  admit(address: string): number {
    const now = performance.now();
    for (const [key, entry] of this.addresses)
      if (entry.until <= now) this.addresses.delete(key);
    const prior = this.addresses.get(address);
    if (prior) {
      if (prior.count >= 120)
        return Math.max(1, Math.ceil((prior.until - now) / 1000));
      prior.count++;
    } else {
      if (this.addresses.size >= 4096) return 60;
      this.addresses.set(address, { count: 1, until: now + 60_000 });
    }
    return 0;
  }

  read(handle: string) {
    const anonymous = !requestAuthority.getStore();
    const running = this.pending.get(handle);
    // A signed-in visitor's held denial/session check belongs only to that
    // request. Never lend its result to another visitor or an anonymous read.
    if (running && anonymous && running.anonymous) return running.work;
    if (running || this.pending.size >= 16)
      throw new DomainError(
        "public_read_busy",
        copy.growthTheServiceIsUnavailablePleaseTryAgain,
        429,
      );
    const work = this.readCurrent(handle).finally(() =>
      this.pending.delete(handle),
    );
    this.pending.set(handle, { anonymous, work });
    return work;
  }

  private async readCurrent(handle: string) {
    const now = performance.now();
    const cached = this.pages.get(handle);
    if (cached && cached.expiresAt > now) {
      try {
        if (await this.service.creatorPageCurrent(cached.page))
          return { page: cached.page, hit: true };
      } catch (error) {
        this.pages.delete(handle);
        throw error;
      }
    }
    this.pages.delete(handle);
    const page = await this.service.creatorPage(handle);
    if (page) {
      // Bound both the time and memory occupied by large public post bodies.
      for (const [key, entry] of this.pages)
        if (entry.expiresAt <= now) this.pages.delete(key);
      if (this.pages.size >= 64)
        this.pages.delete(this.pages.keys().next().value!);
      this.pages.set(handle, { page, expiresAt: performance.now() + 5000 });
    }
    return { page, hit: false };
  }
}
