// lockscope-check.cjs — PROP-LOCKSCOPE1: how much of the table is in the frame.
//
// WHAT CHANGED. Two things, deliberately in lockstep:
//
//   invalidation   resetLocksIfNeeded used to set EVERY account in the circle back
//                  to "shop" on any board change at all. It now clears only the
//                  SETTLEMENT UNIT the change belongs to.
//   the signature  a lock commitment used to photograph the whole board. It now
//                  photographs the same settlement unit, and NAMES that frame in
//                  the signed bytes (`basisScope`), under a new spec id.
//
// WHY BOTH OR NEITHER. Change only the invalidation and you get an account that
// still reads as locked whose signature is silently discarded at settlement — a
// lock that looks valid and settles unsigned. Change only the basis and you get the
// reverse. Either half alone is worse than the blunt version. That is the property
// this suite exists to hold: the two halves agree.
//
// NOT A TICKET GATE. This is a correctness fix to the lock model that stands on its
// own merits and would be worth doing if tickets were abandoned tomorrow, so it gets
// its own suite and does not ride the ticket gates (build plan §8 E).
//
// A NOTE ON THE LOG ASSERTS. Three facts here are backend-internal — whether a
// commitment verified, under which frame, and what the settlement carried — and
// there is no client-visible projection of any of them (commitments are held
// backend-side on purpose, PROP-LOCKSIGN1). They are read out of alpha's elog,
// which means those asserts only run when the harness shares a box with the backend.
// They SKIP loudly rather than passing quietly when it doesn't.
//
//   node lockscope-check.cjs
//   API=https://alpha.katlab.kpay.live BASE=https://lab1.katlab.kpay.live node lockscope-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const fs = require("fs")
const API  = (process.env.API  || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const ELOG = process.env.ELOG_PATH || "/home/hbarlive_hts-alpha/log/elog_error_log.txt"
const INSTANCE = "LOCKSCOPE-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "lsc-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[lockscope]", ...a)

const fails = []
let n = 0, skipped = 0
const t = (name, ok, detail = "") => { n++
  log(ok ? "PASS" : "FAIL", `T:${INSTANCE}.${n}`, name, detail)
  if(!ok) fails.push(`.${n} ${name} ${detail}`) }
const skip = (name, why) => { skipped++; log("SKIP", name, "—", why) }

async function reportKflow(checkpoint, v, detail){
  try {
    const commit = await fetch(BASE + "/m/katomia/qa/results.php?days=1").then(r => r.json()).then(j => j.commit || "").catch(() => "")
    await fetch(BASE + "/kflow", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID, seq: checkpoint === "test:start" ? 1 : 2,
        tier: "fe", checkpoint, v, commit, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
  } catch(e){ log("kflow report failed (non-fatal):", e.message) }
}

const mkCircle = (extra = {}) => fetch(API + "/katomia/create", { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ network: "playnet", visibility: "unlisted", profile: { name: "QA " + RUN_ID }, ...extra }) })
  .then(r => r.json())

// With no accounts the footer control is a BUTTON; once you hold one it becomes a
// SELECT whose "➕ Add account" option opens the same dialog.
async function addManual(page, acct){
  const btn = page.locator("button.ring-footer-accsel")
  if(await btn.count()) await btn.first().click({ timeout: 15000 })
  else await page.selectOption("select.ring-footer-accsel", "__add")
  await page.waitForTimeout(600)
  await page.fill("#addAcctManual", acct)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(1200)
  if(await page.locator("#addAcctJoinAll").isVisible().catch(() => false)) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(1500)
}

const idOf   = (page, hac) => page.evaluate(h => getAccounts().find(a => a.label === h)?.id, hac)
const modeOf = (page, hac) => page.evaluate(h => getAccounts().find(a => a.label === h)?.mode, hac)
const assetsOf = (page, hac) => page.evaluate(h => getAccounts().find(a => a.label === h)?.assets || {}, hac)

