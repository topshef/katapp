//  ┌┬┐┌─┐┌─┐┬   ┌─┐┌┐┌┌─┐┬┌┐┌┌─┐
//   ││├┤ ├─┤│   ├┤ ││││ ┬││││├┤
//  ─┴┘└─┘┴ ┴┴─┘ └─┘┘└┘└─┘┴┘└┘└─┘
//
//  dealEngine.js — PORTABLE deal-verification core. ONE file, runs unchanged on
//  Node.js (escrow signer / hapi) and in the browser (KEA), because it contains
//  NO environment-specific imports. Anything environmental — hashing, signature
//  verification, fetch, logging, clock — is supplied as injected "ports".
//
//  Wrappers on each side build an engine with the right ports:
//      Node : createDealEngine(require('./dealPorts.node'))
//      KEA  : createDealEngine(browserPorts)   // WebCrypto / @noble / window.fetch
//
//  Design echoes KEA's own kea-verify.js: a pipeline of named checks that each
//  produce pass / fail / skip / onhold — never a bare boolean. The engine NEVER
//  silently passes: a step it cannot perform is reported (skip/onhold), and if a
//  *required* step is unresolved the overall verdict is 'incomplete', not 'pass'.
//
//  Two transfer comparison modes:
//    exact   (default for deals)  — precision parity, element by element.
//    netting (KEA order style)    — residual subtraction, "no account worse off".
//
//  Forward map (brainstorm 2026-06-14):
//    deal published  ->  customer instantiates + fills  ->  wrapped as approval
//    package (tx + template + bindings + oracle promises)  ->  KEA/Node verifies:
//      1. package claims a dealId we approved
//      2. sha256(template) === dealId            (ports.hashJson)
//      3. replay(template, bindings) == tx transfers   (exact, default)
//      4. conditions hold (pure now; network -> skip)
//      5. oracle values are replayable OR carry a signed provider promise
//         (ports.verifyEd25519 against ports.trustedKeys)
//      6. scope extras (operator / validDuration / startTime) if the deal asks
//    ...sign only when verdict === 'pass'.

