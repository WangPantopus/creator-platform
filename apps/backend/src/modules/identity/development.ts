import { DomainError } from "../../core/errors.js";
import type { PantopusIdentityAdapter } from "./adapter.js";

/** Explicit loopback-only synthetic adapter. Never selectable in production. */
export class DevelopmentIdentityAdapter implements PantopusIdentityAdapter {
  readonly mode = "development" as const;
  readonly developmentActors = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      label: "Development actor one",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      label: "Development actor two",
    },
  ];
  constructor(
    private readonly webOrigin: string,
    environment: string | undefined,
  ) {
    const url = new URL(webOrigin);
    if (
      environment !== "development" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error(
        "Synthetic identity requires NODE_ENV=development and a loopback web origin.",
      );
  }
  async beginSession() {
    return { redirectUrl: new URL("/auth/development", this.webOrigin).href };
  }
  async completeSession({ code }: { code: string; state: string }) {
    if (!this.developmentActors.some((actor) => actor.id === code))
      throw new DomainError(
        "development_actor_invalid",
        "Choose a listed development actor.",
        400,
      );
    return { token: `development:${code}` };
  }
  async resolveSession(token: string) {
    const accountId = token.replace(/^development:/u, "");
    if (
      !token.startsWith("development:") ||
      !this.developmentActors.some((actor) => actor.id === accountId)
    )
      throw new DomainError(
        "session_invalid",
        "Continue with Pantopus again.",
        401,
      );
    return { accountId, adultEligible: true };
  }
}