// a plain offer between two accounts, straight down the wire — the gesture is not
// what is under test here, the graph edge it creates is
const offer = async (page, fromHac, toHac, assetId) => {
  await page.evaluate(async ([f, tt, asset]) => {
    const from = getAccounts().find(a => a.label === f), to = getAccounts().find(a => a.label === tt)
    socket.send(JSON.stringify({ type: "game_offer", gameId, fromId: from.id, toId: to.id, assetId: asset, amount: 1 }))
  }, [fromHac, toHac, assetId])
  await page.waitForTimeout(1600)
}

// THE SIGNED path — boardToggleLock builds and sends the commitment. Locking via a
// raw game_toggleLock would prove nothing about the frame.
const lockIt = async (page, hac, on = true) => {
  await page.evaluate(async ([h, want]) => {
    const acc = getAccounts().find(a => a.label === h)
    if((acc.mode === "lock") === want) return
    await boardToggleLock(acc)
  }, [hac, on])
  await page.waitForTimeout(1800)
}

// elog readers — see the note at the top about why these are file reads.
// elogMark()/elogNew() read only what the backend wrote since the mark, which is the
// only way to assert "this action logged X" on a log every other test is also writing to.
const elogTail = () => { try { return fs.readFileSync(ELOG, "utf8") } catch { return null } }
const elogMark = () => { try { return fs.statSync(ELOG).size } catch { return null } }
const elogNew = from => {
  if(from === null) return null
  try {
    const fd = fs.openSync(ELOG, "r")
    const size = fs.fstatSync(fd).size
    if(size < from){ fs.closeSync(fd); return fs.readFileSync(ELOG, "utf8") }   // rotated
    const buf = Buffer.alloc(size - from)
    fs.readSync(fd, buf, 0, buf.length, from)
    fs.closeSync(fd)
    return buf.toString("utf8")
  } catch { return null }
}
const elogSince = (whole, mark) => {
  const i = whole.lastIndexOf(mark)
  return i === -1 ? whole : whole.slice(i)
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const br = await chromium.launch()
  try {
    const mkPage = async gid => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      page.__dialogs = []
      page.on("dialog", d => { page.__dialogs.push(d.message()); d.accept() })
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2500)
      return page
    }

    // ══ two disjoint clusters on one board ════════════════════════════════════
    // Four accounts under ONE player, so every lock can be driven from one page.
    // That is also the interesting shape for the frame: the player ends up with a
    // locked account in one cluster and business in another, which is exactly the
    // case a single whole-board photograph cannot describe.
    const g1 = (await mkCircle()).gameId
    log("circle", g1)
    const p = await mkPage(g1)
    for(const a of ["0.0.111", "0.0.222", "0.0.333", "0.0.444"]) await addManual(p, a)
    await p.waitForTimeout(1200)
    t("four accounts are on the board", await p.evaluate(() => getAccounts().length) === 4,
      JSON.stringify(await p.evaluate(() => getAccounts().map(a => a.label))))

    await offer(p, "0.0.111", "0.0.222", "apple")    // cluster A
    await offer(p, "0.0.333", "0.0.444", "banana")   // cluster B
    t("the lock rule is cluster", await p.evaluate(() => gameMeta?.lockRule || "cluster") === "cluster")

    // ══ 1. a lock in an unrelated cluster survives a change elsewhere ═════════
    // Only ONE member of cluster B locks, so B cannot settle and the lock stays
    // observable. This is the headline behaviour: before PROP-LOCKSCOPE1 the offer
    // below tore this lock up from the other side of the board.
    const markLock = elogMark()
    await lockIt(p, "0.0.333")
    t("a member of cluster B is locked", await modeOf(p, "0.0.333") === "lock")

    await offer(p, "0.0.111", "0.0.222", "carrot")   // a change entirely inside cluster A
    t("a change in cluster A does NOT unlock cluster B", await modeOf(p, "0.0.333") === "lock",
      "333=" + await modeOf(p, "0.0.333"))
    t("…and cluster A's own members are not locked either", await modeOf(p, "0.0.111") !== "lock")

    // the commitment must have been framed on B, not on the board — and the two
    // codebases must have computed that frame identically, or it is REJECTED
    const b333 = await idOf(p, "0.0.333"), b444 = await idOf(p, "0.0.444")
    const sinceLock = elogNew(markLock)
    if(sinceLock === null) skip("the commitment verified under cluster B's frame", "elog not readable from here")
    else {
      // the regression this suite found on its first run: buildLockCommitment
      // returns null when signOrder is missing, and board.php did not load it
      t("the lock was SIGNED at all (board.php can reach signOrder)",
        /lock commitment (stored|REJECTED)/.test(sinceLock),
        /lock commitment/.test(sinceLock) ? "" : "nothing reached the backend — buildLockCommitment returned null")
      t("the commitment verified (frontend and backend agree on the frame)",
        /lock commitment stored/.test(sinceLock) && !/lock commitment REJECTED/.test(sinceLock),
        (sinceLock.match(/lock commitment (stored|REJECTED)[^\n]{0,120}/g) || []).join(" | ").slice(0, 220))
      const want = "cluster:" + [b333, b444].sort().join(",")
      t("…and the frame it stored is cluster B, not the board",
        sinceLock.includes(want), want)
    }

    // ══ 2. merging two clusters drops the newly-stale lock ════════════════════
    // The union-of-after-clusters rule has to see this: the offer joins A and B, so
    // the lock in B is now part of a settlement unit it never agreed to.
    await offer(p, "0.0.222", "0.0.333", "apple")
    t("merging the two clusters DOES unlock the stale side", await modeOf(p, "0.0.333") !== "lock",
      "333=" + await modeOf(p, "0.0.333"))

    // ══ 3. a change that splits a cluster reaches both halves ═════════════════
    // Withdrawing the merge edge splits the mega-cluster back into A and B. Every
    // account that was in the old cluster is reachable from one of the two endpoints,
    // so both halves must be unlocked — this is the direction a naive
    // "unlock the after-cluster of the touched account" rule gets wrong.
    await lockIt(p, "0.0.111")
    await lockIt(p, "0.0.444")
    const preSplit = [await modeOf(p, "0.0.111"), await modeOf(p, "0.0.444")]
    t("both ends of the merged cluster are locked", preSplit.every(m => m === "lock"), JSON.stringify(preSplit))
    await p.evaluate(async () => {
      const from = getAccounts().find(a => a.label === "0.0.222"), to = getAccounts().find(a => a.label === "0.0.333")
      socket.send(JSON.stringify({ type: "game_withdraw", gameId, fromId: from.id, toId: to.id, assetId: "apple" }))
    })
    await p.waitForTimeout(1800)
    const postSplit = [await modeOf(p, "0.0.111"), await modeOf(p, "0.0.444")]
    t("splitting the cluster unlocks BOTH halves", postSplit.every(m => m !== "lock"), JSON.stringify(postSplit))

    // ══ 4. a commitment signed under the new frame verifies at settlement ═════
    // Lock both members of cluster B; it settles, and the tx source must carry the
    // player's signature rather than the unsigned-participant placeholder.
    const beforeAssets = await assetsOf(p, "0.0.444")
    const markSettle = elogMark()
    await lockIt(p, "0.0.333")
    await lockIt(p, "0.0.444")
    await p.waitForTimeout(3200)
    const afterAssets = await assetsOf(p, "0.0.444")
    t("cluster B settled", (afterAssets.banana || 0) > (beforeAssets.banana || 0),
      JSON.stringify({ before: beforeAssets.banana || 0, after: afterAssets.banana || 0 }))

    const sinceSettle = elogNew(markSettle)
    if(sinceSettle === null) skip("settlement carried the signed commitment", "elog not readable from here")
    else {
      const proposal = sinceSettle.match(/"proposal":[\s\S]{0,2500}?\n\s{4}\}/)?.[0] || ""
      t("settlement carried a SIGNED commitment, not a null placeholder",
        /"intentPublicKey": "[0-9a-f]{10}/.test(proposal), proposal.slice(0, 200).replace(/\s+/g, " "))
      t("…framed on the cluster that settled, not the whole board",
        /"basisScope": "cluster:/.test(proposal),
        (proposal.match(/"basisScope": "[^"]*"/) || [])[0] || "none")
      t("nothing was dropped as stale at settlement",
        !/stale lock commitment dropped/.test(sinceSettle),
        (sinceSettle.match(/stale lock commitment dropped[^\n]{0,140}/) || [])[0] || "")
    }

    // ══ 5. an old-spec (whole-board) commitment still verifies ════════════════
    // The one-way door has a way back only if v1 keeps working. Built by hand here
    // because no current client emits it any more.
    await offer(p, "0.0.111", "0.0.222", "apple")
    await lockIt(p, "0.0.111")
    const markV1 = elogMark()
    const v1 = await p.evaluate(async () => {
      const fields = ["specVersion","gameId","network","basisHash"]
      const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fields)))
      const spec = Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,8)
      const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
      const payload = { specVersion: spec, gameId, network: gameMeta?.network ?? null,
        basisHash: await computeProposalBasisHash() }        // no scope = whole board
      const signature = await signOrder(payload, privateKey, publicKeyJwk)
      socket.send(JSON.stringify({ type: "game_lockCommitment", gameId, commitment: { payload, signature } }))
      return spec
    })
    await p.waitForTimeout(1500)
    // pinned: the id IS the sha of the old field list, so it can only change if
    // someone edits that list — which would silently invalidate every old commitment
    t("the v1 prop spec id is unchanged", v1 === "90bc87be", v1)
    const sinceV1 = elogNew(markV1)
    if(sinceV1 === null) skip("a v1 commitment still verifies", "elog not readable from here")
    else {
      t("a whole-board v1 commitment is still accepted",
        /lock commitment refreshed/.test(sinceV1) && !/refresh REJECTED/.test(sinceV1),
        (sinceV1.match(/lock commitment refresh[^\n]{0,160}/g) || []).join(" | ").slice(0, 220))
    }

    // ══ 6. lockRule "active" keeps the blunt sweep ════════════════════════════
    // Under active/all the settlement unit IS the active mega-cluster, so a change
    // anywhere really can invalidate anyone — narrowing there would be the bug.
    const created = await mkCircle({ lockRule: "active" })
    const g2 = created.gameId
    const p2 = await mkPage(g2)
    for(const a of ["0.0.111", "0.0.222", "0.0.333", "0.0.444"]) await addManual(p2, a)
    await p2.waitForTimeout(1000)
    const rule2 = await p2.evaluate(() => gameMeta?.lockRule)
    if(rule2 !== "active"){
      skip("lockRule active keeps the blunt sweep", `create ignored lockRule (got ${rule2})`)
    } else {
      await offer(p2, "0.0.111", "0.0.222", "apple")
      await offer(p2, "0.0.333", "0.0.444", "banana")
      const markActive = elogMark()
      await lockIt(p2, "0.0.333")
      t("[active] a member is locked", await modeOf(p2, "0.0.333") === "lock")
      const sinceActive = elogNew(markActive)
      if(sinceActive === null) skip("[active] the frame stays the whole board", "elog not readable from here")
      else t("[active] the frame stays the whole board",
        /lock commitment stored/.test(sinceActive) && /"scope": "board"/.test(sinceActive)
          && !/"scope": "cluster:/.test(sinceActive),
        (sinceActive.match(/"scope": "[^"]*"/g) || []).join(",") || "nothing stored")
      await offer(p2, "0.0.111", "0.0.222", "carrot")
      t("[active] a change ANYWHERE still unlocks everyone", await modeOf(p2, "0.0.333") !== "lock",
        "333=" + await modeOf(p2, "0.0.333"))
    }

    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, skipped, fails })
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 250)) }
  await br.close()
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green${skipped ? ` (${skipped} skipped)` : ""}`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
