import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { brand } from "@qelvora/brand";
import { copy } from "@qelvora/copy";
import { ageCookie } from "../../../features/identity/sign-in-flow";

/** The 18+ step. It asks for a date of birth and never says what age is
 * needed; nothing is signed in until the backend accepts it. */
export default async function Page() {
  await connection();
  if (!(await cookies()).has(ageCookie))
    redirect("/auth/continue?error=continuation_expired");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="qv identity-welcome">
      <span className="identity-wordmark">{brand.name}</span>
      <form
        method="post"
        action="/api/auth/age"
        className="identity-welcome-actions"
      >
        <div className="identity-welcome-body">
          <h1 id="age-title">{copy.signInAgeTitle}</h1>
        </div>
        <div className="qv-field">
          <input
            id="birth-date"
            name="birthDate"
            type="date"
            required
            min="1900-01-01"
            max={today}
            autoComplete="bday"
            className="qv-input"
            aria-labelledby="age-title"
            aria-describedby="age-note"
          />
          <div className="qv-help" id="age-note">
            {copy.signInAgeNote}
          </div>
        </div>
        <button
          type="submit"
          className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
        >
          {copy.signInAgeContinue}
        </button>
      </form>
    </main>
  );
}
