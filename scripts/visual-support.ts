/** Adapter for the trusted design exports' omitted canvas runtime. Reference components stay unported. */
import * as React from "react";
import { createRoot } from "react-dom/client";
type Values = Record<string, unknown>;
type Reference = Record<string, React.ComponentType<Record<string, unknown>>>;
const referenceWindow = window as unknown as {
  React: typeof React;
  ReactDOM: { createRoot: typeof createRoot };
  Qelvora: Reference;
  DCLogic: typeof DCLogic;
};
referenceWindow.React = React;
referenceWindow.ReactDOM = { createRoot };
class DCLogic {
  state: Values = {};
  setState(next: Values) {
    this.state = { ...this.state, ...next };
    mount();
  }
}
referenceWindow.DCLogic = DCLogic;
let logic: DCLogic & { renderVals(): Values };
let template: HTMLElement;
let root: ReturnType<typeof createRoot>;
function value(expression: string, values: Values): unknown {
  const expressionText = expression.trim();
  if (expressionText === "true") return true;
  if (expressionText === "false") return false;
  return expressionText
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Values)[key]
          : undefined,
      values,
    );
}
function attr(text: string, values: Values): unknown {
  const exact = text.match(/^{{(.*?)}}$/);
  return exact
    ? value(exact[1]!, values)
    : text.replace(/{{(.*?)}}/g, (_, expression: string) =>
        String(value(expression, values) ?? ""),
      );
}
function camel(text: string): string {
  return text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
function render(node: Node, values: Values, key: string): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE)
    return attr(node.textContent ?? "", values) as string;
  if (!(node instanceof Element)) return null;
  const tag = node.tagName.toLowerCase();
  const kids = (scope = values) =>
    Array.from(node.childNodes).map((child, i) =>
      render(child, scope, key + "-" + i),
    );
  if (["helmet", "style", "script"].includes(tag)) return null;
  if (tag === "sc-if")
    return attr(node.getAttribute("value") ?? "", values)
      ? React.createElement(React.Fragment, { key }, ...kids())
      : null;
  if (tag === "sc-for")
    return React.createElement(
      React.Fragment,
      { key },
      ...(attr(node.getAttribute("list") ?? "", values) as unknown[]).flatMap(
        (item) =>
          kids({ ...values, [node.getAttribute("as") ?? "item"]: item }),
      ),
    );
  const props: Record<string, unknown> = { key };
  for (const { name, value: text } of Array.from(node.attributes)) {
    if (name.startsWith("hint-") || name.startsWith("component-")) continue;
    const val = attr(text, values);
    const property =
      (
        {
          class: "className",
          for: "htmlFor",
          viewbox: "viewBox",
          "stroke-width": "strokeWidth",
          "stroke-linecap": "strokeLinecap",
          "stroke-linejoin": "strokeLinejoin",
          onclick: "onClick",
        } as Record<string, string>
      )[name] ??
      (name.startsWith("aria-") || name.startsWith("data-")
        ? name
        : camel(name));
    props[property] =
      name === "style"
        ? Object.fromEntries(
            String(val)
              .split(";")
              .filter((v) => v.includes(":"))
              .map((v) => {
                const i = v.indexOf(":");
                const k = v.slice(0, i).trim();
                return [
                  k.startsWith("--") ? k : camel(k),
                  v.slice(i + 1).trim(),
                ];
              }),
          )
        : ["checked", "disabled"].includes(name)
          ? val === "" || val === true
          : val;
  }
  if (tag === "input") {
    if ("value" in props) {
      props.defaultValue = props.value;
      delete props.value;
    }
    if ("checked" in props) {
      props.defaultChecked = props.checked;
      delete props.checked;
    }
  }
  if (tag === "textarea") {
    props.defaultValue = kids().join("");
    return React.createElement("textarea", props);
  }
  if (tag === "x-import") {
    const name = node
      .getAttribute("component-from-global-scope")!
      .split(".")
      .pop()!;
    return React.createElement(
      referenceWindow.Qelvora[name]!,
      props,
      ...kids(),
    );
  }
  return React.createElement(tag, props, ...kids());
}
function mount() {
  root.render(
    React.createElement(
      React.Fragment,
      null,
      ...Array.from(template.childNodes).map((node, i) =>
        render(node, logic.renderVals(), String(i)),
      ),
    ),
  );
}
window.addEventListener("DOMContentLoaded", () => {
  const host = document.querySelector("x-dc");
  if (!host) return;
  template = document.createElement("div");
  template.innerHTML = host.innerHTML;
  const script = document.querySelector("script[data-dc-script]")?.textContent;
  if (!script) throw new Error("No design script");
  // Only this local server's repository-owned export is evaluated, never request or user content.
  const Logic = new Function("DCLogic", `${script}; return Component;`)(
    DCLogic,
  ) as new () => typeof logic;
  logic = new Logic();
  const step = Number(new URLSearchParams(location.search).get("step") ?? 0);
  logic.state = { s: step, i: step, score: 0 };
  root = createRoot(host);
  mount();
});
