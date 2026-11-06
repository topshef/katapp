# qa/ab — labs against lab1, live (AB-LABS1)

The comparison the owner asked for on 2026-11-06 before katapp becomes the default: every
address labs.katomia.com answers (phpjabbers, the benchmark) is asked of lab1.katomia.com
(katapp) at its root form, and the two are compared.

1. **API** — the same backend answers the same way through both hosts (circle list, one
   circle, both pool-list paths, the WalletConnect config naming its own origin).
2. **Pages** — 25 pages in a phone-sized Chromium, both hosts loaded at the same moment:
   status, title, amount of text, cards on Home and Circles, seats and chips and a live
   `game_state` on circles, page errors and failed same-site requests that lab1 has and labs
   does not, and no link left under `/m/katomia` on lab1.
3. **Old addresses** — each `/m/katomia/…` page asked of lab1 lands on its root form.

It compares shape, not bytes: lab1 differs on purpose in a few places (the report lists them),
and live circles move between loads. Run it from anywhere with network:

```bash
cd qa/ab && npm ci && npx playwright install chromium && OUT=reports/$(date -u +%F).md node run.mjs
```

Or from GitHub: Actions → katui → Run workflow (the `ab` job runs on manual runs only).
Dated reports in `reports/` are the audit trail; commit one when it says something new.
