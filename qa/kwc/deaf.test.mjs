// qa/kwc/deaf.test.mjs — WC-DEAFSOCKET1 F1: the rules for recovering a deaf relay link.
// The rules matter more than the plumbing: R1/R2 (kwcScriptTag.php) broke phone signing by
// acting on a failed ping. These pin that a hidden page, a reported drop, a settled sign and a
// recent restart are all left alone, and that a resend needs the wallet to answer a second ping.
// Run: node --test qa/kwc/deaf.test.mjs   (CI: katui.yml, job router; Node 22 will not take a directory)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deafDecision, shouldResend, isMobileClient, DEAF_COOLDOWN_MS } from '../../public_html/vendor/walletconnect/builder/src/kwcDeaf.mjs'

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
test('F1-MOBILE1: never resend on a phone (the page stays visible during auto-sign there)', () => {
  assert.equal(shouldResend({ settled: false, ping2Ok: true, mobile: true }), false)
  assert.equal(shouldResend({ settled: false, ping2Ok: true, mobile: false }), true)
})
test('isMobileClient: phones and tablets, not desktops', () => {
  assert.equal(isMobileClient('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36', 5), true)
  assert.equal(isMobileClient('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true)
  assert.equal(isMobileClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5), true)   // iPadOS
  assert.equal(isMobileClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0), false)
  assert.equal(isMobileClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36', 0), false)
})