;(function (root, factory) {
    const api = factory()
    if (typeof module !== 'undefined' && module.exports) module.exports = api          // Node / CommonJS
    else if (typeof define === 'function' && define.amd) define([], function () { return api }) // AMD
    else { root.DealEngine = api }                                                       // browser global
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict'

    // ── pure helpers (no ports needed) ───────────────────────────────────────

    function deepClone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)) }
    function defaultCanonicalJson(obj) { return JSON.stringify(obj) } // matches PHP json_encode & KEA canonicalJson

    function isNumericString(v) {
        if (typeof v === 'number') return Number.isFinite(v)
        if (typeof v !== 'string') return false
        if (v.trim() === '') return false
        return !Number.isNaN(Number(v.trim()))
    }
    function round8(n) { return Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8 }
    function unresolvedTokens(str) {
        if (typeof str !== 'string') return []
        return str.match(/\{[^}]+\}/g) || []
    }
    function normaliseAssetId(asset) { return String(asset).toUpperCase() === 'HBAR' ? 'HBAR' : String(asset) }

    // ── safe maths (mirrors dealSignEscrow.php isValidMathExpression + eval) ──

    const MATH_FN_RE = /\b(sqrt|abs|log|log10|exp|sin|cos|tan|asin|acos|atan|pow|min|max|ceil|floor|round)\b/g
    const VALID_EXPR_RE = /^[0-9+\-\/*.()\s]+$|^[0-9+\-\/*.\s]*\b(sqrt|abs|log|log10|exp|sin|cos|tan|asin|acos|atan|pow|min|max|ceil|floor|round)\b\([0-9+\-\/*.,\s]+\)[0-9+\-\/*.\s]*$/

    function bracketsBalanced(expr) {
        let bal = 0
        for (const ch of expr) { if (ch === '(') bal++; else if (ch === ')') bal--; if (bal < 0) return false }
        return bal === 0
    }
    function isValidMathExpression(expr) {
        if (typeof expr !== 'string') return false
        return VALID_EXPR_RE.test(expr) && bracketsBalanced(expr)
    }
    function safeEvalMath(expr) {
        if (!isValidMathExpression(expr)) return { ok: false, error: `invalid expression: ${expr}` }
        const js = expr.replace(MATH_FN_RE, (n) => `Math.${n}`)
        try {
            // eslint-disable-next-line no-new-func
            const fn = new Function('Math', `"use strict"; return (${js});`)
            const result = fn(Math)
            if (typeof result !== 'number' || !Number.isFinite(result)) return { ok: false, error: `non-finite: ${expr}` }
            return { ok: true, value: round8(result) }
        } catch (e) { return { ok: false, error: `eval failed "${expr}": ${e.message}` } }
    }

    // ── normaliseDeal: legacy vs v0.2 step shape ─────────────────────────────

    function normaliseDeal(deal) {
        if (!deal || typeof deal !== 'object') return { kind: 'invalid', reason: 'deal is not an object' }
        const isSteps = Array.isArray(deal.steps) || deal.dealVersion === '0.2' || deal?.context?.engine === 'fillDeal'
        if (isSteps) {
            return {
                kind: 'steps', version: deal.dealVersion || '0.2',
                network: deal?.context?.network || deal.network || null,
                inputs: deal.inputs || {}, state: deal.state || {}, steps: deal.steps || [], output: deal.output || {},
                scope: deal.scope || deal?.context?.scope || null, api: deal.api || []
            }
        }
        return {
            kind: 'legacy', version: deal?.header?.dealVersion || '0.1',
            network: deal?.header?.network || deal.network || null,
            alias: deal.alias || {}, constants: deal.constants || {}, parameters: deal.parameters || {},
            api: deal.api || [], conditions: deal.conditions || [], scope: deal.scope || null,
            template: {
                addHbarTransfer: Array.isArray(deal.addHbarTransfer) ? deal.addHbarTransfer : [],
                addTokenTransfer: Array.isArray(deal.addTokenTransfer) ? deal.addTokenTransfer : [],
                addNftTransfer: Array.isArray(deal.addNftTransfer) ? deal.addNftTransfer : []
            }
        }
    }

    // ── injection ────────────────────────────────────────────────────────────

    function injectString(str, vars, buyer, trace) {
        if (typeof str !== 'string') return str
        let out = str
        for (const key of Object.keys(vars)) {
            const tok = '{' + key + '}'
            if (out.indexOf(tok) !== -1) { out = out.split(tok).join(String(vars[key])); if (trace) trace.push({ op: 'inject', key }) }
        }
        if (buyer && out.indexOf('buyer') !== -1) { out = out.split('buyer').join(String(buyer)); if (trace) trace.push({ op: 'injectBuyer' }) }
        return out
    }

    // ── fillDeal (legacy) ─────────────────────────────────────────────────────

    function fillDealLegacy(norm, bindings, opts) {
        const trace = []
        const vars = Object.assign({}, bindings || {}, norm.constants || {}) // constants win
        const buyer = opts.buyerAccountId ?? (bindings && (bindings.buyer || bindings.buyerAccountId)) ?? null

        const optionals = []
        for (const [p, attrs] of Object.entries(norm.parameters || {}))
            if (typeof attrs === 'string' && attrs.toLowerCase().includes('optional')) optionals.push(p)

        const out = {
            addHbarTransfer: deepClone(norm.template.addHbarTransfer),
            addTokenTransfer: deepClone(norm.template.addTokenTransfer),
            addNftTransfer: deepClone(norm.template.addNftTransfer)
        }
        const HBAR = ['accountId', 'value'], FT = ['tokenId', 'accountId', 'value'], NFT = ['tokenId', 'sender', 'serial', 'receiver']
        for (const x of out.addHbarTransfer) for (const f of HBAR) x[f] = injectString(x[f], vars, buyer, trace)
        for (const x of out.addTokenTransfer) for (const f of FT) x[f] = injectString(x[f], vars, buyer, trace)
        for (const x of out.addNftTransfer) for (const f of NFT) x[f] = injectString(x[f], vars, buyer, trace)

        const dropped = []
        const dropOpt = (arr, label) => arr.filter((x) => {
            const blob = JSON.stringify(x); const hit = optionals.find((p) => blob.includes('{' + p + '}'))
            if (hit) { dropped.push({ label, optional: hit }); return false } return true
        })
        out.addHbarTransfer = dropOpt(out.addHbarTransfer, 'hbar')
        out.addTokenTransfer = dropOpt(out.addTokenTransfer, 'token')
        out.addNftTransfer = dropOpt(out.addNftTransfer, 'nft')

        const evalErrors = []
        const evalVal = (x, label) => {
            const v = x.value
            if (isNumericString(v)) { x.value = Number(v); return }
            if (typeof v === 'string' && v.replace(/^-/, '') === '') { evalErrors.push({ label, value: v, error: 'empty value' }); return }
            const r = safeEvalMath(v)
            if (r.ok) { x.value = r.value; trace.push({ op: 'expr', from: v, to: r.value }) } else evalErrors.push({ label, value: v, error: r.error })
        }
        for (const x of out.addHbarTransfer) evalVal(x, 'hbar')
        for (const x of out.addTokenTransfer) evalVal(x, 'token')

        const unresolved = []
        const scan = (arr, fields, label) => arr.forEach((x, i) => fields.forEach((f) =>
            unresolvedTokens(x[f]).forEach((tok) => unresolved.push({ label, index: i, field: f, token: tok }))))
        scan(out.addHbarTransfer, HBAR, 'hbar'); scan(out.addTokenTransfer, FT, 'token'); scan(out.addNftTransfer, NFT, 'nft')

        return { ok: unresolved.length === 0 && evalErrors.length === 0, transfers: out, unresolved, evalErrors, dropped, optionals, trace }
    }

    // ── fillDeal (v0.2 steps) — deterministic subset only ────────────────────

    function fillDealSteps(norm, bindings, opts) {
        const trace = []
        const ctx = { state: Object.assign({}, norm.state, bindings || {}), unresolved: [], skipped: [] }
        const buyer = opts.buyerAccountId ?? (bindings && bindings.buyer) ?? null
        const resolve = (s) => injectString(s, ctx.state, buyer, trace)
        let tx = null
        for (const step of norm.steps) {
            switch (step.op) {
                case 'set': ctx.state[step.as] = resolve(step.value); break
                case 'input': ctx.state[step.as] = (bindings && bindings[step.from]) ?? step.default ?? null; break
                case 'text': ctx.state[step.as] = resolve(step.text); break
                case 'expr': { const r = safeEvalMath(resolve(step.expr)); if (r.ok) ctx.state[step.as] = r.value; else ctx.unresolved.push({ step: 'expr', as: step.as, error: r.error }); break }
                case 'range': break
                case 'serial': ctx.state[step.as] = step.select || `${step.from}:${step.to}`; break
                case 'tx': tx = step; break
                default: ctx.skipped.push(step.op) // api/balance/jwt/hash/webhook/custom/memo/txTime
            }
        }
        const out = { addHbarTransfer: [], addTokenTransfer: [], addNftTransfer: [] }
        if (tx) {
            for (const h of (tx.hbar || [])) { const r = safeEvalMath(resolve(String(h.amount))); out.addHbarTransfer.push({ accountId: resolve(h.account), value: r.ok ? r.value : resolve(String(h.amount)) }) }
            for (const t of (tx.tokens || [])) { const r = safeEvalMath(resolve(String(t.amount))); out.addTokenTransfer.push({ tokenId: resolve(t.token), accountId: resolve(t.account), value: r.ok ? r.value : resolve(String(t.amount)) }) }
            for (const n of (tx.nfts || [])) out.addNftTransfer.push({ tokenId: resolve(n.token), serial: resolve(String(n.serial)), sender: resolve(n.from), receiver: resolve(n.to) })
        }
        return { ok: ctx.unresolved.length === 0, transfers: out, unresolved: ctx.unresolved, skipped: ctx.skipped, trace }
    }

    function fillDeal(deal, bindings = {}, opts = {}) {
        const norm = normaliseDeal(deal)
        if (norm.kind === 'invalid') return { ok: false, transfers: { addHbarTransfer: [], addTokenTransfer: [], addNftTransfer: [] }, unresolved: [], error: norm.reason }
        return norm.kind === 'steps' ? fillDealSteps(norm, bindings, opts) : fillDealLegacy(norm, bindings, opts)
    }

    // ── canonical transfers (unify deal-shape AND KEA pchBasis-shape) ─────────
    // Returns a residual map { "accountId:asset": netAmount }. NFTs become ±1 on
    // "tokenId#serial". This is the bridge that lets a deal be netted the same
    // way KEA nets an order's signed bundle in verifyFillAgainstTransfers.

    function toCanonicalTransfers(x) {
        const map = {}
        const add = (acct, asset, amt) => {
            if (acct == null) return
            const k = `${acct}:${normaliseAssetId(asset)}`
            map[k] = (map[k] || 0) + Number(amt)
        }
        if (!x) return map
        // deal / filled shape
        for (const t of (x.addHbarTransfer || [])) add(t.accountId, 'HBAR', t.value)
        for (const t of (x.addTokenTransfer || [])) add(t.accountId, t.tokenId, t.value)
        for (const t of (x.addNftTransfer || [])) { add(t.sender, `${t.tokenId}#${t.serial}`, -1); add(t.receiver, `${t.tokenId}#${t.serial}`, +1) }
        // KEA pchBasis shape
        const p = x.transfers || x
        for (const t of (p.hbarTransfers || [])) add(t.accountId, 'HBAR', t.amount)
        for (const t of (p.tokenTransfers || [])) add(t.accountId, t.tokenId, t.amount)
        for (const t of (p.nftTransfers || [])) { add(t.senderAccountId, `${t.tokenId}#${t.serialNumber}`, -1); add(t.receiverAccountId, `${t.tokenId}#${t.serialNumber}`, +1) }
        return map
    }

    // ── exact comparator (precision parity; serial wildcards handled) ────────

    function isWildcardSerial(s) {
        if (s == null) return false
        const str = String(s).trim().toLowerCase()
        return str === 'any' || /(\d+)\s*(to|:)\s*(\d+)/.test(str) || str.startsWith('from')
    }
    function serialInRange(tpl, actual) {
        const m = String(tpl).toLowerCase().replace(/from/g, '').match(/(\d+)\s*(?:to|:)\s*(\d+)/)
        if (!m) return true
        const lo = Number(m[1]), hi = Number(m[2]), a = Number(actual)
        return Number.isFinite(a) && a >= Math.min(lo, hi) && a <= Math.max(lo, hi)
    }
    function valuesEqual(a, b) { return (isNumericString(a) && isNumericString(b)) ? round8(Number(a)) === round8(Number(b)) : String(a) === String(b) }

    function compareTransfersExact(expected, actual) {
        const diffs = []
        const cmp = (exp, act, fields, label, serialAware) => {
            exp = exp || []; act = act || []
            if (exp.length !== act.length) { diffs.push({ label, kind: 'count', expected: exp.length, actual: act.length }); return }
            exp.forEach((e, i) => {
                const a = act[i]
                fields.forEach((f) => {
                    if (serialAware && f === 'serial' && isWildcardSerial(e[f])) {
                        if (!serialInRange(e[f], a[f]) || !/^\d+$/.test(String(a[f]).trim()))
                            diffs.push({ label, index: i, field: f, expected: e[f], actual: a[f], note: 'serial wildcard not satisfied' })
                        return
                    }
                    const ok = (f === 'value') ? valuesEqual(e[f], a[f]) : String(e[f]).trim() === String(a[f]).trim()
                    if (!ok) diffs.push({ label, index: i, field: f, expected: e[f], actual: a[f] })
                })
            })
        }
        cmp(expected.addHbarTransfer, actual.addHbarTransfer, ['accountId', 'value'], 'hbar', false)
        cmp(expected.addTokenTransfer, actual.addTokenTransfer, ['tokenId', 'accountId', 'value'], 'token', false)
        cmp(expected.addNftTransfer, actual.addNftTransfer, ['tokenId', 'sender', 'receiver', 'serial'], 'nft', true)
        return { match: diffs.length === 0, mode: 'exact', diffs }
    }

    // ── netting comparator (KEA order style: no account worse off) ────────────
    // residual = actual − expected over canonical map. Default precision=true
    // also rejects leftover positive residual (must net to exactly zero), which
    // is the brainstorm's "absolute precision match" default for deals.

    function compareTransfersNetting(expected, actual, opts = {}) {
        const precision = opts.precision !== false
        const exp = toCanonicalTransfers(expected)
        const act = toCanonicalTransfers(actual)
        const keys = new Set([...Object.keys(exp), ...Object.keys(act)])
        const residual = {}
        for (const k of keys) { const r = round8((act[k] || 0) - (exp[k] || 0)); if (r !== 0) residual[k] = r }
        const negative = Object.entries(residual).filter(([, v]) => v < 0)
        const leftover = Object.entries(residual).filter(([, v]) => v > 0)
        const match = negative.length === 0 && (!precision || leftover.length === 0)
        return { match, mode: 'netting', precision, residual, negative: Object.fromEntries(negative), leftover: Object.fromEntries(leftover) }
    }

    // ── condition registry (pure; mirrors dealConditionScripts/*.php) ─────────

    const OPS = { GT: (a, b) => a > b, GTE: (a, b) => a >= b, LT: (a, b) => a < b, LTE: (a, b) => a <= b, EQ: (a, b) => a == b, NEQ: (a, b) => a != b } // eslint-disable-line eqeqeq
    function condDeny(reason, missing) { return { isDealDenied: true, reason, missing: !!missing } }
    function condAllow(derived) { return { isDealDenied: false, derived: derived || {} } }

    function condRange(c, params) {
        for (const [key, value] of Object.entries(c)) {
            if (key === 'scriptName') continue
            if (!(key in params)) return condDeny(`missing parameter ${key}`, true)
            for (const rule of String(value).split(',')) {
                const [op, rawAmount] = rule.trim().split(/\s+/)
                const operator = (op || '').trim(); const amount = (rawAmount || '').trim()
                if (!(operator in OPS)) return condDeny(`invalid range operator ${operator}`)
                const cv = /^[a-zA-Z_]+$/.test(amount) ? params[amount] : amount
                const u = isNumericString(params[key]) ? Number(params[key]) : params[key]
                const cc = isNumericString(cv) ? Number(cv) : cv
                if (!OPS[operator](u, cc)) return condDeny(`${key}=${params[key]} out of range, should be ${operator} ${amount}`)
            }
        }
        return condAllow()
    }
    function condSum(c, params) {
        const derived = {}
        for (const [key, value] of Object.entries(c)) {
            if (key === 'scriptName') continue
            let acc = 0
            for (const field of String(value).split(',')) {
                const f = field.trim()
                if (!(f in params)) return condDeny(`missing parameter ${f} to sum ${key}`, true)
                if (!isNumericString(params[f])) return condDeny(`sum ${key} expects numeric, ${f}=${params[f]}`)
                acc += Number(params[f])
            }
            derived[key] = acc
        }
        return condAllow(derived)
    }
    function condCodeMatch(c, params) {
        const field = c.field || 'code', expected = c.equals ?? c.value
        if (!(field in params)) return condDeny(`missing parameter ${field}`, true)
        if (String(params[field]) !== String(expected)) return condDeny(c.fail || `invalid ${field}`)
        return condAllow()
    }
    function condRegex(c, params) {
        const field = c.field || c.value
        const value = (field in params) ? params[field] : field
        let re; try { re = new RegExp(c.match) } catch (e) { return condDeny(`bad regex: ${e.message}`) }
        const m = re.exec(String(value)); if (!m) return condDeny(c.fail || 'no pattern match')
        return condAllow(c.saveGroups && m.groups ? { ...m.groups } : {})
    }

    // scripts that hit the network / have side effects — explicitly NOT replayed
    // here. They are recorded as skipped so the verdict cannot silently pass.
    const NETWORK_CONDITIONS = new Set(['onceOnlyPerAccount', 'zzzxHasHederaAccount', 'apiSend', 'xproof',
        'xRepostReward', 'xRepostSponsor', 'KPAY_CONNECT', 'codeMatchFromApi', 'ip_allow', 'allowCountries', 'timelock'])

    const PURE_CONDITIONS = { range: condRange, sum: condSum, codeMatch: condCodeMatch, password: condCodeMatch, regex: condRegex }

    function runConditions(conditions, params, extraRegistry) {
        const reg = Object.assign({}, PURE_CONDITIONS, extraRegistry || {})
        const out = { allowed: true, denials: [], missing: [], derived: {}, skipped: [], evaluated: [] }
        if (!Array.isArray(conditions)) return out
        for (const cond of conditions) {
            const name = ((cond && cond.scriptName) || '').replace(/\.php$/, '')
            const handler = reg[name]
            if (!handler) { out.skipped.push({ name, reason: NETWORK_CONDITIONS.has(name) ? 'network/side-effecting — not replayed' : 'unknown condition handler' }); continue }
            let r; try { r = handler(cond, params || {}) } catch (e) { r = condDeny(`${name} threw: ${e.message}`) }
            out.evaluated.push(name)
            if (r.derived) Object.assign(out.derived, r.derived)
            if (r.isDealDenied) {
                if (r.missing) out.missing.push({ scriptName: name, reason: r.reason })   // gap, not a violation
                else { out.allowed = false; out.denials.push({ scriptName: name, reason: r.reason }) }
            }
        }
        return out
    }

    // ── the engine factory (port-dependent checks live here) ─────────────────

    function createDealEngine(ports = {}) {
        const log = ports.log || function () {}
        const now = ports.now || (() => Date.now())
        const canonicalJson = ports.canonicalJson || defaultCanonicalJson
        const hashJson = ports.hashJson || null               // (obj) => hexString | Promise<hex>
        const verifyEd25519 = ports.verifyEd25519 || null     // (sigBytes,msgBytes,pubBytes)=>bool|Promise<bool>
        const fetchJson = ports.fetchJson || null              // (url,opts)=>Promise<any>
        const trustedKeys = ports.trustedKeys || {}            // { providerId: pubkeyHex }
        const conditionRegistry = ports.conditionRegistry || {} // extra pure conditions

        // helper: build a check record
        const mk = (id, label, type, status, detail, extra) => Object.assign({ id, label, type, status, detail: detail || '', required: false }, extra || {})

        // ── individual checks (each returns a check record; never throws) ─────

        function checkClaimedDeal(input, policy) {
            if (!policy.watchDealId) return mk('claimedDeal', 'Package claims a watched deal', 'gate', 'skip', 'no watchDealId in policy (not filtering by deal)')
            const claimed = input.claimedDealId || input.dealTemplate?.dealId || null
            if (!claimed) return mk('claimedDeal', 'Package claims a watched deal', 'gate', 'fail', 'package did not claim any dealId', { required: true })
            const ok = String(claimed).toLowerCase() === String(policy.watchDealId).toLowerCase()
            return mk('claimedDeal', 'Package claims a watched deal', 'gate', ok ? 'pass' : 'fail',
                ok ? `claims ${claimed}` : `claims ${claimed}, watching ${policy.watchDealId}`, { required: true })
        }

        async function checkDealIdHash(input, policy) {
            const claimed = input.claimedDealId || policy.watchDealId || null
            const required = !!(policy.requireDealIdHash || claimed)
            if (!input.dealTemplate) return mk('dealIdHash', 'Template hashes to dealId', 'integrity', 'skip', 'no dealTemplate to hash', { required })
            if (!hashJson) return mk('dealIdHash', 'Template hashes to dealId', 'integrity', 'skip', 'no hashJson port available in this environment', { required })
            if (!claimed) return mk('dealIdHash', 'Template hashes to dealId', 'integrity', 'skip', 'no claimed/watched dealId to compare', { required: false })
            let computed
            try { computed = await hashJson(input.dealTemplate) } catch (e) { return mk('dealIdHash', 'Template hashes to dealId', 'integrity', 'fail', `hash error: ${e.message}`, { required }) }
            const ok = String(computed).toLowerCase() === String(claimed).toLowerCase()
            return mk('dealIdHash', 'Template hashes to dealId', 'integrity', ok ? 'pass' : 'fail',
                ok ? 'sha256(template) matches dealId' : 'sha256(template) does NOT match dealId — canonicalisation or tampering', { required, data: { computed, claimed } })
        }

        function getActualTransfers(input) {
            // accept either the deal/filled shape (builtDeal) or a pchBasis-style object
            if (input.builtDeal) return {
                addHbarTransfer: input.builtDeal.addHbarTransfer || [],
                addTokenTransfer: input.builtDeal.addTokenTransfer || [],
                addNftTransfer: input.builtDeal.addNftTransfer || []
            }
            return input.actualTransfers || input.pchBasis || null
        }

        function checkReplay(input, filled) {
            if (!input.dealTemplate) return mk('replay', 'Replay deal from bindings', 'replay', 'skip', 'no dealTemplate supplied', { required: true })
            if (!filled.ok) return mk('replay', 'Replay deal from bindings', 'replay', 'skip',
                'replay incomplete — missing bindings or unevaluated values', { required: true, data: { unresolved: filled.unresolved, evalErrors: filled.evalErrors } })
            return mk('replay', 'Replay deal from bindings', 'replay', 'pass', 'template + bindings replayed cleanly', { required: true })
        }

        function checkTransfers(input, filled, policy) {
            const actual = getActualTransfers(input)
            if (!actual) return mk('transfers', 'Transfers match intent', 'transfers', 'skip', 'no actual transfers / builtDeal to compare', { required: true })
            if (!filled.ok) return mk('transfers', 'Transfers match intent', 'transfers', 'skip', 'cannot compare — replay incomplete', { required: true })
            const mode = policy.mode || 'exact'
            let cmp
            if (mode === 'netting') cmp = compareTransfersNetting(filled.transfers, actual, { precision: policy.precision !== false })
            else cmp = compareTransfersExact(filled.transfers, actual)
            return mk('transfers', `Transfers match intent (${mode})`, 'transfers', cmp.match ? 'pass' : 'fail',
                cmp.match ? 'replayed transfers match what we are asked to sign' : 'replayed transfers DIFFER from the transaction', { required: true, data: cmp })
        }

        function checkConditions(input, norm, params) {
            const conditions = norm.conditions || []
            if (!conditions.length) return mk('conditions', 'Deal conditions hold', 'conditions', 'pass', 'no conditions on this deal')
            const r = runConditions(conditions, params, conditionRegistry)
            if (!r.allowed) return mk('conditions', 'Deal conditions hold', 'conditions', 'fail', r.denials.map((d) => `${d.scriptName}: ${d.reason}`).join('; '), { required: true, data: r })
            if (r.missing.length) return mk('conditions', 'Deal conditions hold', 'conditions', 'skip',
                `cannot evaluate — missing inputs: ${r.missing.map((m) => m.reason).join('; ')}`, { required: true, data: r })
            if (r.skipped.length) return mk('conditions', 'Deal conditions hold', 'conditions', 'skip',
                `pure conditions passed; ${r.skipped.length} not replayable: ${r.skipped.map((s) => s.name).join(', ')}`, { required: true, data: r })
            return mk('conditions', 'Deal conditions hold', 'conditions', 'pass', `all ${r.evaluated.length} condition(s) passed`, { required: true, data: r })
        }

        // Oracle / API resolution. Two trustless routes:
        //   (a) signed promise — provider signed { request, value, asOf } ; verify
        //       against trustedKeys.  (ports.verifyEd25519)
        //   (b) deterministic replay — re-run the call (only if policy.allowApiReplay
        //       AND ports.fetchJson AND the binding carries an as-of/timestamp).
        // Anything else -> onhold (NOT pass). Mirrors brainstorm 12:52 / 17:39.
        async function checkOracles(input, norm, policy) {
            const apiSpec = norm.api || []
            const apiVars = Array.isArray(apiSpec) ? apiSpec : Object.keys(apiSpec)
            if (!apiVars.length) return mk('oracles', 'Oracle values are trustworthy', 'oracle', 'pass', 'deal uses no API/oracle values')

            const promises = input.promises || []
            const results = []
            for (const v of (Array.isArray(apiSpec) ? apiSpec.map((_, i) => `api[${i}]`) : Object.keys(apiSpec))) {
                const promise = promises.find((p) => p && (p.var === v || p.as === v))
                if (promise) {
                    if (!verifyEd25519) { results.push({ v, status: 'onhold', reason: 'promise present but no verifyEd25519 port' }); continue }
                    const pub = trustedKeys[promise.provider]
                    if (!pub) { results.push({ v, status: 'fail', reason: `provider '${promise.provider}' not in trustedKeys` }); continue }
                    try {
                        const msg = strToBytes(canonicalJson(promise.payload))
                        const ok = await verifyEd25519(b64ToBytes(promise.signature), msg, hexToBytes(pub))
                        results.push({ v, status: ok ? 'pass' : 'fail', reason: ok ? `signed by ${promise.provider}` : 'bad provider signature' })
                    } catch (e) { results.push({ v, status: 'fail', reason: `verify error: ${e.message}` }) }
                    continue
                }
                if (policy.allowApiReplay && fetchJson) { results.push({ v, status: 'onhold', reason: 'replay allowed but not auto-run in this pass (no recorded as-of/context)' }); continue }
                results.push({ v, status: 'onhold', reason: 'no signed promise and replay not enabled — cannot trust client-supplied oracle value' })
            }
            const anyFail = results.some((r) => r.status === 'fail')
            const anyHold = results.some((r) => r.status === 'onhold')
            const status = anyFail ? 'fail' : anyHold ? 'onhold' : 'pass'
            return mk('oracles', 'Oracle values are trustworthy', 'oracle', status,
                status === 'pass' ? 'all oracle values verified' : 'some oracle values unverified', { required: true, data: { results } })
        }

        // Scope extras — operator / valid duration / start time. Only enforced if
        // the deal declares them in `scope` and the actual tx field is supplied.
        function checkScope(input, norm, policy) {
            const scope = norm.scope || policy.scope || null
            if (!scope) return mk('scope', 'Scope (operator/timing) within deal', 'scope', 'pass', 'deal scope is transfers-only (default)')
            const tx = input.transaction || {}
            const detail = []
            let status = 'pass'
            const wantList = Array.isArray(scope) ? scope : Object.keys(scope)
            for (const field of wantList) {
                const rule = Array.isArray(scope) ? null : scope[field]
                const actualVal = tx[field]
                if (actualVal == null) { detail.push(`${field}: not supplied in transaction`); if (status === 'pass') status = 'onhold'; continue }
                if (field === 'validDuration' && rule && typeof rule.maxSeconds === 'number') {
                    if (Number(actualVal) > rule.maxSeconds) { status = 'fail'; detail.push(`validDuration ${actualVal}s > max ${rule.maxSeconds}s`) }
                    else detail.push(`validDuration ${actualVal}s ok`)
                } else if (field === 'operator' && rule && rule.equals) {
                    if (String(actualVal) !== String(rule.equals)) { status = 'fail'; detail.push(`operator ${actualVal} != ${rule.equals}`) }
                    else detail.push('operator ok')
                } else detail.push(`${field}: present (no rule enforced this pass)`)
            }
            return mk('scope', 'Scope (operator/timing) within deal', 'scope', status, detail.join('; '), { required: status !== 'pass', data: { scope } })
        }

        // ── runChecks: full pipeline -> complete results array ────────────────

        async function runChecks(input = {}, policy = {}) {
            const norm = normaliseDeal(input.dealTemplate || {})
            const params = Object.assign({}, input.bindings || {})
            const filled = input.dealTemplate ? fillDeal(input.dealTemplate, input.bindings || {}, { buyerAccountId: input.buyerAccountId }) : { ok: false, transfers: {}, unresolved: [{ note: 'no template' }] }

            const checks = []
            checks.push(checkClaimedDeal(input, policy))
            checks.push(await checkDealIdHash(input, policy))
            checks.push(checkReplay(input, filled))
            checks.push(checkTransfers(input, filled, policy))
            checks.push(checkConditions(input, norm, params))
            checks.push(await checkOracles(input, norm, policy))
            checks.push(checkScope(input, norm, policy))

            const byStatus = (s) => checks.filter((c) => c.status === s)
            const requiredUnmet = checks.filter((c) => c.required && c.status !== 'pass')
            let verdict
            if (byStatus('fail').length) verdict = 'fail'
            else if (requiredUnmet.length) verdict = 'incomplete'
            else verdict = 'pass'

            const summary = {
                verdict,
                pass: byStatus('pass').length, fail: byStatus('fail').length,
                skip: byStatus('skip').length, onhold: byStatus('onhold').length,
                unmetRequired: requiredUnmet.map((c) => c.id)
            }
            log({ summary }, '🔎 dealEngine.runChecks')
            return { verdict, checks, summary, expected: filled.transfers, actual: getActualTransfers(input), filled, generatedAt: now() }
        }

        // Backward-compatible entry point matching pass-1 dealVerify.verifyDeal.
        // Old verdicts were pass/fail/skip/error. Map 'incomplete' -> 'skip'.
        async function verifyDeal(args = {}) {
            try {
                const policy = args.policy || {}
                const res = await runChecks({
                    dealTemplate: args.dealTemplate, builtDeal: args.builtDeal,
                    actualTransfers: args.actualTransfers, pchBasis: args.pchBasis,
                    bindings: args.bindings || {}, buyerAccountId: args.buyerAccountId,
                    claimedDealId: args.claimedDealId, promises: args.promises, transaction: args.transaction
                }, policy)
                const verdict = res.verdict === 'incomplete' ? 'skip' : res.verdict
                const transfers = res.checks.find((c) => c.id === 'transfers')
                return {
                    verdict,
                    reason: verdict === 'pass' ? 'all required checks passed'
                        : verdict === 'fail' ? 'one or more checks failed'
                            : 'checks incomplete — see checks[] (engine did not silently pass)',
                    checks: res.checks, summary: res.summary,
                    diffs: transfers?.data?.diffs || [], expected: res.expected, actual: res.actual
                }
            } catch (e) { return { verdict: 'error', reason: e.message, stack: e.stack } }
        }

        return { runChecks, verifyDeal, fillDeal, normaliseDeal, compareTransfersExact, compareTransfersNetting, toCanonicalTransfers, runConditions, ports }
    }

    // tiny byte helpers (used by oracle promise verification; pure)
    function strToBytes(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); return Uint8Array.from(Buffer.from(s, 'utf8')) }
    function hexToBytes(hex) { const c = String(hex || '').trim(); const p = c.match(/.{1,2}/g) || []; return Uint8Array.from(p.map((x) => parseInt(x, 16))) }
    function b64ToBytes(b64) {
        if (typeof atob === 'function') return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
        return Uint8Array.from(Buffer.from(b64, 'base64'))
    }

    // public surface: factory + pure statics (so KEA/Node can use either)
    return {
        createDealEngine,
        // pure statics (no ports needed)
        normaliseDeal, fillDeal, fillDealLegacy, fillDealSteps,
        compareTransfersExact, compareTransfersNetting, toCanonicalTransfers,
        runConditions, PURE_CONDITIONS, NETWORK_CONDITIONS,
        safeEvalMath, isValidMathExpression, round8, normaliseAssetId,
        _bytes: { strToBytes, hexToBytes, b64ToBytes }
    }
})
