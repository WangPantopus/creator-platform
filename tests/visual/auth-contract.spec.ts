import { visualWebURL } from "../../playwright.config";
import { expect, test } from "@playwright/test";

const origin = visualWebURL;
const fallback = "/home";
const invalidPaths = [
  "//outside.invalid",
  "https://outside.invalid",
  "/creators/maya/nested\\draft",
  "/creators/maya/nested\u0000draft",
  "/creators/maya/nested\tdraft",
  "/creators/maya/nested\r\ndraft",
  "/" + "x".repeat(2048),
  "/creators/maya/requests?draft=" + "x".repeat(1200),
];

function authURL(path: string, returnTo: string) {
  const url = new URL(path, origin);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

test("auth seam rejects external, nested backslash and control-character contexts", async ({
  request,
}) => {
  for (const returnTo of invalidPaths) {
    const response = await request.get(
      authURL("/api/auth/continue", returnTo),
      {
        maxRedirects: 0,
      },
    );
    expect(response.status()).toBe(307);
    const redirected = new URL(response.headers().location!);
    expect(redirected.origin).toBe(origin);
    expect(redirected.pathname).toBe("/auth/continue");
    expect(redirected.searchParams.get("returnTo")).toBe(fallback);
    expect(redirected.searchParams.get("error")).toBe("invalid_return");
  }
});

test("welcome and auth seam preserve an opaque context reference", async ({
  page,
  request,
}) => {
  const returnTo =
    "/creators/maya/requests?context=00000000-0000-4000-8000-000000000001";
  await page.goto(authURL("/auth/continue", returnTo));
  const link = page.getByRole("link", {
    name: "Continue with Pantopus",
    exact: true,
  });
  const continuation = new URL((await link.getAttribute("href"))!, origin);
  expect(continuation.searchParams.get("returnTo")).toBe(returnTo);
  const response = await request.get(continuation.toString(), {
    maxRedirects: 0,
  });
  expect(
    new URL(response.headers().location!).searchParams.get("returnTo"),
  ).toBe(returnTo);

  await page.goto(authURL("/auth/continue", "/creators/maya/nested\\draft"));
  const fallbackLink = new URL((await link.getAttribute("href"))!, origin);
  expect(fallbackLink.searchParams.get("returnTo")).toBe(fallback);
});
