// kwcDeaf.mjs — WC-DEAFSOCKET1 F1 (owner go 2026-11-09): when to recover a deaf relay link.
//
// WHAT HAPPENED. lab1, desktop Chrome + HashPack, 2026-11-09 21:15–21:20Z: the page's relay
// WebSocket stayed OPEN but received nothing for ~5 minutes. Four order matches each sent a sign
// request; HashPack received and auto-approved them; no answer came back (KWC-TIMEOUT after 69 s
// each), and every session ping timed out. The relayer never reported a disconnect, so
// WC-RELAYHEALTH1's guard (which acts on relayer_disconnect / stalled) never fired. WalletConnect
// core's own stall detector (resetPingTimeout → socket.terminate) runs only under Node, never in a
// browser. A reconnect at 21:20:35 fixed it at once (every sign after it returned in ~0.4 s).
//
// THE RULE. A failed session ping, while a sign is in flight and the relayer CLAIMS to be connected,
// on a VISIBLE page, means the link is probably deaf: restart the transport once. Then ping again;
// only if the wallet answers that second ping is the request re-sent (so the resend can never be a
// second prompt on a phone whose wallet is asleep).
//
// WHY THE GUARDS (do not loosen without reading kwcScriptTag.php's history):
//   - hidden page → skip. On a phone the wallet app is in front while the user approves and the
//     ping ALWAYS fails (wallets stop answering pings when backgrounded). R1 (a99a66e) made the ping
//     a hard gate and failed 31/32 mobile signs; R2 (e31d3b7) let it shorten the cap and killed slow
//     approvals. This rule never touches a hidden page.
//   - relayer not connected → skip. A reported drop is WC-RELAYHEALTH1's job (it restarts itself).
//   - one restart per 15 s across the page, so concurrent signs cannot make it thrash.
//   - the resend happens only after a SECOND ping succeeds: the wallet is awake and the link works,
//     so the first answer was lost and asking again is the only way to get it.
//   - F1-MOBILE1 (owner 2026-11-10): never resend on a phone. During ORDER AUTO-SIGN a phone's wallet
//     is never brought forward, so the page stays VISIBLE and the hidden-page guard does not apply;
//     on 10 Nov 00:12 and 00:17Z the resend left a duplicate approval waiting in HashPack (one was
//     answered 77 s after its deal had settled). Phones keep the reconnect (harmless; the relay
//     redelivers an unacknowledged answer after it), desktops keep the resend.

export const DEAF_COOLDOWN_MS = 15_000

// → 'restart' | 'skip-settled' | 'skip-hidden' | 'skip-disconnected' | 'skip-cooldown'
export function deafDecision({ settled, connected, visible, sinceLastMs }) {
  if (settled) return 'skip-settled'
  if (!visible) return 'skip-hidden'
  if (!connected) return 'skip-disconnected'
  if (Number.isFinite(sinceLastMs) && sinceLastMs < DEAF_COOLDOWN_MS) return 'skip-cooldown'
  return 'restart'
}

// after the restart: resend only if the wallet answered the second ping, nothing has settled, and
// this is not a phone (F1-MOBILE1)
export function shouldResend({ settled, ping2Ok, mobile }) {
  return !settled && ping2Ok === true && !mobile
}

// a phone or tablet, as far as the page can tell (iPadOS reports a desktop Safari UA but has touch)
export function isMobileClient(ua, maxTouchPoints) {
  const s = String(ua || '')
  return /Android|iPhone|iPad|iPod|Mobile/i.test(s) || (/Macintosh/.test(s) && Number(maxTouchPoints) > 1)
}
