// ordersig-check.cjs — PROP-TICKETS1 phase I: the order intent signature, and what
// it covers.
//
// A NODE UNIT SUITE, not a browser gate. The property under test is "which bytes did
// the maker actually sign", and the honest way to test that is to sign something,
// change one field, and watch verification fail. A browser cannot do that — every
// order it produces is self-consistent by construction, so a UI test would pass just
// as happily if the dial were outside the signature, which is the bug this phase
// exists to close.
//
// It runs against the BACKEND's own module, so it is the same code that decides
// whether a settlement dial is honoured — not a re-implementation of it.
//
//   node ordersig-check.cjs
//   BACKEND=/home/hbarlive_hts-alpha node ordersig-check.cjs
const crypto = require("crypto")
const BACKEND = process.env.BACKEND || "/home/hbarlive_hts-alpha"
const INSTANCE = "ORDERSIG-01"
const RUN_ID = "osig-" + Date.now().toString(36)
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[ordersig]", ...a)

const fails = []
let n = 0
const t = (name, ok, detail = "") => { n++
  log(ok ? "PASS" : "FAIL", `T:${INSTANCE}.${n}`, name, detail)
  if(!ok) fails.push(`.${n} ${name} ${detail}`) }

async function reportKflow(checkpoint, v, detail){
  try {
    await fetch(BASE + "/kflow", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID, seq: checkpoint === "test:start" ? 1 : 2,
        tier: "be", checkpoint, v, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
  } catch(e){ log("kflow report failed (non-fatal):", e.message) }
}

const sig = require(BACKEND + "/katomiaOrderSig")
const { SIG_SPECS, SPEC_V1, SPEC_V2, buildIntentPayload, verifyOrderIntent, orderIntentCovers } = sig

const GAME = "QA" + RUN_ID.slice(-4).toUpperCase(), NET = "playnet"
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519")
const pubkeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex")

// Sign an order the way a client does: build the canonical payload for the spec,
// stringify it, ed25519 over those bytes.
function signOrder(order, specVersion){
  const payload = buildIntentPayload({ specVersion, gameId: GAME, network: NET, order })
  const s = crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey)
  return { ...order, intentSignature: { alg: "Ed25519", spec: specVersion, sig: s.toString("base64"), pubkeyHex } }
}

const mkOrder = (over = {}) => ({
  bundle: [{ accountId: "0.0.111", asset: "apple", amount: -1 },
           { accountId: "0.0.111", asset: "banana", amount: 1 }],
  minFill: { numerator: 1, denominator: 1 },
  timeInForce: "GTC",
  expiresAt: 0,
  clientOrderId: "c-" + RUN_ID,
  issuedAt: 1755800000000,
  matchConditions: null,
  autoLock: "none",
  ...over
})

