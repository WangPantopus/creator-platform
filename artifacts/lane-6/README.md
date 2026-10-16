# Lane 6 evidence: WP 6.2, Today and the Note composer

Screenshots that carry a decision, taken on 2026-10-15 in Chrome 155 against the lane 6 stack
(real backend and PostgreSQL, development identity), at 390 px. There is no Today board in
`design/`; the founder approved the copy in `config/copy.json` on 2026-10-15.

| File | Shows |
| --- | --- |
| `6-2-today-light.png` | Today in Light: New Note, your latest Note with the link to Notes, Replies, Requests, My AI. No tab is marked yet: the founder decided Today replaces Notes as the first tab, and that tab bar change is the integrator's. |
| `6-2-today-night.png` | The same in Night, with the warm-paper Note plate. |
| `6-2-compose-no-members.png` | The composer's warning when nobody is in the chosen audience. |

Checksums and sizes are in `manifest.json`. The scenario scripts that produced them are in
`tests/scenarios/lane-6/` (`e6-2-today.mjs` and `e6-2-audience.mjs`, with `LANE6_OUT` set).
