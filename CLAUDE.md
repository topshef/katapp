# katapp — working notes for a Claude session

Read `README.md` (what runs where, layout) and `SPLIT.md` (where this came from). The estate's
register is `topshef/kmigrate` (record `katomia-labs`); log changes there as other sessions do.

- **`build/dist` is committed and is what deploys.** After any edit under `public_html/` or
  `build/`, run `bash build/build-static.sh` and commit source and dist together.
  `bash build/dist-fresh.sh` is the gate. It rebuilds dist, so never run it at the same time
  as the QA suites.
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
