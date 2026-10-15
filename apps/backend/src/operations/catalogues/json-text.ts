// Path-aware reading and patching of JSON text. The reviewed catalogue pins live
// in hand-formatted JSON files; replacing only the digest characters keeps a
// regeneration's diff to exactly the lines whose value changed, and keeps every
// other byte (and the file's formatting) as the reviewers last saw it.

export type JsonPath = readonly (string | number)[];
export type StringSpan = {
  path: JsonPath;
  /** Offset of the first character after the opening quote. */
  start: number;
  /** Offset of the closing quote. */
  end: number;
  value: string;
};

export const pathKey = (path: JsonPath) =>
  path.map((part) => String(part)).join(".");

/** Every string value in the text (never an object key), with its path. */
export function stringSpans(text: string): StringSpan[] {
  const spans: StringSpan[] = [];
  let at = 0;
  const skipSpace = () => {
    while (at < text.length && " \t\r\n".includes(text[at]!)) at += 1;
  };
  const readString = () => {
    if (text[at] !== '"') throw new Error(`Invalid JSON at offset ${at}.`);
    const start = at + 1;
    at += 1;
    while (text[at] !== '"') {
      if (at >= text.length) throw new Error("Unterminated JSON string.");
      if (text[at] === "\\") at += 1;
      at += 1;
    }
    const end = at;
    at += 1;
    return {
      start,
      end,
      value: JSON.parse(text.slice(start - 1, end + 1)) as string,
    };
  };
  const readValue = (path: JsonPath) => {
    skipSpace();
    const first = text[at];
    if (first === "{") {
      at += 1;
      skipSpace();
      if (text[at] === "}") {
        at += 1;
        return;
      }
      for (;;) {
        skipSpace();
        const key = readString();
        skipSpace();
        if (text[at] !== ":") throw new Error(`Invalid JSON at offset ${at}.`);
        at += 1;
        readValue([...path, key.value]);
        skipSpace();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        if (text[at] === "}") {
          at += 1;
          return;
        }
        throw new Error(`Invalid JSON at offset ${at}.`);
      }
    } else if (first === "[") {
      at += 1;
      skipSpace();
      if (text[at] === "]") {
        at += 1;
        return;
      }
      for (let index = 0; ; index += 1) {
        readValue([...path, index]);
        skipSpace();
        if (text[at] === ",") {
          at += 1;
          continue;
        }
        if (text[at] === "]") {
          at += 1;
          return;
        }
        throw new Error(`Invalid JSON at offset ${at}.`);
      }
    } else if (first === '"') {
      spans.push({ path, ...readString() });
    } else {
      while (at < text.length && !",}] \t\r\n".includes(text[at]!)) at += 1;
    }
  };
  readValue([]);
  skipSpace();
  if (at !== text.length) throw new Error("Unexpected text after the JSON.");
  return spans;
}

/** Replace the string values at the given paths. Everything else is untouched.
 * Refuses a path that is missing or is not a string. */
export function patchStrings(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  const spans = new Map(stringSpans(text).map((s) => [pathKey(s.path), s]));
  const edits = [...replacements].map(([key, value]) => {
    const span = spans.get(key);
    if (!span) throw new Error(`No string value at ${key}.`);
    return { span, value };
  });
  let patched = text;
  for (const { span, value } of edits.sort(
    (a, b) => b.span.start - a.span.start,
  ))
    patched = patched.slice(0, span.start) + value + patched.slice(span.end);
  return patched;
}
