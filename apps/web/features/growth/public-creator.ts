import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { growthRequest } from "./server";
import type { Creator, Post } from "./types";

// React's cache is scoped to a render, so page and metadata share one read
// without carrying a public response across later lifecycle changes. The
// visitor's address goes along so the backend's read limit counts people,
// not this server.
export const publicCreatorPage = cache(async (handle: string) => {
  const address = (await headers())
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return growthRequest<{ creator: Creator; posts: Post[] }>(
    `public/creators/${encodeURIComponent(handle)}`,
    address ? { headers: { "X-Forwarded-For": address } } : undefined,
  );
});
