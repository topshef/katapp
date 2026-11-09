// qa/kwc/deaf.test.mjs — WC-DEAFSOCKET1 F1: the rules for recovering a deaf relay link.
// The rules matter more than the plumbing: R1/R2 (kwcScriptTag.php) broke phone signing by
// acting on a failed ping. These pin that a hidden page, a reported drop, a settled sign and a
// recent restart are all left alone, and that a resend needs the wallet to answer a second ping.
// Run: node --test qa/kwc/deaf.test.mjs   (CI: katui.yml, job router; Node 22 will not take a directory)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deafDecision, shouldResend, DEAF_COOLDOWN_MS } from '../../public_html/vendor/walletconnect/builder/src/kwcDeaf.mjs'

const base = { settled: false, connected: true, visible: true, sinceLastMs: Infinity }

test('a visible page, connected relayer, sign in flight → restart', () => {
  assert.equal(deafDecision(base), 'restart')
  assert.equal(deafDecision({ ...base, sinceLastMs: NaN }), 'restart')   // first time ever
})
test('a hidden page is never touched (phones: the wallet is in front, pings fail by design)', () => {
  assert.equal(deafDecision({ ...base, visible: false }), 'skip-hidden')
})
test('a reported drop is left to WC-RELAYHEALTH1', () => {
  assert.equal(deafDecision({ ...base, connected: false }), 'skip-disconnected')
})
test('an answered sign is left alone', () => {
  assert.equal(deafDecision({ ...base, settled: true }), 'skip-settled')
  assert.equal(deafDecision({ ...base, settled: true, visible: false, connected: false }), 'skip-settled')
})
test('one restart per cooldown across the page', () => {
  assert.equal(deafDecision({ ...base, sinceLastMs: 1000 }), 'skip-cooldown')
  assert.equal(deafDecision({ ...base, sinceLastMs: DEAF_COOLDOWN_MS - 1 }), 'skip-cooldown')
  assert.equal(deafDecision({ ...base, sinceLastMs: DEAF_COOLDOWN_MS }), 'restart')
})
test('resend only when the wallet answered the second ping and nothing settled', () => {
  assert.equal(shouldResend({ settled: false, ping2Ok: true }), true)
  assert.equal(shouldResend({ settled: false, ping2Ok: false }), false)
  assert.equal(shouldResend({ settled: false, ping2Ok: undefined }), false)
  assert.equal(shouldResend({ settled: true, ping2Ok: true }), false)
})
