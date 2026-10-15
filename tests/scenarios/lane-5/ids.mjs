// Synthetic accounts for the lane 5 scenarios. The host lists exactly these as
// development identities; a script signs in as one by its index. Every script
// owns a disjoint block so they can run one after another on one database.
export const ACTOR_COUNT = 4200;
export const actorId = (index) =>
  `5a000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
