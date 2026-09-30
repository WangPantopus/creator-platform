import { expect, test } from "@playwright/test";

const origin = "http://localhost:3000";
const fallback = "/creators/maya/chat";
const invalidPaths = [
  "//outside.invalid",
  "https://outside.invalid",
  "/creators/maya/nested\\draft",
  "/creators/maya/nested\u0000draft",
  "/creators/maya/nested\tdraft",
  "/creators/maya/nested\r\ndraft",
  "/" + "x".repeat(2048),
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
    expect(redirected.searchParams.get("error")).toBe("identity_unconfigured");
  }
});

test("welcome and auth seam use the same context contract and preserve a nested draft", async ({
  page,
  request,
}) => {
  const returnTo = "/creators/maya/requests?draft=" + "x".repeat(1200);
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
