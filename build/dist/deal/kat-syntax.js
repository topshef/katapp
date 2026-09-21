// kat-syntax.js — KATSYN1 (2026-09-21): colour for a Katomic script and for the v2 policy
// JSON it compiles to, in ONE vocabulary, so the two panes of the editor (and the two tabs of
// the deal page) can be read against each other.
//
// The point is the correspondence, not the prettiness. A constant is the same colour whether
// you are looking at `POOL_ACCOUNT is 0.0.7718` or at `"POOL_ACCOUNT": "0.0.7718"`; a section
// header `#require` is the same colour as the `"require"` key; an operator is the same colour
// whether it is written `>=` or `{">=": […]}`. So the eye can carry a name from one side to
// the other without re-reading it.
//
// Seven classes, and they mean the same thing on both sides:
//   kw-s  structure    #section headers / the top-level policy keys
//   kw-n  a NAME       something the script declares or refers to (constant, input, observation,
//                      derived value, a transfer's account) / a JSON key one level under a
//                      section, and every {"var": …} path
//   kw-k  a keyword    is · = · query · -> · sends · receives · to · memo · operator · valid ·
//                      an input type · an infix operator / a JSONLogic operator key
//   kw-t  text         a quoted run, and the free text of a name, memo or reason / a JSON string
//   kw-m  a number     / a JSON number, true, false, null
//   kw-p  a path       a registry source and the path it reads (script only)
//   kw-c  a comment    // to end of line (script only)
// Punctuation is left in the base colour: it is the one thing that carries no meaning of
// its own, and colouring it makes a dense line noisier rather than clearer.
//
// No dependencies, no build step, no editor library: the script is line-oriented and the JSON
// is walked as a value, so both are a few hundred lines of plain ES. See the grammar it
// follows at /deal/edit/spec/ — this file colours what that specifies and nothing else, and
// when it cannot tell what something is it leaves it in the base colour rather than guessing.

const SECTIONS = new Set(['deal', 'constants', 'inputs', 'observe', 'derive', 'require', 'transaction'])
// the operations the engine has (spec §4) — anything else in call position is a mistake the
// editor already reports, so it is left uncoloured rather than dressed up as a function
const FUNCS = new Set(['digitAfterPoint', 'tsSeconds', 'hederaAccount', 'sha256', 'substr', 'in', 'cat', 'if', 'min', 'max', 'merge', 'missing', 'missing_some', 'log'])
const TYPES = new Set(['account', 'txid', 'timestamp', 'integer', 'string', 'hedera.account', 'hedera.txid', 'hedera.timestamp'])
const LITERALS = new Set(['true', 'false', 'null'])

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const span = (cls, text) => (text === '' ? '' : `<span class="kw-${cls}">${esc(text)}</span>`)

// ── the script ────────────────────────────────────────────────────────────────────────────
// Line-oriented, exactly as the parser is: which section we are in decides what a line means.
// Nothing here parses — a highlighter that refuses a line is worse than useless, so every
// branch falls through to "leave it alone".

// an expression, as §4 defines one: names, numbers, strings, calls, infix operators
function expr(text) {
  let out = '', i = 0
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(==|!=|<=|>=|&&|\|\||[+\-*/%<>!])/g
  let m
  while ((m = re.exec(text))) {
    out += esc(text.slice(i, m.index))
    i = m.index + m[0].length
    if (m[1]) out += span('c', m[1])
    else if (m[2]) out += span('t', m[2])
    else if (m[3]) out += span('m', m[3])
    else if (m[4]) {
      const w = m[4]
      // a call is `name(`; `and`/`or`/`not` are operators; true/false/null are literals
      const isCall = text[i] === '('
      out += LITERALS.has(w) ? span('m', w)
        : (w === 'and' || w === 'or' || w === 'not') ? span('k', w)
        : (isCall && FUNCS.has(w)) ? span('k', w)
        : isCall ? esc(w)
        : span('n', w)
    } else out += span('k', m[5])
  }
  return out + esc(text.slice(i))
}

