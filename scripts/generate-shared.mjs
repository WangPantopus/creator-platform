import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const tokens = read("design/handoff/tokens.json");
const copy = read("config/copy.json");
const brand = read("config/brand.json");
const outputs = new Map();
const camel = (name) =>
  name.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
const themed = [...tokens.color.tokens, ...tokens.shadow.tokens];
const scalar = ["spacing", "radius", "zIndex", "layout"].flatMap(
  (group) => tokens[group].tokens,
);
const resolve = (value, theme, seen = new Set()) => {
  const ref = /^\{(.+)\}$/.exec(value);
  if (!ref) return value;
  if (seen.has(ref[1])) throw new Error(`Circular token ${ref[1]}`);
  seen.add(ref[1]);
  const token = themed.find((entry) => entry.name === ref[1]);
  if (!token) throw new Error(`Unknown token ${ref[1]}`);
  return resolve(
    typeof token.value === "string" ? token.value : token.value[theme],
    theme,
    seen,
  );
};
const themes = Object.fromEntries(
  ["light", "night"].map((theme) => [
    theme,
    Object.fromEntries(
      themed.map((token) => [
        token.name,
        resolve(
          typeof token.value === "string" ? token.value : token.value[theme],
          theme,
        ),
      ]),
    ),
  ]),
);
const dimensions = Object.fromEntries(
  scalar.map((token) => [token.name, Number.parseFloat(token.value)]),
);
const shadowSpecs = Object.fromEntries(
  ["light", "night"].map((theme) => [
    theme,
    Object.fromEntries(
      tokens.shadow.tokens.map((token) => {
        const value =
          typeof token.value === "string" ? token.value : token.value[theme];
        const numbers = value.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const color = numbers.slice(-4);
        const geometry = numbers.slice(0, -4);
        return [
          token.name,
          {
            x: geometry[0],
            y: geometry[1],
            blur: geometry[2],
            spread: geometry[3] ?? 0,
            red: color[0],
            green: color[1],
            blue: color[2],
            opacity: color[3],
          },
        ];
      }),
    ),
  ]),
);
const swiftShadowCode = `  public struct ShadowValue: Sendable { public let x: CGFloat; public let y: CGFloat; public let blur: CGFloat; public let spread: CGFloat; public let red: Double; public let green: Double; public let blue: Double; public let opacity: Double
    public var color: Color { Color(red: red / 255, green: green / 255, blue: blue / 255, opacity: opacity) }
  }
  public static let shadows: [Theme: [String: ShadowValue]] = [
${Object.entries(shadowSpecs)
  .map(
    ([theme, values]) =>
      `    .${theme}: [\n${Object.entries(values)
        .map(
          ([name, values]) =>
            `      ${JSON.stringify(name)}: ShadowValue(${Object.entries(values)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")})`,
        )
        .join(",\n")}\n    ]`,
  )
  .join(",\n")}
  ]`;
const kotlinFloat = (value) =>
  `${value}${Number.isInteger(value) ? ".0" : ""}f`;
const kotlinShadowCode = `  data class ShadowValue(val x: Dp, val y: Dp, val blur: Dp, val spread: Dp, val color: Color)
  private val shadows = mapOf(
${Object.entries(shadowSpecs)
  .map(
    ([theme, values]) =>
      `    ${theme === "night"} to mapOf(\n${Object.entries(values)
        .map(
          ([name, v]) =>
            `      ${JSON.stringify(name)} to ShadowValue(${v.x}.dp, ${v.y}.dp, ${v.blur}.dp, ${v.spread}.dp, Color(${v.red} / 255f, ${v.green} / 255f, ${v.blue} / 255f, ${kotlinFloat(v.opacity)}))`,
        )
        .join(",\n")}\n    )`,
  )
  .join(",\n")}
  )
  fun shadow(name: String, night: Boolean): ShadowValue = shadows.getValue(night).getValue(name)`;
