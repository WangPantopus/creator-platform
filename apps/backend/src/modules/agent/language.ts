import { invariant } from "../../core/errors.js";

/** Bounded language intent, never arbitrary instructions or Unicode extensions. */
export function responseLanguage(raw: string) {
  invariant(
    /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?$/iu.test(raw),
    "language_invalid",
    "Choose a supported language.",
  );
  let tag: string;
  try {
    tag = Intl.getCanonicalLocales(raw)[0]!;
  } catch {
    invariant(false, "language_invalid", "Choose a supported language.");
  }
  invariant(
    !["und", "mul", "zxx"].includes(tag),
    "language_invalid",
    "Choose a supported language.",
  );
  const name = new Intl.DisplayNames(["en"], {
    type: "language",
    fallback: "none",
  }).of(tag);
  invariant(name, "language_invalid", "Choose a supported language.");
  return Object.freeze({ tag, name });
}
