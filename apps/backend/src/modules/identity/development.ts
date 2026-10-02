import { DomainError } from "../../core/errors.js";
import type { PantopusIdentityAdapter } from "./adapter.js";

/** Explicit loopback-only synthetic adapter. Never selectable in production. */
export class DevelopmentIdentityAdapter implements PantopusIdentityAdapter {
  readonly mode = "development" as const;
  // Independent synthetic accounts let journeys exercise separate fans,
  // creators and team members. The last actor is deliberately not
  // adult-eligible so the 18+ boundary can be operated, never bypassed.
  readonly developmentActors = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      label: "Development actor one",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      label: "Development actor two",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      label: "Development actor three",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      label: "Development actor four",
    },
    {
      id: "10000000-0000-4000-8000-000000000005",
      label: "Development actor five",
    },
    {
      id: "10000000-0000-4000-8000-000000000006",
      label: "Development actor six",
    },
    {
      id: "10000000-0000-4000-8000-000000000007",
      label: "Development actor seven (under 18)",
    },
  ];
  private readonly ineligibleActors = new Set([
    "10000000-0000-4000-8000-000000000007",
  ]);
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
    return { accountId, adultEligible: !this.ineligibleActors.has(accountId) };
  }
}
