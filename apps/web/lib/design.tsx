import "server-only";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as React from "react";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import * as UI from "@qelvora/ui-web";
import { brand } from "@qelvora/brand";
import { copy, formatCopy } from "@qelvora/copy";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Values = Record<string, unknown>;
type Component = React.ComponentType<Record<string, unknown>>;
export type Screen = {
  id: string;
  group: string;
  file: string;
  title: string;
  width: number;
  height: number;
};
const designRoot = path.resolve(process.cwd(), "../../design");
const groups = [
  "phase4a-fan-core",
  "phase4b-fan-account",
  "phase4c-studio-phone",
  "phase4d-studio-desktop",
  "phase4e-4i",
  "phase5-prototypes",
];

/** The adapter accepts only tracked design exports. Request data can never supply source code. */
export function screenList(): Screen[] {
  return groups.flatMap((group) => {
    const canvas = JSON.parse(
      fs.readFileSync(path.join(designRoot, group, "canvas.json"), "utf8"),
    ) as { order: string[]; boards: Record<string, { w: number; h: number }> };
    return canvas.order.map((file) => {
      const source = fs.readFileSync(
        path.join(designRoot, group, file),
        "utf8",
      );
      const dimensions = canvas.boards[file]!;
      return {
        id: file.replace(".dc.html", ""),
        group,
        file,
        title: source.match(/<title>(.*?)<\/title>/)?.[1] ?? file,
        width: dimensions.w,
        height: dimensions.h,
      };
    });
  });
}
export function getScreen(group: string, id: string): Screen | undefined {
  return screenList().find((s) => s.group === group && s.id === id);
}
function value(expression: string, values: Values): unknown {
  const trimmed = expression.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Values)[key]
          : undefined,
      values,
    );
}
function interpolate(text: string, values: Values): string {
  return replaceBrand(
    text.replace(/{{(.*?)}}/g, (_, expression: string) =>
      String(value(expression, values) ?? ""),
    ),
  );
}
function replaceBrand(text: string): string {
  const fixed: Record<string, string> = {
    "Her AI answers you now. She answers in person when you ask.":
      copy.welcomeTitle,
    "Every message says who wrote it: Maya's AI, Maya herself, or her team. You'll always know which.":
      copy.welcomeBody,
    "One Pantopus account signs you in to every Pantopus app. New here? You'll create it in the next step.":
      copy.pantopusAccount,
    "Continue with Pantopus": copy.continueWithPantopus,
    "What Maya will see": copy.includedInRequest,
    "Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.":
      copy.conversationAccess,
    "Official means Maya authorized this AI. It does not mean she read your message.":
      formatCopy("officialDisclaimer", { name: "Maya" }),
    "Maya and her authorized team can separately review this AI conversation. Those accesses are logged.":
      formatCopy("packetAccess", { name: "Maya" }),
    "Only Maya and her team see replies to Notes.": formatCopy("noteReplies", {
      name: "Maya",
    }),
    "Want me to remember this? Only if you say yes.": copy.sensitiveMemory,
    "Opening this conversation is logged and visible to the fan.":
      copy.auditAccess,
    "Set a monthly limit. You can change it any time; raising it takes 24 hours.":
      copy.spendLimit,
    "Maya may answer with her AI's draft; you'll see that label.": formatCopy(
      "draftNotice",
      { name: "Maya" },
    ),
    "Your bank may show a pending hold for a few days.": copy.pendingHold,
    "You came from Maya's page": copy.welcomeSource,
    "Maya · Ceramics · Kiln Club": copy.welcomeContext,
  };
  const trimmed = text.trim();
  if (fixed[trimmed]) text = text.replace(trimmed, fixed[trimmed]);
  return text
    .replaceAll("Qelvora Studio", brand.studioName)
    .replaceAll("QELVORA", brand.slug.toUpperCase())
    .replaceAll("Qelvora", brand.name)
    .replaceAll("qelvora", brand.slug);
}
function attribute(text: string, values: Values): unknown {
  const exact = text.match(/^{{(.*?)}}$/);
  return exact ? value(exact[1]!, values) : interpolate(text, values);
}
function camel(text: string): string {
  return text.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}
function style(text: string): React.CSSProperties {
  return Object.fromEntries(
    text
      .split(";")
      .filter((part) => part.includes(":"))
      .map((part) => {
        const split = part.indexOf(":");
        const key = part.slice(0, split).trim();
        return [
          key.startsWith("--") ? key : camel(key),
          part.slice(split + 1).trim(),
        ];
      }),
  ) as React.CSSProperties;
}
function isElement(node: Node): node is Element {
  return "tagName" in node;
}
function children(node: Node): Node[] {
  return "childNodes" in node ? node.childNodes : [];
}