// stamp the verdict the way orderCreate does, so orderIntentCovers sees what it sees
const stamped = order => {
  const v = verifyOrderIntent({ order, gameId: GAME, network: NET })
  return { ...order, sigOk: v.ok, sigSpec: v.spec, _v: v }
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })

  // ══ 1. the registry ═══════════════════════════════════════════════════════
  // Spec ids are DERIVED from the field lists, never written down, so an id can
  // never name a list it no longer matches. These two values are the wire contract
  // with every client and every verifier, so they are pinned here: changing one
  // should require changing this line, deliberately.
  t("v1 is still 049f1b69 (the order book's spec, unchanged)", SPEC_V1 === "049f1b69", SPEC_V1)
  t("v2 is 1dcbd8c4", SPEC_V2 === "1dcbd8c4", SPEC_V2)
  t("both specs are in the registry", Object.keys(SIG_SPECS).length === 2, JSON.stringify(Object.keys(SIG_SPECS)))
  t("v1 does NOT cover the dial", !SIG_SPECS[SPEC_V1].includes("autoLock"))
  t("v2 covers the dial, the expiry and the match conditions",
    ["autoLock","expiresAt","matchConditions"].every(f => SIG_SPECS[SPEC_V2].includes(f)),
    JSON.stringify(SIG_SPECS[SPEC_V2]))
  t("v2 is v1 plus three fields, in that order — v1's bytes are untouched",
    JSON.stringify(SIG_SPECS[SPEC_V2].slice(0, 8)) === JSON.stringify(SIG_SPECS[SPEC_V1]))

  // ══ 2. a well-formed signature verifies ═══════════════════════════════════
  const firm = stamped(signOrder(mkOrder({ autoLock: "maker" }), SPEC_V2))
  t("a v2-signed ticket verifies", firm.sigOk === true, firm._v.reason || "")
  t("…and its dial is covered", orderIntentCovers(firm, "autoLock") === true)

  const legacy = stamped(signOrder(mkOrder(), SPEC_V1))
  t("a v1-signed order still verifies", legacy.sigOk === true, legacy._v.reason || "")
  t("…but its dial is NOT covered", orderIntentCovers(legacy, "autoLock") === false)

  // ══ 3. THE POINT OF THE PHASE — the dial is inside the bytes ══════════════
  // Sign "Negotiable", ship "Instant". Before phase I this was undetectable: the
  // dial was not in the payload, so the signature verified either way and the
  // backend honoured whatever autoLock arrived. Now it must fail.
  const tampered = stamped({ ...signOrder(mkOrder({ autoLock: "none" }), SPEC_V2), autoLock: "both" })
  t("a dial changed after signing FAILS verification", tampered.sigOk === false, tampered._v.reason)
  t("…so the tampered dial is not covered", orderIntentCovers(tampered, "autoLock") === false)

  // the same order, untampered, still passes — proving the failure above is the
  // edit and not something incidental about the fixture
  t("the same order unedited verifies", stamped(signOrder(mkOrder({ autoLock: "none" }), SPEC_V2)).sigOk === true)

  // ══ 4. the other two fields that used to ride outside ═════════════════════
  const expEdit = stamped({ ...signOrder(mkOrder({ expiresAt: 0 }), SPEC_V2), expiresAt: 9999999999999 })
  t("an expiry changed after signing FAILS", expEdit.sigOk === false, expEdit._v.reason)
  const mcEdit = stamped({ ...signOrder(mkOrder(), SPEC_V2), matchConditions: { onlyFrom: ["0.0.999"] } })
  t("match conditions changed after signing FAIL", mcEdit.sigOk === false, mcEdit._v.reason)

  // ══ 5. the bundle is still pinned (v1's guarantee, not regressed) ═════════
  const bundleEdit = stamped({ ...signOrder(mkOrder({ autoLock: "maker" }), SPEC_V2),
    bundle: [{ accountId: "0.0.111", asset: "apple", amount: -99 },
             { accountId: "0.0.111", asset: "banana", amount: 1 }] })
  t("a repriced bundle FAILS verification", bundleEdit.sigOk === false, bundleEdit._v.reason)

  // ══ 6. refusals are quiet and specific, never throws ══════════════════════
  t("an unsigned order is 'unsigned', not an error",
    verifyOrderIntent({ order: mkOrder(), gameId: GAME, network: NET }).reason === "unsigned")
  t("an unknown spec id is named in the reason",
    /unknown sig spec/.test(verifyOrderIntent({
      order: { ...mkOrder(), intentSignature: { spec: "deadbeef", sig: "AA==", pubkeyHex } },
      gameId: GAME, network: NET }).reason || ""))
  t("garbage in a signature does not throw",
    verifyOrderIntent({ order: { ...mkOrder(), intentSignature: { spec: SPEC_V2, sig: "!!!!", pubkeyHex: "zz" } },
      gameId: GAME, network: NET }).ok === false)
  t("a signature for a DIFFERENT game does not verify here",
    verifyOrderIntent({ order: signOrder(mkOrder(), SPEC_V2), gameId: "OTHER1", network: NET }).ok === false)
  t("a signature for a DIFFERENT network does not verify here",
    verifyOrderIntent({ order: signOrder(mkOrder(), SPEC_V2), gameId: GAME, network: "mainnet" }).ok === false)

  // ══ 7. the KEA mandate is rebuilt by this same code ═══════════════════════
  // kpoolKea used to hold its own copy of the registry. If it ever grows a second
  // one, this fails: the mandate payload must be byte-identical to what verified.
  const kea = require(BACKEND + "/kpoolKea")
  t("kpoolKea exposes only buildKeaDetail (no second registry)",
    JSON.stringify(Object.keys(kea)) === '["buildKeaDetail"]', JSON.stringify(Object.keys(kea)))
  const payloadA = buildIntentPayload({ specVersion: SPEC_V2, gameId: GAME, network: NET, order: firm })
  t("the mandate payload carries the dial the maker signed",
    payloadA.autoLock === "maker", JSON.stringify(payloadA.autoLock))

  await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails })
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