const textStyles = Object.fromEntries(
  tokens.type.groups.flatMap((group) =>
    group.styles.map((style) => [
      style.name,
      {
        family: group.family,
        size: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        weight: style.fontWeight,
        letterSpacing: Number.parseFloat(style.letterSpacing ?? "0"),
      },
    ]),
  ),
);
const cssValue = (value) => value.replace(/^\{(.+)\}$/, "var(--$1)");
let css =
  "/* Generated from design/handoff/tokens.json. Run pnpm generate. */\n";
for (const theme of ["light", "night"]) {
  css += `${theme === "light" ? ':root, [data-theme="light"]' : '[data-theme="night"]'} {\n`;
  for (const token of themed)
    css += `  --${token.name}: ${cssValue(typeof token.value === "string" ? token.value : token.value[theme])};\n`;
  css += "}\n";
}
css += ":root {\n";
for (const token of scalar) css += `  --${token.name}: ${token.value};\n`;
for (const [family, value] of Object.entries(tokens.type.families))
  css += `  --font-${family}: ${value};\n`;
for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    css += `  --${style.name}-font: var(--font-${group.family});\n`;
    css += `  --${style.name}-size: ${style.fontSize};\n`;
    css += `  --${style.name}-line: ${style.lineHeight};\n`;
    css += `  --${style.name}-weight: ${style.fontWeight};\n`;
    css += `  --${style.name}-tracking: ${style.letterSpacing ?? "0"};\n`;
  }
}
css +=
  "}\n.qv-on-maya { --seal-fill: var(--maya-accent); --seal-ink: var(--on-maya-accent); }\n";
outputs.set("packages/tokens/tokens.css", css);
outputs.set(
  "packages/tokens/src/index.ts",
  `// Generated. Run pnpm generate.\nexport const themes = ${JSON.stringify(themes, null, 2)} as const;\nexport const dimensions = ${JSON.stringify(dimensions, null, 2)} as const;\nexport const textStyles = ${JSON.stringify(textStyles, null, 2)} as const;\nexport type Theme = keyof typeof themes;\nexport type ColorToken = keyof typeof themes.light;\n`,
);
outputs.set(
  "packages/brand/src/index.ts",
  `// Generated from config/brand.json. Run pnpm generate.\nexport const brand = ${JSON.stringify(brand, null, 2)} as const;\n`,
);
outputs.set(
  "packages/copy/src/index.ts",
  `// Generated from config/copy.json. Run pnpm generate.\nexport const copy = ${JSON.stringify(copy, null, 2)} as const;\nexport type CopyKey = keyof typeof copy;\ntype Placeholders<T extends string> = T extends \x60\x24{string}{\x24{infer Key}}\x24{infer Rest}\x60 ? Key | Placeholders<Rest> : never;\nexport function formatCopy<K extends CopyKey>(key: K, values: Record<Placeholders<(typeof copy)[K]>, string | number>): string {\n  return copy[key].replace(/\\{([^}]+)\\}/g, (_, name: string) => {\n    const value = (values as Record<string, string | number>)[name];\n    if (value === undefined) throw new Error('Missing copy variable: ' + name);\n    return String(value);\n  });\n}\n`,
);
const swiftName = (name) => camel(name);
const swiftColors = Object.entries(themes)
  .map(
    ([theme, values]) =>
      `    .${theme}: [\n${Object.entries(values)
        .filter(([, value]) => /^#[\da-f]+$/i.test(value))
        .map(
          ([key, value]) =>
            `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
        )
        .join(",\n")}\n    ]`,
  )
  .join(",\n");
outputs.set(
  "apps/ios/Sources/Generated/QelvoraTokens.swift",
  `// Generated from design/handoff/tokens.json.\nimport SwiftUI\n\npublic enum QelvoraTokens {\n  public enum Theme: Sendable { case light, night }\n  public static let colors: [Theme: [String: String]] = [\n${swiftColors}\n  ]\n  public static let dimensions: [String: CGFloat] = [\n${Object.entries(
    dimensions,
  )
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${value}`)
    .join(
      ",\n",
    )}\n  ]\n  public struct TextStyle: Sendable { public let family: String; public let size: CGFloat; public let lineHeight: CGFloat; public let weight: Int; public let letterSpacing: CGFloat }\n  public static let textStyles: [String: TextStyle] = [\n${Object.entries(
    textStyles,
  )
    .map(
      ([key, style]) =>
        `    ${JSON.stringify(key)}: TextStyle(family: ${JSON.stringify(style.family)}, size: ${style.size}, lineHeight: ${style.lineHeight}, weight: ${style.weight}, letterSpacing: ${style.letterSpacing})`,
    )
    .join(
      ",\n",
    )}\n  ]\n${swiftShadowCode}\n  public static let sans = "Geist"\n  public static let serif = "Newsreader"\n  public static let mono = "GeistMono"\n  public static func color(_ name: String, theme: Theme) -> Color {\n    guard let hex = colors[theme]?[name], let number = UInt64(hex.dropFirst(), radix: 16) else { preconditionFailure("Unknown color token: \\(name)") }\n    let rgb = hex.count == 9 ? number >> 8 : number\n    let alpha = hex.count == 9 ? Double(number & 255) / 255 : 1\n    return Color(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255, opacity: alpha)\n  }\n  public static func token(_ name: String) -> CGFloat {\n    guard let value = dimensions[name] else { preconditionFailure("Unknown dimension token: \\(name)") }; return value\n  }\n${Object.entries(
    dimensions,
  )
    .map(
      ([key, value]) =>
        `  public static let ${swiftName(key)}: CGFloat = ${value}`,
    )
    .join("\n")}\n}\n`,
);
const nativeDir =
  "apps/android/app/src/main/java/com/pantopus/qelvora/generated";
