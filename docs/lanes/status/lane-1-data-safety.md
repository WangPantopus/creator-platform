# Lane 1 · WP 1.9 · Data-safety source document

Written 2026-10-16 by lane 1 from the database schema on main (`dea51a4ff`), for the App Store
privacy label and Google Play's data-safety form. It lists what the code stores, where, and why.
Counsel to confirm before submission. Media (voice, video, calls) is frozen for the pilot and not
listed; add it when it ships.

## Collected

| Data (store category)        | Where it is stored                                                                                                                                                                              | Linked to the person | Why                                                               | Notes                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Email address (contact info) | `creator.account_identity.email_cipher` (the address Apple or Google shares at sign-in); `growth.email.encrypted_address` (notification email, lane 5)                                          | Yes                  | Shown in the person's export; notification email when they opt in | Encrypted at rest (AES-256-GCM). Erased when the account is deleted or the age step says under 18 (#454, #481) |
| User ID                      | `creator.account.id`, a random UUID; the Apple or Google subject only as a keyed hash (`account_identity.subject_hmac`)                                                                         | Yes                  | The account                                                       | Never derived from the provider subject or a Pantopus id                                                       |
| Age range (sensitive)        | `creator.age_signal`: `adult` or `under_18`, the source and the copy version                                                                                                                    | Yes                  | The 18+ gate                                                      | No date of birth is ever stored                                                                                |
| Messages (user content)      | `creator.message` (conversations with a creator's AI and the creator), `creator.content_reply` (Note replies), `creator.content_thanks`, `creator.conversation_feedback`                        | Yes                  | The product                                                       | Deleted with the account, except records the law or a dispute needs (see the deletion notes)                   |
| Other user content           | `creator.fan_profile` (handle, intro), `creator.creator_profile` (display name, handle), `creator.creator_proof` (a social account and post link), `creator_trust.safety_case` (report reasons) | Yes                  | Profiles, creator verification, safety                            |                                                                                                                |
| Purchase history             | `creator.commerce_*` (requests, memberships, passes, the ledger)                                                                                                                                | Yes                  | Payments and refunds                                              | Card details stay with the payment processor; only its references are stored                                   |
| Device ID                    | `growth.device.encrypted_token` (push tokens)                                                                                                                                                   | Yes                  | Notifications                                                     | Encrypted at rest                                                                                              |
| Product interaction          | `creator.identity_session` (sign-in times), `creator.conversation_usage_day`, `creator.content_reply_read`, `creator.conversation_presence`                                                     | Yes                  | Sessions, limits, read state                                      |                                                                                                                |

## Not collected

Date of birth, phone number, physical address, precise or coarse location, IP addresses (none in
the database), contacts, photos, health data, and bank or card numbers. Session tokens and
provider refresh tokens are not readable: sessions are stored as hashes, refresh tokens encrypted.

## Spot-checked against the database (E1.10)

`tests/scenarios/lane-1/e1-10-compliance.mjs` checks three fields on a live stack:

1. No column in `creator`, `growth` or `creator_trust` holds a date of birth (no `birth` or `dob`
   column), and an age record holds only the result.
2. The sign-in email exists only encrypted: no stored `email_cipher` value contains an `@`.
3. Session tokens exist only as SHA-256 hashes (`identity_session.token_hash`, 64 hex characters),
   with no plain-token column.
