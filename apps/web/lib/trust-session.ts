import { sessionCookie } from "./session";

// Follow the canonical session's development origin isolation. The explicit
// synthetic selector must never read or clear another loopback app's session.
export const trustLocalSessionCookie = `w8_local_${sessionCookie}`;
