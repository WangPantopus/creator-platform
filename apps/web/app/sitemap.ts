import type { MetadataRoute } from "next";
import { configuredOrigin, growthRequest } from "../features/growth/server";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = configuredOrigin();
  if (!origin) return [];
  try {
    const entries: MetadataRoute.Sitemap = [];
    let after = "";
    for (let batch = 0; batch < 100; batch++) {
      const { pages, nextCursor } = await growthRequest<{
        pages: { path: string; updatedAt: string }[];
        nextCursor: string | null;
      }>(`public/index?after=${encodeURIComponent(after)}`);
      entries.push(
        ...pages.map((page) => ({
          url: origin + page.path,
          lastModified: page.updatedAt,
        })),
      );
      if (!nextCursor) return entries;
      if (nextCursor <= after) throw new Error("Invalid index cursor");
      after = nextCursor;
    }
    throw new Error(
      "This index requires sitemap partitioning before publishing",
    );
  } catch {
    return [];
  }
}