export type RenderOptions = {
  foundation?: "welcome" | "creator" | "handle";
  values?: Values;
  returnTo?: string;
};
function renderNode(
  node: Node,
  values: Values,
  key: string,
  options: RenderOptions,
): React.ReactNode {
  if (node.nodeName === "#text" && "value" in node)
    return interpolate(node.value, values);
  if (!isElement(node)) return null;
  const attrs = Object.fromEntries(
    node.attrs.map((attr) => [attr.name, attr.value]),
  );
  if (["helmet", "script", "style"].includes(node.tagName)) return null;
  const renderKids = (scope = values) =>
    children(node).map((child, index) =>
      renderNode(child, scope, `${key}-${index}`, options),
    );
  if (node.tagName === "sc-if")
    return attribute(attrs.value ?? "", values)
      ? React.createElement(React.Fragment, { key }, ...renderKids())
      : null;
  if (node.tagName === "sc-for") {
    const list = attribute(attrs.list ?? "", values);
    if (!Array.isArray(list))
      throw new Error(`Invalid design list ${attrs.list}`);
    return React.createElement(
      React.Fragment,
      { key },
      ...list.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: index },
          ...renderKids({ ...values, [attrs.as ?? "item"]: item }),
        ),
      ),
    );
  }
  if (node.tagName === "x-dc")
    return React.createElement(React.Fragment, { key }, ...renderKids());
  const props: Record<string, unknown> = { key };
  for (const [name, text] of Object.entries(attrs)) {
    if (
      name.startsWith("hint-") ||
      name.startsWith("component-") ||
      ["onclick", "onchange", "oninput", "onsubmit"].includes(name)
    )
      continue;
    const val = attribute(text, values);
    const property =
      (
        {
          class: "className",
          for: "htmlFor",
          "stroke-width": "strokeWidth",
          "stroke-linecap": "strokeLinecap",
          "stroke-linejoin": "strokeLinejoin",
          viewbox: "viewBox",
        } as Record<string, string>
      )[name] ??
      (name.startsWith("aria-") || name.startsWith("data-")
        ? name
        : camel(name));
    props[property] =
      name === "style"
        ? style(String(val))
        : ["checked", "disabled"].includes(name)
          ? val === "" || val === true
          : val;
  }
  if (node.tagName === "input") {
    if ("value" in props) {
      props.defaultValue = props.value;
      delete props.value;
    }
    if ("checked" in props) {
      props.defaultChecked = props.checked;
      delete props.checked;
    }
  }
  if (node.tagName === "textarea") {
    props.defaultValue = renderKids().join("");
    return React.createElement("textarea", props);
  }
  if (node.tagName === "x-import") {
    const name = attrs["component-from-global-scope"]?.split(".").pop() ?? "";
    const component = (UI as unknown as Record<string, Component>)[name];
    if (!component) throw new Error(`Unknown design component ${name}`);
    if (options.foundation && (name === "Button" || name === "StepIn")) {
      const text = renderKids().join("");
      if (name === "StepIn")
        return React.createElement(
          "a",
          {
            key,
            className: "qv qv-stepin qv-on-maya",
            href: "/auth/continue?returnTo=%2Fcreators%2Fmaya%2Frequests",
          },
          React.createElement(UI.Seal, { size: 30 }),
          "Ask Maya to step in",
        );
      if (text === copy.continueWithPantopus)
        props.href = `/api/auth/continue?returnTo=${encodeURIComponent(options.returnTo ?? "/creators/maya/chat")}`;
      else if (text.startsWith("Message") || text.startsWith("Join"))
        props.href = "/auth/continue?returnTo=%2Fcreators%2Fmaya%2Fchat";
    }
    return React.createElement(component, props, ...renderKids());
  }
  if (options.foundation && node.tagName === "a" && attrs.href === "#")
    props.href = "/";
  return React.createElement(node.tagName, props, ...renderKids());
}

/** Runs the trusted repository design's renderVals function in a fresh VM. */
function initialValues(source: string, options: RenderOptions): Values {
  const script = source
    .match(/class Component extends DCLogic \{([\s\S]*?)<\/script>/)?.[0]
    .replace("</script>", "");
  if (!script) return {};
  const context = vm.createContext({
    window: { React, Qelvora: UI },
    DCLogic: class {
      state: Values = options.values ?? {};
      setState() {}
    },
  });
  return vm.runInContext(`${script}; new Component().renderVals()`, context, {
    // A bounded wall-clock budget must tolerate concurrent native builds.
    timeout: 1000,
  }) as Values;
}
export function renderScreen(
  screen: Screen,
  options: RenderOptions = {},
): React.ReactNode {
  const source = fs.readFileSync(
    path.join(designRoot, screen.group, screen.file),
    "utf8",
  );
  const body = source.match(/<x-dc>([\s\S]*?)<\/x-dc>/)?.[1];
  if (!body) throw new Error(`Missing board ${screen.file}`);
  const tree = parseFragment(body);
  return children(tree).map((node, index) =>
    renderNode(node, initialValues(source, options), String(index), options),
  );
}
export function componentList(): string[] {
  return fs
    .readdirSync(path.join(designRoot, "design-system/project/components"))
    .filter(
      (name) =>
        fs.existsSync(
          path.join(
            designRoot,
            "design-system/project/components",
            name,
            "preview.html",
          ),
        ) && name !== "Cover",
    );
}
export function renderComponent(name: string): React.ReactNode {
  if (!componentList().includes(name)) throw new Error("Unknown component");
  const source = fs.readFileSync(
    path.join(
      designRoot,
      "design-system/project/components",
      name,
      "preview.html",
    ),
    "utf8",
  );
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Missing preview composition");
  let rendered: React.ReactNode = null;
  const context = vm.createContext({
    React,
    window: { Qelvora: UI },
    document: { getElementById: () => ({}) },
    ReactDOM: {
      createRoot: () => ({
        render: (node: React.ReactNode) => {
          rendered = node;
        },
      }),
    },
  });
  vm.runInContext(script, context, { timeout: 1000 });
  const className = source.match(/<div id="root"(?: class="([^"]*)")?>/)?.[1];
  return React.createElement("div", { className }, rendered);
}
