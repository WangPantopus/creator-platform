import { sessionCookie } from "./session";

// Follow W8's553b443 contract: the explicit development selector must never
// read or clear another loopback app's session.
export const trustLocalSessionCookie = `w8_local_${sessionCookie}`;