// split a trailing `// comment` off a line, honouring quoted runs (spec §2)
function splitComment(line) {
  let q = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '/' && line[i + 1] === '/') return [line.slice(0, i), line.slice(i)]
  }
  return [line, '']
}

// `NAME  rest` → the name coloured, the gap kept exactly as it was (alignment is free, and
// the printer aligns, so eating the spaces would visibly reflow every script)
function headTail(line) {
  const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*)(.*)$/.exec(line)
  return m ? { indent: m[1], name: m[2], gap: m[3], rest: m[4] } : null
}

function scriptLine(line, section, prevIndented) {
  // a whole-line comment: `#` alone or `# something` (a section header has no space)
  if (/^#(\s|$)/.test(line)) return span('c', line)
  if (/^#[a-z]+\s*$/.test(line)) {
    const name = line.trim().slice(1)
    return SECTIONS.has(name) ? span('s', line) : span('c', line)
  }
  if (!line.trim()) return esc(line)

  const [code, comment] = splitComment(line)
  const tail = comment ? span('c', comment) : ''
  const h = headTail(code)

  switch (section) {
    case 'deal': {
      // `name TEXT` / `network TEXT` — the text is verbatim, so it is text, not an expression
      if (h && (h.name === 'name' || h.name === 'network')) return span('k', h.indent + h.name) + h.gap + span('t', h.rest) + tail
      return esc(code) + tail
    }
    case 'constants': {
      // NAME is VALUE
      const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s+)(is)(\s+)(.*)$/.exec(code)
      if (!m) return esc(code) + tail
      const v = m[6]
      const val = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v.trim()) ? span('m', v)
        : LITERALS.has(v.trim()) ? span('m', v)
        : span('t', v)
      return m[1] + span('n', m[2]) + m[3] + span('k', m[4]) + m[5] + val + tail
    }
    case 'inputs': {
      if (!h) return esc(code) + tail
      return h.indent + span('n', h.name) + h.gap + (TYPES.has(h.rest.trim()) ? span('k', h.rest) : esc(h.rest)) + tail
    }
    case 'observe': {
      // NAME = SOURCE PATH [-> SELECT], or an indented continuation
      const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*)(=)(\s*)(.*)$/.exec(code)
      if (m) return m[1] + span('n', m[2]) + m[3] + span('k', m[4]) + m[5] + observeRest(m[6]) + tail
      return observeRest(code) + tail
    }
    case 'derive': {
      const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*)(=)(\s*)(.*)$/.exec(code)
      if (m) {
        const q = /^(query)(\s+)(.*)$/.exec(m[6])
        const body = q ? span('k', q[1]) + q[2] + span('p', q[3]) : expr(m[6])
        return m[1] + span('n', m[2]) + m[3] + span('k', m[4]) + m[5] + body + tail
      }
      return expr(code) + tail          // an indented continuation of the entry above
    }
    case 'require': {
      // the margin line is the REASON (verbatim, and inside the hash); the indented line
      // under it is the rule. A reason never carries a comment — but by the spec it also
      // cannot contain `//`, so splitting one off is safe.
      if (/^\s/.test(line)) return expr(code) + tail
      return span('t', line)
    }
    case 'transaction': {
      if (/^\s*(transfer)\s*$/.test(code)) return span('k', code) + tail
      const memo = /^(\s*)(memo)(\s+)(.*)$/.exec(code)
      if (memo) return memo[1] + span('k', memo[2]) + memo[3] + span('t', memo[4])   // verbatim: no comment
      const leg = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s+)(sends|receives)(\s+)(.*)$/.exec(code)
      if (leg) return leg[1] + span('n', leg[2]) + leg[3] + span('k', leg[4]) + leg[5] + legRest(leg[6]) + tail
      const valid = /^(\s*)(valid)(\s+)(.*)$/.exec(code)
      if (valid) return valid[1] + span('k', valid[2]) + valid[3] + validRest(valid[4]) + tail
      if (h && (h.name === 'operator' || h.name === 'type')) return h.indent + span('k', h.name) + h.gap + span('n', h.rest) + tail
      if (h) return h.indent + span('k', h.name) + h.gap + esc(h.rest) + tail        // KEY JSON
      return esc(code) + tail
    }
    default:
      return esc(code) + tail
  }
}

