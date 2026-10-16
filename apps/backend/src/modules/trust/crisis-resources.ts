import type { TrustRouterOptions } from "./router.js";

/** Help resources for the crisis page (E1.10, WP 1.9): the pilot's regions and
 * one directory for everywhere else. Long-standing national services, each
 * with an HTTPS link; counsel to confirm before public release. A host passes
 * this list to the trust router (`crisisResources`). */
export const PILOT_CRISIS_RESOURCES: TrustRouterOptions["crisisResources"] =
  Object.freeze([
    {
      region: "United States",
      name: "988 Suicide & Crisis Lifeline",
      url: "https://988lifeline.org",
      phone: "Call or text 988",
    },
    {
      region: "Canada",
      name: "9-8-8 Suicide Crisis Helpline",
      url: "https://988.ca",
      phone: "Call or text 988",
    },
    {
      region: "United Kingdom and Ireland",
      name: "Samaritans",
      url: "https://www.samaritans.org",
      phone: "116 123",
    },
    {
      region: "Australia",
      name: "Lifeline",
      url: "https://www.lifeline.org.au",
      phone: "13 11 14",
    },
    {
      region: "New Zealand",
      name: "1737, Need to talk?",
      url: "https://1737.org.nz",
      phone: "Call or text 1737",
    },
    {
      region: "Everywhere else",
      name: "Find A Helpline",
      url: "https://findahelpline.com",
    },
  ]) as TrustRouterOptions["crisisResources"];
