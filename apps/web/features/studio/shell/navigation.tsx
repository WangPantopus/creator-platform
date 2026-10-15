"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Sidebar } from "@qelvora/ui-web";
function words(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string"
        ? n
        : isValidElement<{ children?: ReactNode }>(n)
          ? words(n.props.children)
          : "",
    )
    .join("");
}
export function navigationTree(
  node: ReactNode,
  href: (label: string) => string,
): ReactNode {
  return Children.map(node, (n) => {
    if (!isValidElement<AnchorHTMLAttributes<HTMLAnchorElement>>(n)) return n;
    const children = navigationTree(n.props.children, href);
    if (n.type === "a")
      return (
        <Link
          {...n.props}
          key={n.key}
          href={href(words(n.props.children))}
          prefetch={false}
        >
          {children}
        </Link>
      );
    return cloneElement(n, { children });
  });
}
export function studioSidebar(
  props: Parameters<typeof Sidebar>[0],
  moreHref: string,
  active: boolean,
) {
  const sidebar = Sidebar(props) as ReactElement<{ children?: ReactNode }>;
  const children = Children.toArray(sidebar.props.children);
  children.splice(
    children.length - 1,
    0,
    <div key="w5-more" className="qv-side__group">
      <Link
        href={moreHref}
        prefetch={false}
        className={`qv-side__item${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <span className="qv-side__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="5.5" cy="11" r="1.4" fill="currentColor" />
            <circle cx="11" cy="11" r="1.4" fill="currentColor" />
            <circle cx="16.5" cy="11" r="1.4" fill="currentColor" />
          </svg>
        </span>
        <span className="qv-side__label">More</span>
      </Link>
    </div>,
  );
  return cloneElement(sidebar, { children });
}