// SOURCE PATH -> SELECT, plus the indented `-> …`, `pin:` and `attest:` continuations
function observeRest(rest) {
  const arrow = rest.indexOf('->')
  const head = arrow < 0 ? rest : rest.slice(0, arrow)
  const sel = arrow < 0 ? '' : rest.slice(arrow)
  const m = /^(\s*)([a-z][a-z0-9.]*)(\s+)(\S*)(.*)$/.exec(head)
  const kv = /^(\s*)(pin|attest):(.*)$/.exec(head)
  const h = kv ? kv[1] + span('k', kv[2] + ':') + span('p', kv[3])
    : m ? m[1] + span('k', m[2]) + m[3] + span('p', m[4]) + esc(m[5])
    : span('p', head)
  return h + (sel ? span('k', '->') + span('p', sel.slice(2)) : '')
}
// `EXPR TOKEN`, or the NFT form `TOKEN #SERIAL to B`
function legRest(rest) {
  const nft = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s+)#([A-Za-z0-9_]+)(\s+)(to)(\s+)([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(rest)
  if (nft) return nft[1] + span('n', nft[2]) + nft[3] + '#' + span('n', nft[4]) + nft[5] + span('k', nft[6]) + nft[7] + span('n', nft[8])
  const m = /^(.*?)(\s+)([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(rest)          // … amount TOKEN
  // `hbar` is the unit itself (case-insensitive, spec §3), not a name the engine resolves
  if (m) return expr(m[1]) + m[2] + span(/^hbar$/i.test(m[3]) ? 'k' : 'n', m[3])
  return expr(rest)
}
// `from +300s, for 120s`
function validRest(rest) {
  return rest.replace(/(from|for)|(\+?\d+s)/g, (all, kw, num) => (kw ? `\u0001k${kw}\u0002` : `\u0001m${num}\u0002`))
    .split(/(\u0001[km][^\u0002]*\u0002)/).map((bit) => {
      const m = /^\u0001([km])(.*)\u0002$/.exec(bit)
      return m ? span(m[1], m[2]) : esc(bit)
    }).join('')
}

/** One EXPRESSION → HTML, in the same classes: `elapsed >= TIMELOCK_SECONDS`. What the deal
 *  page shows for a rule, an amount or a derived value, so a condition reads the same there
 *  as it does in the script. */
export function exprHtml(text) {
  try { return expr(String(text == null ? '' : text)) } catch { return esc(String(text)) }
}

/** A Katomic script → HTML, one line at a time. Never throws: an unparseable line is
 *  returned escaped and uncoloured, because an editor must keep showing what you typed. */
export function katHtml(text) {
  const lines = String(text == null ? '' : text).split('\n')
  let section = null, prevIndented = false
  const out = []
  for (const line of lines) {
    const head = /^#([a-z]+)\s*$/.exec(line)
    if (head && SECTIONS.has(head[1])) { section = head[1]; out.push(span('s', line)); prevIndented = false; continue }
    try { out.push(scriptLine(line, section, prevIndented)) } catch { out.push(esc(line)) }
    prevIndented = /^\s/.test(line)
  }
  return out.join('\n')
}

// ── the JSON it compiles to ───────────────────────────────────────────────────────────────
// Printed from the VALUE rather than tokenised from text, so every span knows what it is:
// depth and position say whether a key is a section, a declared name or an operator.

const POLICY_KEYS = new Set(['v', 'name', 'network', 'constants', 'inputs', 'observe', 'derive', 'require', 'transaction'])
const NAMED = new Set(['constants', 'inputs', 'observe', 'derive'])     // whose keys are NAMES
// The policy's own field names. Each of these is a KEYWORD on the script side — `->` is
// select, `sends` is a tokenTransfers leg, `valid` is schedule — so they take the keyword
// colour here too, and the two panes agree about what is structure and what is content.
const FIELDS = new Set(['source', 'get', 'select', 'pin', 'attest', 'reason', 'rule', 'type',
  'tokenTransfers', 'hbarTransfers', 'nftTransfers', 'token', 'account', 'amount', 'serial',
  'from', 'to', 'memo', 'operator', 'schedule', 'validStartOffset', 'validDuration'])
// Fields whose VALUE is a symbolic name the engine resolves — the same word, the same colour,
// on both sides (spec §3, "A, B, TOKEN and NAME are symbolic names").
const NAME_VALUED = new Set(['token', 'account', 'from', 'to', 'operator', 'serial'])
// A JSONLogic operator: anything not written like an identifier (==, <=, +, !!) or one of the
// operations the engine has. `var` is the one that names a value rather than combining any.
const isOp = (k) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || k === 'var' || k === 'and' || k === 'or' || FUNCS.has(k)

function jsonScalar(v) {
  if (typeof v === 'string') return span('t', JSON.stringify(v))
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return span('m', JSON.stringify(v))
  return esc(JSON.stringify(v))
}

// `where` is the context a key sits in, which is all it needs to know what it is:
//   'top'    the policy itself — its keys are sections
//   'named'  a section whose keys are declared NAMES (constants, inputs, observe, derive)
//   'body'   anywhere else — fields, operators and legs
function jsonNode(v, indent, where) {
  const pad = '  '.repeat(indent), padIn = '  '.repeat(indent + 1)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return '[\n' + v.map((x) => padIn + jsonNode(x, indent + 1, where === 'named' ? 'body' : where)).join(',\n') + '\n' + pad + ']'
  }
  if (v && typeof v === 'object') {
    const keys = Object.keys(v)
    if (!keys.length) return '{}'
    return '{\n' + keys.map((k) => {
      const cls = where === 'top' ? 's'
        : where === 'named' ? 'n'
        : FIELDS.has(k) ? 'k'
        : isOp(k) ? 'k'
        : 'n'
      const next = where === 'top' ? (NAMED.has(k) ? 'named' : 'body') : 'body'
      // a var names a value; a leg's account/token names one too — colour them as the
      // declaration they point at, so the word carries across from the script
      const val = (k === 'var' && typeof v[k] === 'string') ? span('n', JSON.stringify(v[k]))
        : (NAME_VALUED.has(k) && typeof v[k] === 'string') ? span('n', JSON.stringify(v[k]))
        : jsonNode(v[k], indent + 1, next)
      return padIn + span(cls, JSON.stringify(k)) + ': ' + val
    }).join(',\n') + '\n' + pad + '}'
  }
  return jsonScalar(v)
}

