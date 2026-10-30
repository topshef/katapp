# katapp — working notes for a Claude session

Read `README.md` (what runs where, layout) and `SPLIT.md` (where this came from). The estate's
register is `topshef/kmigrate` (record `katomia-labs`); log changes there as other sessions do.

- **`build/dist` is committed and is what deploys.** After any edit under `public_html/` or
  `build/`, run `bash build/build-static.sh` and commit source and dist together.
  `bash build/dist-fresh.sh` is the gate. It rebuilds dist, so never run it at the same time
  as the QA suites.
- **Serving at the root (no `/m/katomia` in the URL) is the next job here, and it is NOT done.**
  Planned 2026-10-19 with the split, never started; on 2026-10-30 lab1 (and labs, lab2) still
  answer `/ → 302 /m/katomia/` (`build/router.js`, and `build/build-static.sh` renders under
  `K=/m/katomia`). Do it here, on lab1 first. What to change and which links must keep working:
  kmigrate `modules/katomia-labs.json` (todo `ROOT-MOVE`) and the plan
  https://claude.ai/artifact/5e63151e-bbfd-4d32-b9e5-752c8a8eb13e. phpjabbers still holds the
  copy labs serves; an edit there does not reach this repo.
- **Never make this repo deploy as `katui`.** `build/variant.env` names the Worker
  (`katui-lab1`). labs.katomia.com (`katui`) is built from phpjabbers and is the owner's
  benchmark; the owner rewires it, not a session.
- **Deploying lab1:** push `main`, then move `lab1` to the same commit. The Cloudflare Worker
  `katui-lab1` builds branch `lab1`. Poll `https://lab1.katomia.com/m/katomia/build-info.json`
  until `built` changes, and only then say it is live.
- **Report the footer build stamp** the owner will see (`build <parent sha> · <built UTC>`), and
  never claim a fix is live before it is pushed and the build-info shows it.
- Tests: `node build/router.test.mjs`, `node build/router.e2e.mjs`, `qa/board` (`node run.mjs`),
  `qa/sign` (`node run.mjs`).
- Facts nobody has confirmed carry the prefix `UNCERTAIN:`. Small, safe changes, with comments
  that say why.
