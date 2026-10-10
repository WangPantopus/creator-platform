import "server-only";
import { cache } from "react";
import { growthRequest } from "./server";
import type { Creator, Post } from "./types";

// React's cache is scoped to a render, so page and metadata share one read
// without carrying a public response across later lifecycle changes.
export const publicCreatorPage = cache((handle: string) =>
  growthRequest<{ creator: Creator; posts: Post[] }>(
    `public/creators/${encodeURIComponent(handle)}`,
  ),
);