/** A v2 policy (or any JSON value) → pretty-printed HTML in the same seven classes. */
export function jsonHtml(value) {
  try { return jsonNode(value, 0, 'top') } catch { return esc(JSON.stringify(value, null, 2)) }
}

// ── the palette ───────────────────────────────────────────────────────────────────────────
// Exported as a string and injected by whoever uses it, so there is ONE definition of what
// each class looks like and the editor and the deal page cannot drift apart. Both themes:
// these pages follow the system setting like everything else on the estate.
export const SYNTAX_CSS = `
.kw-s{color:#7a3e9d;font-weight:600}
.kw-n{color:#1c5580}
.kw-k{color:#a33b1f;font-weight:600}
.kw-t{color:#1d6b45}
.kw-m{color:#8a5a12}
.kw-p{color:#555f6b}
.kw-c{color:#9aa4ae;font-style:italic}
@media (prefers-color-scheme:dark){
  .kw-s{color:#c99ae6}
  .kw-n{color:#74aede}
  .kw-k{color:#f0917a}
  .kw-t{color:#7fd2a4}
  .kw-m{color:#e0b45e}
  .kw-p{color:#9fabb8}
  .kw-c{color:#6b757f}
}`

/** Put the palette in the page once. */
export function installSyntaxCss() {
  if (document.getElementById('kat-syntax-css')) return
  const st = document.createElement('style')
  st.id = 'kat-syntax-css'
  st.textContent = SYNTAX_CSS
  document.head.appendChild(st)
}
