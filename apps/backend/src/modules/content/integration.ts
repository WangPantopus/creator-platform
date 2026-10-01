import type { Pool } from "pg";
import { ContentService, type ContentDependencies } from "./service.js";
import { contentFeature, contentSignedSubjects } from "./registration.js";
import { StudioService } from "../studio/service.js";
import { studioFeature } from "../studio/registration.js";

/** W1 host seam: one service instance for HTTP and exact W1 signed subjects.
 * Production hosts supply W8's current scope denial callback. Each downstream
 * adapter remains explicit; missing producers cannot imply successful delivery.
 */
export function createContentStudio(input: {
  pool: Pool;
  owners: ConstructorParameters<typeof StudioService>[1];
  dependencies: ContentDependencies &
    Required<Pick<ContentDependencies, "assertAllowed">>;
}) {
  const content = new ContentService(input.pool, input.dependencies);
  const studio = new StudioService(content, input.owners);
  return {
    content,
    studio,
    features: [contentFeature(content), studioFeature(studio)],
    signedSubjects: contentSignedSubjects(content),
  };
}