const kotlinString = (value) => JSON.stringify(value).replace(/\$/g, "\\$");
outputs.set(
  `${nativeDir}/QelvoraTokens.kt`,
  `// Generated from design/handoff/tokens.json.\npackage com.pantopus.qelvora.generated\n\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.unit.Dp\nimport androidx.compose.ui.unit.dp\n\nobject QelvoraTokens {\n${Object.entries(
    themes,
  )
    .map(
      ([theme, values]) =>
        `  private val ${theme} = mapOf(\n${Object.entries(values)
          .filter(([, value]) => /^#[\da-f]+$/i.test(value))
          .map(
            ([key, value]) =>
              `    ${JSON.stringify(key)} to Color(0x${value.length === 9 ? value.slice(7) + value.slice(1, 7) : "FF" + value.slice(1)})`,
          )
          .join(",\n")}\n  )`,
    )
    .join("\n")}\n  private val dimensions = mapOf(\n${Object.entries(
    dimensions,
  )
    .map(([key, value]) => `    ${JSON.stringify(key)} to ${value}.dp`)
    .join(
      ",\n",
    )}\n  )\n  data class TextStyle(val family: String, val size: Float, val lineHeight: Float, val weight: Int, val letterSpacing: Float)\n  val textStyles = mapOf(\n${Object.entries(
    textStyles,
  )
    .map(
      ([key, style]) =>
        `    ${JSON.stringify(key)} to TextStyle(${JSON.stringify(style.family)}, ${style.size}f, ${style.lineHeight}f, ${style.weight}, ${style.letterSpacing}f)`,
    )
    .join(
      ",\n",
    )}\n  )\n${kotlinShadowCode}\n  fun color(name: String, night: Boolean): Color = (if (night) this.night else light).getValue(name)\n  fun dimension(name: String): Dp = dimensions.getValue(name)\n${Object.entries(
    dimensions,
  )
    .map(
      ([key, value]) =>
        `  val ${camel(key)} = ${scalar.find((entry) => entry.name === key).value.endsWith("px") ? value + ".dp" : value + (Number.isInteger(value) ? ".0f" : "f")}`,
    )
    .join("\n")}\n}\n`,
);
outputs.set(
  "apps/ios/Sources/Generated/QelvoraCopy.swift",
  `// Generated from config/copy.json.\nimport Foundation\npublic enum QelvoraCopy {\n  public static let strings: [String: String] = [\n${Object.entries(
    copy,
  )
    .map(
      ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
    )
    .join(
      ",\n",
    )}\n  ]\n  private static let variables = try! NSRegularExpression(pattern: #"\\{([^}]+)\\}"#)\n  public static func text(_ key: String, values: [String: String] = [:]) -> String {\n    guard let template = strings[key] else { preconditionFailure("Unknown copy key: \\(key)") }\n    let source = template as NSString\n    let result = NSMutableString(string: template)\n    for match in variables.matches(in: template, range: NSRange(location: 0, length: source.length)).reversed() {\n      if let value = values[source.substring(with: match.range(at: 1))] { result.replaceCharacters(in: match.range, with: value) }\n    }\n    return result as String\n  }\n  public static let brandName = ${JSON.stringify(brand.name)}\n  public static let studioName = ${JSON.stringify(brand.studioName)}\n}\n`,
);
outputs.set(
  `${nativeDir}/QelvoraCopy.kt`,
  `// Generated from config/copy.json.\npackage com.pantopus.qelvora.generated\nobject QelvoraCopy {\n  val strings = mapOf(\n${Object.entries(
    copy,
  )
    .map(([key, value]) => `    ${kotlinString(key)} to ${kotlinString(value)}`)
    .join(
      ",\n",
    )}\n  )\n  private val variables = Regex("""\\{([^}]+)\\}""")\n  fun text(key: String, values: Map<String, String> = emptyMap()): String = variables.replace(strings.getValue(key)) { match -> values[match.groupValues[1]] ?: match.value }\n  const val brandName = ${kotlinString(brand.name)}\n  const val studioName = ${kotlinString(brand.studioName)}\n}\n`,
);
outputs.set(
  "apps/ios/Sources/Generated/Localizable.xcstrings",
  JSON.stringify(
    {
      sourceLanguage: "en",
      strings: Object.fromEntries(
        Object.values(copy).map((value) => [
          value,
          {
            extractionState: "manual",
            localizations: {
              en: { stringUnit: { state: "translated", value } },
            },
          },
        ]),
      ),
      version: "1.0",
    },
    null,
    2,
  ) + "\n",
);
const xml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
outputs.set(
  "apps/android/app/src/main/res/values/strings.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from config/copy.json. -->\n<resources>\n  <string name="app_name">${xml(brand.name)}</string>\n${Object.entries(
    copy,
  )
    .map(
      ([key, value]) =>
        `  <string name="${key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase())}" formatted="false">${xml(value)}</string>`,
    )
    .join("\n")}\n</resources>\n`,
);
// These are the existing vector glyphs, not platform substitute icons.
const referenceBundle = fs.readFileSync(
  path.join(root, "design/design-system/project/components/bundle.js"),
  "utf8",
);
const glyphContext = vm.createContext({
  window: {
    React: {
      createElement: (kind, attributes, ...children) => ({
        kind,
        attributes,
        children,
      }),
    },
  },
});
vm.runInContext(
  referenceBundle.slice(
    0,
    referenceBundle.indexOf("/* ---------- identity ---------- */"),
  ) + "window.NativeGlyphs = G; })();",
  glyphContext,
  { timeout: 1000 },
);
const glyphs = Object.fromEntries(
  Object.entries(glyphContext.window.NativeGlyphs).map(([name, render]) => {
    const svg = render(22);
    return [
      name,
      {
        box: svg.attributes.viewBox.split(" ").map(Number),
        aspect: render(1000).attributes.width / 1000,
        shapes: svg.children.map(({ kind, attributes }) => {
          const { style, ...shape } = attributes;
          delete shape.key;
          return { kind, ...shape, ...style };
        }),
      },
    ];
  }),
);
for (const target of [
  "apps/ios/Sources/Resources/Glyphs.json",
  "apps/android/app/src/main/assets/Glyphs.json",
]) {
  outputs.set(target, JSON.stringify(glyphs, null, 2) + "\n");
}
let mismatches = 0;
for (const [name, content] of outputs) {
  const target = path.join(root, name);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) {
      console.error(`Generated file is stale: ${name}`);
      mismatches++;
    }
  } else if (
    !fs.existsSync(target) ||
    fs.readFileSync(target, "utf8") !== content
  ) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
if (mismatches) process.exit(1);
console.log(
  `${check ? "Verified" : "Generated"} ${outputs.size} shared web, Swift and Kotlin resources.`,
);
