import {
      $,
      makeId,
      cleanUrl,
      shortHash,
      shortKey,
      shortText,
      parseTxStrikeAt,
      formatShortTime
    } from './kea-utils.js'

    import {
      buildEventDebug,
      verifyKeaForWatch,
      evaluateRuleForWatch,
      isRuleExpired
    } from './kea-verify.js'

    import { fetchAndVerifyDeal, getCachedDeal } from './kea-deal.js'

    import {
      loadKeys,
      getKey,
      generateKey,
      importKey,
      deleteKey,
      renameKey,
      markKeyUsed,
      ensureDummyKey,
      signApprovalPackage,
      buildSignedPayload,
      buildRejectPayload,
      submitSignedResult,
      buildExecutionCommitmentEnvelope
    } from './kea-sign.js'

    // -------------------------------------------------------------------------
    // MODEL: app state, local persistence, normalisation
    // -------------------------------------------------------------------------

    const WATCHES_KEY = 'keaWatches.v1'
    const DECISIONS_KEY = 'keaDecisions.v1'   // approve/reject decisions, keyed by event key
    const PRO_KEY = 'keaPro.v1'
    const KEYS_NET_KEY = 'keaKeysNet.v1'    // which network the Keys modal is managing
    const MAIN_NET_KEY = 'keaMainNet.v1'    // which network the main page is showing

    const events = []
    const sockets = {}

    let watches = []
    let decisions = {}
    let isPro = false
    let keysNet = 'mainnet'   // network scope shown in the Keys modal
    let mainNet = 'mainnet'   // network scope shown on the main page (watches + transactions)
    let qrStream = null
    let qrScanning = false
    let editingWatchId = null
    let cloningFromId = null
    let openEvent = null   // event currently shown in the detail modal

    function loadWatches() {
      try { watches = JSON.parse(localStorage[WATCHES_KEY] || '[]') } catch { watches = [] }
      watches = watches.map(normaliseWatch)
      assignMissingWatchRefs()
      saveWatches()
    }

    function saveWatches() {
      localStorage[WATCHES_KEY] = JSON.stringify(watches.map(stripWatchRuntime))
    }

    function normaliseWatch(w) {
      w = w || {}

      // The watch's `query` is the filter we send to the KPool backend. Its keys
      // are whatever the backend supports — we don't hard-code them — but three
      // are always present and drive the app's own routing. They keep their
      // backend names so the query can be forwarded verbatim:
      //   query.orderPubkey <- trader (Tim's) Ed25519 intent key
      //   query.gameId      <- game scope (blank = all games)
      //   query.network     <- network, always inherited from the testnet/
      //                        mainnet context (never independently edited)
      // Legacy watches stored these three flat at the root. We migrate them into
      // query here, preserve any extra backend filter keys verbatim, and keep
      // flat runtime mirrors (w.network/gameId/orderPubkey) so the existing WS
      // filter, kea-verify and render code keep working unchanged. The mirrors
      // are runtime-only — stripWatchRuntime persists `query` alone.
      const lq = w.query || {}
      const orderPubkey = String(lq.orderPubkey != null ? lq.orderPubkey : (w.orderPubkey || '')).trim().toLowerCase()
      const gameId      = String(lq.gameId      != null ? lq.gameId      : (w.gameId    || '')).trim()
      const network     = String(lq.network     != null ? lq.network     : (w.network   || 'mainnet')).trim()
      const query = { orderPubkey, gameId, network }
      for (const k in lq) if (!(k in query)) query[k] = lq[k]

      return {
        id: w.id || makeId(),
        ref: normaliseWatchRef(w.ref),
        name: String(w.name || '').trim(),
        baseUrl: cleanUrl(w.baseUrl || 'https://hapi5.katomia.com'),
        wsUrl: cleanUrl(w.wsUrl || 'wss://hapi5.katomia.com/ws'),

        // New canonical rule fields. `query` is the single persisted source of
        // truth for the backend filter (see stripWatchRuntime).
        query: query,
        expiresAt: normaliseExpiry(w.expiresAt),

        // Flat mirrors of the three known query fields — derived, runtime-only,
        // kept so the WS filter, kea-verify and render code read them as before.
        // Do not write these directly; set query and re-normalise instead.
        network: network,
        gameId: gameId,
        orderPubkey: orderPubkey,

        signPubkey: String(w.signPubkey || '').trim().toLowerCase(),
        // Mode is no longer a user choice — it's inferred from whether an
        // auto-approval key is set. Kept on the record for backwards compat.
        //   key set  -> 'sign'  (Action: watch + check + auto-sign)
        //   no key   -> 'fetch' (Watch: watch + check + manual approval)
        mode: String(w.signPubkey || '').trim() ? 'sign' : 'fetch',
        paused: !!w.paused,
        status: w.paused ? 'paused' : (w.status || 'idle'),
        note: w.note || '',
        createdAt: w.createdAt || Date.now(),
        lastSeenAt: w.lastSeenAt || null
      }
    }

    // Keep expiresAt as a trimmed ISO 8601 string, or null. The value isn't
    // reformatted; an unparseable date is dropped so a broken value can't
    // silently expire (and disable) a rule.
    function normaliseExpiry(v) {
      const s = String(v || '').trim()
      if (!s) return null
      return Number.isFinite(Date.parse(s)) ? s : null
    }

    function normaliseWatchRef(ref) {
      const n = Number(ref)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
    }

    function stripWatchRuntime(w) {
      return {
        id: w.id,
        ref: w.ref,
        name: w.name,
        baseUrl: w.baseUrl,
        wsUrl: w.wsUrl,
        // `query` is the single source of truth for the backend filter; the
        // flat network/gameId/orderPubkey mirrors are runtime-only and are NOT
        // persisted (normaliseWatch still migrates them in from older records).
        query: w.query,
        expiresAt: w.expiresAt,
        signPubkey: w.signPubkey,
        mode: w.mode,
        paused: w.paused,
        note: w.note,
        createdAt: w.createdAt,
        lastSeenAt: w.lastSeenAt
      }
    }

    function assignMissingWatchRefs() {
      const used = new Set(watches.map(function(w) { return w.ref }).filter(Boolean))
      let next = 1

      for (const w of watches) {
        if (w.ref) continue
        while (used.has(next)) next++
        w.ref = next
        used.add(next)
      }
    }

    function nextWatchRef() {
      const nums = watches.map(function(w) { return Number(w.ref) || 0 })
      return Math.max(0, ...nums) + 1
    }

    function getWatch(id) {
      return watches.find(function(w) { return w.id === id })
    }

    function watchFromForm() {
      // The query comes straight from the inline editor (populated in both
      // modes). A fresh/just-scanned rule carries its network in the query
      // already; if a manual edit clears it, normaliseWatch falls back sensibly.
      const query = queryFromEditor()
      if (!query.network) query.network = mainNet
      return normaliseWatch({
        id: editingWatchId || undefined,
        name: $('watchName').value,
        baseUrl: $('baseUrl').value,
        wsUrl: $('wsUrl').value,
        query: query,
        signPubkey: $('signPubkey').value,
        expiresAt: $('expiresAt').value
      })
    }

    // ---- decisions (approve / reject) --------------------------------------

    function loadDecisions() {
      try { decisions = JSON.parse(localStorage[DECISIONS_KEY] || '{}') } catch { decisions = {} }
      if (!decisions || typeof decisions !== 'object') decisions = {}
    }

    function saveDecisions() {
      localStorage[DECISIONS_KEY] = JSON.stringify(decisions)
    }

    function getDecision(key) {
      return decisions[key] || null
    }

    function setDecision(key, dec) {
      decisions[key] = dec
      saveDecisions()
    }

    // ---- events ------------------------------------------------------------

    function eventKey(e) {
      return `${e.watchId || 'manual'};${e.network};${e.txid};${e.pch}`
    }

    function addEvent(w, msg) {
      const base = {
        watchId: w.id,
        watchRef: watchRef(w),
        watchLabel: watchLabel(w),
        network: msg.network || w.network,
        txid: msg.txid,
        pch: msg.pch,
        mode: w.mode,
        status: 'doorbell',
        check: 'pending',
        summary: 'Doorbell received',
        createdAt: Date.now(),
        strikeAt: parseTxStrikeAt(msg.txid),
        rawDoorbell: msg
      }

      const key = eventKey(base)
      let e = events.find(function(x) { return x.key === key })

      if (!e) {
        e = { key, ...base, decision: getDecision(key) }
        events.push(e)
      } else {
        Object.assign(e, base, { key, createdAt: e.createdAt || base.createdAt, watchRef: e.watchRef || base.watchRef })
        e.decision = getDecision(key)
      }

      sortEvents()
      renderEvents()
      return e
    }

    function sortEvents() {
      events.sort(function(a, b) {
        const av = a.strikeAt || a.createdAt || 0
        const bv = b.strikeAt || b.createdAt || 0
        return bv - av
      })
    }

    // -------------------------------------------------------------------------
    // CONTROLLER: watch CRUD and WebSocket doorbells
    // -------------------------------------------------------------------------

    function showModalError(msg) {
      const el = $('modalError')
      if (!el) return
      el.textContent = msg
      el.style.display = 'block'
    }

    function hideModalError() {
      const el = $('modalError')
      if (el) el.style.display = 'none'
    }

    function saveWatchFromForm() {
      hideModalError()
      const watch = watchFromForm()
      validateWatch(watch)

      // Auto-approval guard: you can only auto-sign if there is at least one
      // verifiable field in the query (orderPubkey or dealId). Without either,
      // strip auto-approval and alert the user.
      const hasCheck = !!(watch.orderPubkey || (watch.query && watch.query.dealId))
      if (!hasCheck && isAuto(watch)) {
        watch.signPubkey = ''
        watch.mode = 'fetch'
        alert('Auto-approval removed: a rule needs at least an intent public key or a deal ID to verify transactions before signing. The rule has been set to manual approval.')
      }

      // Edit (only when not cloning) updates in place and refreshes the socket.
      if (editingWatchId && !cloningFromId) {
        const saved = updateExistingWatch(watch)
        fetchDealIfNeeded(saved)
        closeWatchModal()
        setStatus(`Saved ${watchLabel(saved)}`)
        return
      }

      // Clone is an explicit duplicate, so bypass the de-dup that would
      // otherwise merge an identical query back onto the original rule.
      addWatch(watch, { allowDuplicate: !!cloningFromId })
      fetchDealIfNeeded(watch)
      closeWatchModal()
    }

    function validateWatch(watch) {
      if (!watch.wsUrl) throw new Error('Missing WebSocket URL')
      if (!watch.baseUrl) throw new Error('Missing KPool base URL')
      if (!watch.network) throw new Error('Missing network')
      // orderPubkey and dealId are both optional — a rule with neither is a
      // manual-only watch (auto-approval is stripped on save).
    }

    function addWatch(watch, opts) {
      watch = normaliseWatch(watch)
      validateWatch(watch)

      const existing = (opts && opts.allowDuplicate) ? null : watches.find(function(w) {
        return w.wsUrl === watch.wsUrl &&
          w.network === watch.network &&
          w.gameId === watch.gameId &&
          w.orderPubkey === watch.orderPubkey
      })

      if (existing) {
        const ref = existing.ref
        Object.assign(existing, watch, { id: existing.id, ref, paused: false, status: 'idle' })
        watch = existing
      } else {
        watch.ref = watch.ref || nextWatchRef()
        watches.push(watch)
      }

      saveWatches()
      renderWatches()
      connectWatch(watch)
      setStatus(`Added ${watchLabel(watch)}`)
    }

    function updateExistingWatch(next) {
      const old = getWatch(editingWatchId)
      if (!old) throw new Error('Watch no longer exists')

      const wasPaused = old.paused
      const createdAt = old.createdAt
      const ref = old.ref

      // Edited details (network / orderPubkey / gameId) change the subscription
      // filter, so always tear the socket down and reconnect with the new filter.
      disconnectWatch(old.id)
      Object.assign(old, next, {
        id: old.id,
        ref,
        paused: wasPaused,
        createdAt,
        status: wasPaused ? 'paused' : 'idle',
        lastSeenAt: old.lastSeenAt || null
      })

      saveWatches()
      renderWatches()
      renderEvents()
      if (!old.paused) connectWatch(old)
      return old
    }

    function removeWatch(id) {
      disconnectWatch(id)
      watches = watches.filter(function(w) { return w.id !== id })
      saveWatches()
      renderWatches()
      renderEvents()
      setStatus('Watch removed')
    }

    function toggleWatchPaused(id) {
      const w = getWatch(id)
      if (!w) return

      w.paused = !w.paused
      w.status = w.paused ? 'paused' : 'idle'

      if (w.paused) disconnectWatch(id)
      else connectWatch(w)

      saveWatches()
      renderWatches()
      setStatus(`${w.paused ? 'Paused' : 'Resumed'} ${watchLabel(w)}`)
    }

    function updateWatch(id, changes) {
      const w = getWatch(id)
      if (!w) return
      Object.assign(w, changes)
      saveWatches()
      renderWatches()
    }

    function connectAllWatches() {
      for (const w of watches)
        if (!w.paused) connectWatch(w)
    }

    function connectWatch(w) {
      if (!w || w.paused) return

      const existing = sockets[w.id]
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return

      updateWatch(w.id, { status: 'connecting', note: '' })

      const ws = new WebSocket(w.wsUrl)
      sockets[w.id] = ws

      ws.onopen = function() {
        updateWatch(w.id, { status: 'connected', note: '' })

        // Subscription filter. gameId is only included when set: blank means
        // "watch all games", a value means the server (notifyKpoolWatchers)
        // only rings the doorbell for that game's transactions.
        const filter = {
          mode: 'kea',
          network: w.network,
          orderPubkey: w.orderPubkey
        }
        if (w.gameId) filter.gameId = w.gameId

        ws.send(JSON.stringify({ type: 'kpool_watch', filter }))

        setStatus(`Connected ${watchLabel(w)}`)
      }

      ws.onmessage = function(ev) {
        let msg
        try { msg = JSON.parse(ev.data) } catch { return }

        if (msg.type === 'kea_request') {
          handleDoorbell(w, msg)
          return
        }

        console.debug('KEA socket message', watchLabel(w), msg)
      }

      ws.onclose = function() {
        if (sockets[w.id] === ws) delete sockets[w.id]
        const current = getWatch(w.id)
        if (!current) return
        if (!current.paused) updateWatch(w.id, { status: 'disconnected' })
      }

      ws.onerror = function() {
        updateWatch(w.id, { status: 'error', note: 'doorbell socket error' })
        setStatus(`Socket error on ${watchLabel(w)}`, 'bad')
      }
    }

    function disconnectWatch(id) {
      const ws = sockets[id]
      if (!ws) return
      delete sockets[id]
      try { ws.close() } catch {}
    }

    function handleDoorbell(w, msg) {
      // Defensive client-side game gate. The server already filters by gameId
      // when the watch sets one; this only matters if a future doorbell payload
      // starts carrying a gameId that disagrees with the watch.
      if (w.gameId && msg.gameId && msg.gameId !== w.gameId) {
        console.debug('KEA doorbell skipped: gameId mismatch', msg.gameId, '!=', w.gameId)
        return
      }

      w.lastSeenAt = Date.now()
      saveWatches()
      renderWatches()

      const e = addEvent(w, msg)
      setStatus(`Doorbell ${shortHash(e.pch)}`)

      // A doorbell with no check is pointless ("like the door ringing and not
      // answering it"), so KEA always fetches and checks. Whether it then
      // auto-signs depends on the watch having an auto-approval key.
      fetchTxDetail(e).catch(function(err) {
        e.status = 'fetch error'
        e.check = 'fail'
        e.summary = err.message
        e.fetch = Object.assign(e.fetch || {}, { error: err.message })
        renderEvents()
        setStatus(`Fetch error: ${err.message}`, 'bad')
      })
    }

    // -------------------------------------------------------------------------
    // CONTROLLER: fetch and verification
    // -------------------------------------------------------------------------

    async function fetchTxDetail(e) {
      const w = getWatch(e.watchId) || watchFromForm()
      const url = `${cleanUrl(w.baseUrl)}/kpool/txRead?network=${encodeURIComponent(e.network)}&txid=${encodeURIComponent(e.txid)}&pch=${encodeURIComponent(e.pch)}&detail=1&mirror=0`

      e.status = 'fetching'
      e.check = 'pending'
      e.summary = 'Fetching approval package'
      e.fetch = { url, requestedAt: new Date().toISOString() }
      renderEvents()

      const res = await fetch(url)
      const data = await res.json()
      const out = data.result || data

      e.fetch = {
        url,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        fetchedAt: new Date().toISOString()
      }

      e.status = 'fetched'
      e.raw = out
      e.kea = out.kea || null
      e.strikeAt = parseTxStrikeAt(out.kea?.transaction?.txid || e.txid) || e.strikeAt
      e.debug = buildEventDebug(e, w, out.kea || null)

      if (!out.kea) {
        e.check = 'fail'
        e.summary = out.keaError || 'No KEA detail in fetched package'
        renderEvents()
        return
      }

      // Verification runs each check implied by the query: intent-signature
      // if orderPubkey is present, deal-template if dealId is present, both if
      // both. An expired rule fails closed, so nothing auto-signs.
      const result = await evaluateRuleForWatch(out.kea, w)
      e.check = result.ok ? 'pass' : 'fail'
      e.summary = result.msg
      e.verification = result
      e.debug = buildEventDebug(e, w, out.kea || null)

      sortEvents()
      renderEvents()
      refreshOpenEventDetail(e)
      setStatus(result.ok ? `Checked ${shortHash(e.pch)} OK — ready to approve` : `Check failed: ${result.msg}`, result.ok ? 'ok' : 'bad')

      // Auto-approval: if this watch is an Action (has a usable auto-approval
      // key) and the check passed, sign automatically — no prompt. If the key
      // is missing/deleted we fall through to the manual ready bar instead.
      const autoKey = isAuto(w) ? getKey(w.signPubkey, w.network) : null
      if (result.ok && autoKey && !e.decision) {
        approveEvent(e, { auto: true }).catch(function(err) {
          setStatus(`Auto-approve failed: ${err.message}`, 'bad')
        })
      }
    }

    // -------------------------------------------------------------------------
    // CONTROLLER: approve / reject / sign
    // -------------------------------------------------------------------------

    function eventIsReady(e) {
      return e.check === 'pass' && !e.decision
    }

    async function approveEvent(e, opts = {}) {
      if (e.check !== 'pass') throw new Error('Cannot approve — checks have not passed')
      if (!e.kea) throw new Error('No approval package to sign')

      const w = getWatch(e.watchId)
      if (!w) throw new Error('Watch no longer exists')

      // An expired rule is refused before any signing, manual or auto.
      if (isRuleExpired(w)) {
        console.debug('[KEA] approve refused — rule expired', watchRef(w))
        setStatus(`Refused — watch rule ${watchRef(w)} has expired`, 'bad')
        throw new Error('Watch rule has expired')
      }

      // Key resolution is always explicit. Never auto-pick a random key:
      //   - auto run        -> the watch's own auto-approval key
      //   - manual approve  -> the key the user chose in the ready bar
      let key = null
      if (opts.pubkeyHex) key = getKey(opts.pubkeyHex, w.network)
      else if (opts.auto && w.signPubkey) key = getKey(w.signPubkey, w.network)
      if (!key) throw new Error('Choose an action key to sign with (🔑 Keys to add one).')

      // Manual approvals confirm. When the user also ticked "always approve",
      // the confirmation doubles as the warning about the standing rule.
      if (!opts.auto) {
        let msg =
          'Approve this transaction?\n\n' +
          'KEA will sign it with “' + key.name + '” and send the signature to K-pool.\n\n' +
          'This cannot be undone. The transaction may still fail if other signatures or balances are missing.'
        if (opts.makeAuto && !w.signPubkey) {
          msg += '\n\n— ALWAYS APPROVE —\n' +
            'You also chose to automatically approve future transactions that pass this rule. ' +
            `${watchRef(w)} will auto-sign with this key from now on. ` +
            'Undo any time by editing the rule and setting the auto-approval key back to “Manual approval”.'
        }
        if (!confirm(msg)) return
      }

      setStatus(`Signing ${shortHash(e.pch)}…`)

      const sign = await signApprovalPackage(e.kea, key)
      markKeyUsed(key.id)
      const payload = buildSignedPayload(e, sign)
      const submit = await submitSignedResult(w.baseUrl, payload)

      const dec = { decision: 'approved', at: Date.now(), auto: !!opts.auto, sign, payload, submit }
      setDecision(e.key, dec)
      e.decision = dec

      // Auto-approval upgrade: store the chosen key on the rule.
      let upgraded = false
      if (opts.makeAuto && !w.signPubkey) {
        w.signPubkey = key.pubkeyHex
        w.mode = 'sign'
        saveWatches()
        renderWatches()
        upgraded = true
      }

      renderEvents()
      refreshOpenEventDetail(e)

      const how = opts.auto ? 'Auto-approved' : 'Approved'
      if (upgraded) {
                setStatus(`${how} & sent ${shortHash(e.pch)}. ${watchRef(w)} now auto-signs with ${key.name}.`, 'ok')
      } else if (submit.ok) {
        setStatus(`${how} & sent ${shortHash(e.pch)} (signed with ${key.name})`, 'ok')
      } else {
        setStatus(`${how} & signed ${shortHash(e.pch)}; send back to KPool: ${submit.error || submit.status || 'TBC'}`, 'warn')
      }
    }

    function rejectEvent(e) {
      const reason = isPro ? (prompt('Reason for rejection (optional)') || '') : ''
      const payload = buildRejectPayload(e, reason)

      // No reject endpoint exists yet, so this is stored locally and logged only.
      const dec = {
        decision: 'rejected',
        at: Date.now(),
        payload,
        sent: false,
        note: 'No reject endpoint yet — stored locally, not sent to KPool'
      }
      setDecision(e.key, dec)
      e.decision = dec

      console.debug('[KEA] reject stub (not sent):', payload)
      renderEvents()
      refreshOpenEventDetail(e)
      setStatus(`Rejected ${shortHash(e.pch)} (stub — not sent)`, 'warn')
    }

    // -------------------------------------------------------------------------
    // CONTROLLER: QR scan/paste/photo import
    // -------------------------------------------------------------------------

    async function scanQr() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera unavailable — opening photo picker')
        $('qrFile').click()
        return
      }

      qrStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })

      const video = $('qrVideo')
      video.srcObject = qrStream
      video.style.display = 'block'
      $('stopQrBtn').style.display = 'inline-block'

      await video.play()
      qrScanning = true

      if (window.BarcodeDetector) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })

        async function tick() {
          if (!qrScanning) return

          try {
            const codes = await detector.detect(video)
            if (codes.length) {
              stopQr()
              addWatchFromQr(codes[0].rawValue)
              return
            }
          } catch (err) {
            setStatus(`QR scan error: ${err.message}`, 'bad')
          }

          requestAnimationFrame(tick)
        }

        tick()
        return
      }

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      function tickJsQr() {
        if (!qrScanning) return

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)

          if (code) {
            stopQr()
            addWatchFromQr(code.data)
            return
          }
        }

        requestAnimationFrame(tickJsQr)
      }

      setStatus('Scanning QR with camera')
      tickJsQr()
    }

    function stopQr() {
      qrScanning = false

      if (qrStream)
        qrStream.getTracks().forEach(function(t) { t.stop() })

      qrStream = null
      $('qrVideo').style.display = 'none'
      $('stopQrBtn').style.display = 'none'
    }

    function pasteQr() {
      const raw = prompt('Paste Katomia QR/link')
      if (raw) addWatchFromQr(raw)
    }

    function readQrFile(file) {
      const img = new Image()

      img.onload = function() {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(data.data, data.width, data.height)

        if (!code) {
          setStatus('No QR found in image', 'bad')
          return
        }

        addWatchFromQr(code.data)
      }

      img.src = URL.createObjectURL(file)
    }

    function addWatchFromQr(raw) {
      const watch = parseKatomiaQr(raw)
      // A deep link carries its own network — switch the page to it so the new
      // watch (and its transactions) are actually visible after landing.
      if (watch.network && watch.network !== mainNet) setMainNet(watch.network)
      fillWatchForm(watch)
      addWatch(watch)
      closeWatchModal()
    }

    function parseKatomiaQr(raw) {
      const url = parseLooseUrl(raw)
      const p = url.searchParams

      const domain = p.get('domain') || url.hostname
      const baseUrl = p.get('baseUrl') || p.get('kpool') || `https://${domain}`
      const wsUrl = p.get('wsUrl') || p.get('ws') || `wss://${domain}/ws`
      const network = p.get('network')
      const gameId = p.get('gameId') || p.get('game') || ''
      const name = p.get('name') || p.get('displayName') || p.get('trader') || ''
      const orderPubkey = String(p.get('orderPubkey') || p.get('intentPubkey') || p.get('watchPubkey') || '').trim().toLowerCase()

      if (!domain) throw new Error('QR missing domain')
      if (!network) throw new Error('QR missing network')
      if (!orderPubkey) throw new Error('QR missing trader intent public key')

      return normaliseWatch({ baseUrl, wsUrl, network, gameId, orderPubkey, name })
    }

    function parseLooseUrl(raw) {
      raw = String(raw || '').trim()
      try { return new URL(raw) } catch {}
      try { return new URL(`https://${raw}`) } catch {}
      throw new Error('Could not parse QR/link')
    }

    // -------------------------------------------------------------------------
    // VIEW: main page, modals, display helpers
    // -------------------------------------------------------------------------

    function renderWatches() {
      const el = $('watches')
      el.innerHTML = ''

      const shown = sortedWatches().filter(function(w) { return w.network === mainNet })

      if (!shown.length) {
        el.innerHTML = watches.length
          ? `<div class="empty">No ${mainNet} rules. Switch network above, or add one for this network.</div>`
          : '<div class="empty">No rules yet. Scan a QR to add one. Turn on Pro mode for 🛠️ manual entry.</div>'
        return
      }

      const table = document.createElement('table')
      const head = document.createElement('tr')

      for (const h of ['#', 'Rule', 'Policy', 'Approval', 'State', 'Last', '']) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }

      table.appendChild(head)

      for (const w of shown) {
        const tr = document.createElement('tr')
        tr.className = 'clickable card-row watch-row'
        tr.dataset.watchId = w.id
        tr.onmouseenter = function() { setWatchHover(w.id) }
        tr.onmouseleave = function() { setWatchHover(null) }
        tr.onclick = function() { openWatchModal(w) }

        cell(tr, watchRef(w) + (isAuto(w) && w.status === 'connected' ? ' \u26A1' : ''), '#', 'watch-ref-cell')
        cell(tr, watchTitle(w), 'Rule', 'strong-cell')
        policyChipCell(tr, w)
        pillCell(tr, approvalLabel(w), 'Approval')
        cell(tr, watchStateText(w), 'State', (statusClass(w) + ' state-cell').trim())
        cell(tr, w.lastSeenAt ? formatShortTime(w.lastSeenAt) : '-', 'Last', 'time-cell')

        const controls = document.createElement('td')
        controls.dataset.label = ''
        controls.className = 'controls'
        // Row click now opens the edit modal (where delete also lives), so the
        // row keeps only quick actions: pause/play, and clone in Pro mode.
        controls.appendChild(actionButton(w.paused ? '▶️' : '⏸️', function() { toggleWatchPaused(w.id) }, 'icon-action', w.paused ? 'Resume watch' : 'Pause watch'))
        controls.appendChild(actionButton('📋', function() { openWatchModal(w, { clone: true }) }, 'icon-action pro-only', 'Clone watch'))
        tr.appendChild(controls)

        table.appendChild(tr)
      }

      el.appendChild(table)
    }

    function renderEvents() {
      const el = $('events')
      el.innerHTML = ''

      const shown = events.filter(function(e) { return e.network === mainNet })

      if (!shown.length) {
        el.innerHTML = events.length
          ? `<div class="empty">No ${mainNet} transactions. Switch network above to see others.</div>`
          : '<div class="empty">No transactions yet. KEA will list doorbells and checked approval packages here.</div>'
        return
      }

      const showWatch = shouldShowTransactionWatch()
      const table = document.createElement('table')
      const head = document.createElement('tr')
      const headers = ['', 'Strike', showWatch ? 'Rule' : null, 'Tx', 'Status', 'Notes'].filter(function(x) { return x !== null })

      for (const h of headers) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }

      table.appendChild(head)

      for (const e of shown) {
        const tr = document.createElement('tr')
        const status = transactionStatus(e)
        tr.className = `clickable card-row tx-row ${status.tone || ''} ${e.decision?.auto ? 'auto' : ''}`
        tr.dataset.watchId = e.watchId || ''
        tr.onmouseenter = function() { setWatchHover(e.watchId) }
        tr.onmouseleave = function() { setWatchHover(null) }
        tr.onclick = function() { showEventDetail(e) }

        cell(tr, chainGlyph(e), '', `tx-chain ${status.tone || ''}`, chainTitle(e))
        cell(tr, strikeDisplay(e), 'Strike', 'time-cell')
        if (showWatch) {
          const lw = getWatch(e.watchId)
          cell(tr, e.watchRef || (lw ? watchRef(lw) : '-'), 'Rule', 'watch-ref-cell')
        }
        cell(tr, txLabel(e), 'Tx', 'mono tx-cell', txTitle(e))
        cell(tr, status.text, 'Status', status.tone || '', e.summary || '')
        cell(tr, transactionNotes(e), 'Notes', 'notes-cell', e.summary || '')

        table.appendChild(tr)
      }

      el.appendChild(table)
    }

    function sortedWatches() {
      return [...watches].sort(function(a, b) { return (a.ref || 0) - (b.ref || 0) })
    }

    function shouldShowTransactionWatch() {
      if (watches.length > 1) return true
      const refs = new Set(events.map(function(e) { return e.watchRef }).filter(Boolean))
      return refs.size > 1
    }

    function setWatchHover(watchId) {
      document.querySelectorAll('.watch-linked').forEach(function(row) { row.classList.remove('watch-linked') })
      if (!watchId) return
      document.querySelectorAll(`[data-watch-id="${watchId}"]`).forEach(function(row) { row.classList.add('watch-linked') })
    }

    // ---- watch modal -------------------------------------------------------

    function openWatchModal(w, opts) {
      hideModalError()
      const clone = !!(opts && opts.clone)
      cloningFromId = clone ? (w ? w.id : null) : null
      editingWatchId = (w && !clone) ? w.id : null

      if (clone) {
        $('watchModalTitle').textContent = `⚙️ Clone ${watchRef(w)}`
        $('saveWatchBtn').textContent = 'Add rule'
        $('deleteWatchBtn').style.display = 'none'
        const seed = Object.assign({}, w, { name: w.name ? `${w.name} (copy)` : '' })
        fillWatchForm(seed)
      } else if (w) {
        $('watchModalTitle').textContent = `⚙️ Edit ${watchRef(w)}`
        $('saveWatchBtn').textContent = 'Save rule'
        $('deleteWatchBtn').style.display = 'inline-block'
        fillWatchForm(w)
      } else {
        $('watchModalTitle').textContent = '⚙️ Add rule'
        $('saveWatchBtn').textContent = 'Add rule'
        $('deleteWatchBtn').style.display = 'none'
        fillWatchForm(defaultWatch())
      }

      applyWatchModalMode(w && !clone ? w : null)
      $('watchModal').showModal()
    }

    // In basic mode the modal's job is just to pick the auto-approval key, so
    // the subscription-defining fields are shown read-only; Pro mode unlocks
    // them. The debug expander (existing watch only) is Pro-only via its class.
    function applyWatchModalMode(existing) {
      // The query is read-only in normal mode (rendered as a list) and editable
      // in Pro mode (the inputs are Pro-only), so there's no per-field lock.
      const dbg = $('watchDebug')
      if (existing) {
        $('watchDebugPre').textContent = JSON.stringify(stripWatchRuntime(existing), null, 2)
        dbg.style.display = ''
        dbg.open = false
      } else {
        dbg.style.display = 'none'
        $('watchDebugPre').textContent = ''
      }
    }

    function closeWatchModal() {
      editingWatchId = null
      cloningFromId = null
      hideModalError()
      hideCommitmentOutput()
      $('watchModal').close()
    }

    // A small library of friendly labels for known query keys. Any key NOT in
    // the library falls back to its raw name from the query JSON — query fields
    // are query parameters, not a fixed set of form fields, so we never require
    // a key to be known.
    const QUERY_LABELS = { orderPubkey: 'trader key', gameId: 'game', network: 'network', dealId: 'deal' }
    function queryLabel(k) { return QUERY_LABELS[k] || k }

    // Normal mode: a plain, borderless label/value list. Read-only.
    function renderQueryView(w) {
      const el = $('queryView')
      if (!el) return
      el.innerHTML = ''
      const q = (w && w.query) || {}
      for (const k of Object.keys(q)) {
        const raw = q[k] == null ? '' : String(q[k])
        const row = document.createElement('div')
        row.className = 'q-row'
        const key = document.createElement('span')
        key.className = 'q-key'
        key.textContent = queryLabel(k)
        const val = document.createElement('span')
        val.className = 'q-val mono'
        val.textContent = raw ? (k === 'orderPubkey' ? shortKey(raw) : raw) : 'any'
        if (!raw) val.classList.add('muted')
        row.appendChild(key)
        row.appendChild(val)
        el.appendChild(row)
      }
    }

    // Pro mode: a little inline key/value editor in the same list style (raw key
    // names, both fields editable, ✕ to remove, + to add). The query is just a
    // bag of backend filter params, so the editor is generic — nothing is a
    // hard-coded form field.
    function renderQueryEdit(w) {
      const el = $('queryEdit')
      if (!el) return
      el.innerHTML = ''
      const q = (w && w.query) || {}
      const keys = Object.keys(q)
      if (!keys.length) { addQueryRow('', ''); return }
      for (const k of keys) addQueryRow(k, q[k] == null ? '' : String(q[k]))
    }

    function addQueryRow(key, value) {
      const el = $('queryEdit')
      if (!el) return
      const row = document.createElement('div')
      row.className = 'qe-row'

      const k = document.createElement('input')
      k.className = 'qe-key mono'
      k.placeholder = 'key'
      k.value = key || ''

      const v = document.createElement('input')
      v.className = 'qe-val mono'
      v.placeholder = 'value'
      v.value = value || ''

      const x = document.createElement('button')
      x.type = 'button'
      x.className = 'qe-del'
      x.title = 'Remove field'
      x.setAttribute('aria-label', 'Remove field')
      x.textContent = '\u2715'
      x.onclick = function() { row.remove() }

      row.appendChild(k)
      row.appendChild(v)
      row.appendChild(x)
      el.appendChild(row)
    }

    // Dynamic check indicators: show the user which verifications will run,
    // based on what's in the query. If a dealId is present, show whether the
    // template is cached and verified.
    function renderCheckIndicators(w) {
      const el = $('checkIndicators')
      if (!el) return
      el.innerHTML = ''
      const q = (w && w.query) || {}
      const items = []
      if (String(q.orderPubkey || '').trim()) {
        items.push({ id: 'intentSig', label: 'Intent signature', ok: true })
      }
      const dealId = String(q.dealId || '').trim()
      if (dealId) {
        const cached = getCachedDeal(dealId)
        items.push({
          id: 'deal',
          label: 'Deal ' + shortHash(dealId),
          ok: !!cached,
          note: cached ? 'verified' : 'not fetched yet'
        })
      }
      if (!items.length) {
        el.innerHTML = '<span class="muted">No checks — add orderPubkey or dealId to the query</span>'
        return
      }
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var row = document.createElement('div')
        row.className = 'check-indicator'
        var icon = document.createElement('span')
        icon.className = item.ok ? 'ok' : 'warn'
        icon.textContent = item.ok ? '\u2705' : '\u23F3'
        var lbl = document.createTextNode(' ' + item.label + ' ')
        row.appendChild(icon)
        row.appendChild(lbl)
        if (item.note) {
          var note = document.createElement('span')
          note.className = 'muted'
          note.textContent = item.note
          row.appendChild(note)
        }
        el.appendChild(row)
      }
    }

    // On rule save, if the query includes a dealId, fetch + verify the deal
    // template so it's cached before any transactions arrive.
    async function fetchDealIfNeeded(watch) {
      var dealId = String((watch.query && watch.query.dealId) || '').trim()
      if (!dealId) return
      var cached = getCachedDeal(dealId)
      if (cached) {
        console.debug('[KEA] deal template already cached', dealId.slice(0, 12))
        return
      }
      setStatus('Fetching deal template ' + dealId.slice(0, 12) + '\u2026', 'warn')
      try {
        
        await fetchAndVerifyDeal(dealId, watch.baseUrl) //  todo kpos review
        setStatus('Deal template verified \u2713', 'ok')
      } catch (err) {
        setStatus('Deal fetch failed: ' + err.message, 'bad')
        console.warn('[KEA] deal fetch failed on save', err)
      }
    }

    // Read the editor back into a plain query object, skipping rows with a blank
    // key. Last write wins if a key is duplicated.
    function queryFromEditor() {
      const el = $('queryEdit')
      const out = {}
      if (!el) return out
      el.querySelectorAll('.qe-row').forEach(function(row) {
        const k = row.querySelector('.qe-key').value.trim()
        if (!k) return
        out[k] = row.querySelector('.qe-val').value.trim()
      })
      return out
    }

    function fillWatchForm(w) {
      $('watchName').value = w.name || ''
      $('baseUrl').value = w.baseUrl || ''
      $('wsUrl').value = w.wsUrl || ''
      // Normal mode reads the label/value list; Pro mode edits the same query
      // via the inline editor. Populate both so saving from either mode
      // round-trips identically.
      renderQueryView(w)
      renderQueryEdit(w)
      renderCheckIndicators(w)
      $('expiresAt').value = w.expiresAt || ''
      refreshSignKeyOptions(w.signPubkey || '', w.network || mainNet)
      // Clear any commitment rendered for a previously opened watch.
      hideCommitmentOutput()
    }

    // ---- execution commitment (Raise commitment button) -------------------

    // Build + sign a kpay.executionCommitment from the watch form's current
    // rule, using the executor (Sally's) action key, and render the envelope.
    function raiseCommitment() {
      const rule = watchFromForm()
      if (!rule.query.orderPubkey && !rule.query.dealId)
        throw new Error('Add a trader intent public key or deal ID before raising a commitment')

      const net = rule.query.network

      // Executor key = the chosen auto-approval key, else the sole key on this
      // network if there is exactly one, else ask the user to pick one.
      let key = $('signPubkey').value ? getKey($('signPubkey').value, net) : null
      if (!key) {
        const avail = loadKeys(net)
        if (avail.length === 1) key = avail[0]
      }
      if (!key) throw new Error(`Choose an action key on ${net} (use 🔑 Keys, then pick it above) to sign the commitment`)

      buildExecutionCommitmentEnvelope(rule, key)
        .then(function(envelope) {
          markKeyUsed(key.id)
          showCommitmentOutput(envelope)
          setStatus(`Raised commitment ${shortHash(envelope.commitment.id, 8)} (signed with ${key.name})`, 'ok')
        })
        .catch(function(err) { setStatus(`ERROR ${err.message}`, 'bad') })
    }

    function showCommitmentOutput(envelope) {
      $('commitmentPre').textContent = JSON.stringify(envelope, null, 2)
      $('commitmentOut').style.display = ''
    }

    function hideCommitmentOutput() {
      const out = $('commitmentOut')
      if (!out) return
      out.style.display = 'none'
      const pre = $('commitmentPre')
      if (pre) pre.textContent = ''
    }

    function copyCommitment() {
      const pre = $('commitmentPre')
      const text = pre ? pre.textContent : ''
      if (!text) return
      const ok = function() { setStatus('Commitment JSON copied') }
      const no = function() { setStatus('Copy failed — select the JSON and copy manually', 'warn') }
      try {
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok).catch(no)
        else no()
      } catch { no() }
    }

    // The auto-approval key list is scoped to the watch's network, so you can
    // only pick a key that belongs to the network this watch runs on.
    function refreshSignKeyOptions(selected, network) {
      const sel = $('signPubkey')
      sel.innerHTML = ''

      const none = document.createElement('option')
      none.value = ''
      none.textContent = 'Manual approval — ask me each time'
      sel.appendChild(none)

      for (const k of loadKeys(network || mainNet)) {
        const opt = document.createElement('option')
        opt.value = k.pubkeyHex
        opt.textContent = `${k.name} · ${shortKey(k.pubkeyHex)}`
        sel.appendChild(opt)
      }

      sel.value = selected || ''
    }

    function defaultWatch() {
      // A fresh watch belongs to the network we're currently viewing.
      return normaliseWatch({ network: mainNet })
    }

    // ---- keys modal --------------------------------------------------------

    function loadKeysNet() {
      try { keysNet = localStorage[KEYS_NET_KEY] === 'testnet' ? 'testnet' : 'mainnet' } catch { keysNet = 'mainnet' }
    }

    // The main page shows ONE network at a time (watches + transactions are
    // filtered to it). Persisted so it survives reloads.
    function loadMainNet() {
      try { mainNet = localStorage[MAIN_NET_KEY] === 'testnet' ? 'testnet' : 'mainnet' } catch { mainNet = 'mainnet' }
    }

    function setMainNet(net) {
      mainNet = net === 'testnet' ? 'testnet' : 'mainnet'
      try { localStorage[MAIN_NET_KEY] = mainNet } catch {}
      applyMainNet()
      renderWatches()
      renderEvents()
    }

    function applyMainNet() {
      // Theme the whole page for the current network (subtle accenting on the
      // header, matching the Keys modal): testnet orange, mainnet purple.
      document.body.dataset.net = mainNet
      const toggle = $('mainNetToggle')
      if (toggle) {
        toggle.dataset.net = mainNet
        toggle.querySelectorAll('button[data-net]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.net === mainNet)
        })
      }
    }

    function setKeysNet(net) {
      keysNet = net === 'testnet' ? 'testnet' : 'mainnet'
      try { localStorage[KEYS_NET_KEY] = keysNet } catch {}
      applyKeysNet()
      renderKeys()
    }

    // Scope + theme the Keys modal to the selected network (mainnet purple,
    // testnet orange — matching hashscan.io). Edits apply to this network only.
    // The Keys modal is scoped to the network the page is showing (it no longer
    // has its own toggle) — it just labels and themes itself for that network.
    function applyKeysNet() {
      const modal = $('keysModal')
      modal.dataset.net = keysNet
      const nm = $('keysNetName')
      nm.textContent = keysNet
      nm.dataset.net = keysNet
    }

    function openKeysModal() {
      // Always scoped to the network the page is showing. To manage the other
      // network's keys, switch the page toggle first, then reopen.
      setKeysNet(mainNet)
      $('keysModal').showModal()
    }

    // Keep the watch modal's key dropdown in sync after key changes, but only
    // when that modal is actually open.
    function refreshOpenWatchKeyOptions() {
      if ($('watchModal').open) refreshSignKeyOptions($('signPubkey') ? $('signPubkey').value : '')
    }

    function renderKeys() {
      const el = $('keysList')
      el.innerHTML = ''

      const keys = loadKeys(keysNet)
      if (!keys.length) {
        el.innerHTML = `<div class="empty">No ${keysNet} keys yet. Generate or import one below.</div>`
        return
      }

      const table = document.createElement('table')
      const head = document.createElement('tr')
      for (const h of ['Name', 'Public key', 'Added', 'Last used', '']) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }
      table.appendChild(head)

      for (const k of keys) {
        const tr = document.createElement('tr')

        // Inline-editable name: click to edit, commit on blur/Enter. No dialog.
        const nameTd = document.createElement('td')
        nameTd.dataset.label = 'Name'
        nameTd.className = 'strong-cell key-name'
        nameTd.contentEditable = 'true'
        nameTd.spellcheck = false
        nameTd.title = 'Click to rename'
        nameTd.textContent = k.name
        nameTd.onclick = function(ev) { ev.stopPropagation() }
        nameTd.onkeydown = function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); nameTd.blur() }
        }
        nameTd.onblur = function() {
          const next = nameTd.textContent.trim()
          if (next && next !== k.name) {
            renameKey(k.id, next)
            k.name = next
            refreshOpenWatchKeyOptions()
            setStatus(`Renamed key to ${next}`)
          } else {
            nameTd.textContent = k.name
          }
        }
        tr.appendChild(nameTd)

        // Full public key, not abbreviated.
        cell(tr, k.pubkeyHex, 'Public key', 'mono key-full', k.pubkeyHex)
        cell(tr, formatDateTime(k.createdAt), 'Added', 'time-cell')
        cell(tr, k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'Never', 'Last used', 'time-cell muted')

        const controls = document.createElement('td')
        controls.dataset.label = ''
        controls.className = 'controls'
        controls.appendChild(actionButton('✕', function() {
          if (!confirm(`Delete key “${k.name}”?\n\nThis cannot be undone. Any watch using it will fall back to manual approval.`)) return
          deleteKey(k.id)
          renderKeys()
          refreshOpenWatchKeyOptions()
          setStatus(`Deleted key ${k.name}`)
        }, 'icon-action danger', 'Delete key'))
        tr.appendChild(controls)

        table.appendChild(tr)
      }

      el.appendChild(table)
    }

    async function genKey() {
      const name = prompt(`Name this ${keysNet} action key`, `Action key ${loadKeys(keysNet).length + 1}`)
      if (name === null) return
      const k = await generateKey(name || undefined, keysNet)
      renderKeys()
      refreshOpenWatchKeyOptions()
      setStatus(`Generated ${k.name} (${keysNet})`)
    }

    async function importKeyFlow() {
      const seed = prompt('Paste a 32-byte ed25519 seed (64 hex chars)')
      if (!seed) return
      const name = prompt(`Name this imported ${keysNet} key`, 'Imported key')
      if (name === null) return
      const k = await importKey(name || undefined, seed, keysNet)
      renderKeys()
      refreshOpenWatchKeyOptions()
      setStatus(`Imported ${k.name} (${keysNet})`)
    }

    // ---- event detail ------------------------------------------------------

    function refreshOpenEventDetail(e) {
      if (openEvent && openEvent.key === e.key && $('detailModal').open)
        showEventDetail(e)
    }

    function showEventDetail(e) {
      openEvent = e
      $('detailModalTitle').textContent = 'Transaction detail'

      const body = $('detailModalBody')
      body.innerHTML = ''

      body.appendChild(renderDecisionBar(e))

      body.appendChild(sectionTitle('Rule'))
      body.appendChild(infoCard(watchInfoRows(e)))

      body.appendChild(sectionTitle('Transaction'))
      body.appendChild(infoCard(txInfoRows(e)))

      body.appendChild(sectionTitle('Checks'))
      body.appendChild(renderChecks(e))

      if (e.decision) body.appendChild(renderDecisionDetail(e))

      const dbg = document.createElement('div')
      dbg.className = 'pro-only'
      dbg.appendChild(sectionTitle('Details'))

      // One-click copy of all diagnostic data for sharing / debugging.
      var copyBtn = document.createElement('button')
      copyBtn.textContent = '\uD83D\uDCCB Copy all diagnostics'
      copyBtn.className = 'link-btn'
      copyBtn.onclick = function() {
        var diag = {
          summary: e.debug || null,
          verification: e.verification || null,
          fetch: e.fetch || null,
          kea: e.kea || null,
          raw: e.raw || null,
          doorbell: e.rawDoorbell || null,
          decision: e.decision || null
        }
        navigator.clipboard.writeText(JSON.stringify(diag, null, 2))
          .then(function() { copyBtn.textContent = '\u2713 Copied' })
          .catch(function() { copyBtn.textContent = 'Copy failed' })
        setTimeout(function() { copyBtn.textContent = '\uD83D\uDCCB Copy all diagnostics' }, 2000)
      }
      dbg.appendChild(copyBtn)

      if (e.verification) dbg.appendChild(jsonDetails('Verification result', e.verification))
      dbg.appendChild(jsonDetails('Debug summary', e.debug || null))
      dbg.appendChild(jsonDetails('Fetch information', e.fetch || null))
      dbg.appendChild(jsonDetails('KEA detail', e.kea || null))
      dbg.appendChild(jsonDetails('Raw fetched package', e.raw || null))
      dbg.appendChild(jsonDetails('Raw doorbell', e.rawDoorbell || null))
      if (e.decision) dbg.appendChild(jsonDetails('Decision record', e.decision))
      body.appendChild(dbg)

      $('detailModal').showModal()
    }

    function renderDecisionBar(e) {
      const bar = document.createElement('div')
      bar.className = 'decision-bar'

      if (e.decision?.decision === 'approved') {
        bar.classList.add('ok-bg')
        const s = e.decision.submit || {}
        const how = e.decision.auto ? 'Auto-approved' : 'Approved'
        const line = s.ok
          ? `✅ ${how} and sent to KPool`
          : `✅ ${how} and signed — send back ${s.error ? `failed (${s.error})` : `returned ${s.status || 'TBC'}`}`
        bar.appendChild(textNode(line, 'decision-headline'))
        bar.appendChild(textNode(`Signed with ${e.decision.sign?.keyName || 'action key'} · ${shortKey(e.decision.sign?.pubkeyHex)}`, 'decision-sub'))
        return bar
      }

      if (e.decision?.decision === 'rejected') {
        bar.classList.add('bad-bg')
        bar.appendChild(textNode('🚫 Rejected', 'decision-headline'))
        bar.appendChild(textNode(e.decision.payload?.reason || 'Stored locally, not sent to KPool', 'decision-sub'))
        return bar
      }

      if (eventIsReady(e)) {
        bar.classList.add('ready-bg')
        bar.appendChild(textNode('🔔 Ready to approve', 'decision-headline'))
        bar.appendChild(textNode('KEA checked the package and the promise matches the action. Choose a key to sign with.', 'decision-sub'))

        const keys = loadKeys(e.network)

        // Explicit key selection — never auto-pick. If no keys exist the user
        // is pointed at the Keys manager and approve is disabled.
        const keyWrap = document.createElement('div')
        keyWrap.className = 'approve-key-row'

        const keyLabel = document.createElement('label')
        keyLabel.textContent = 'Sign with'
        keyWrap.appendChild(keyLabel)

        const keySel = document.createElement('select')
        if (!keys.length) {
          const opt = document.createElement('option')
          opt.value = ''
          opt.textContent = `No ${e.network} key — add one with 🔑 Keys`
          keySel.appendChild(opt)
          keySel.disabled = true
        } else {
          for (const k of keys) {
            const opt = document.createElement('option')
            opt.value = k.pubkeyHex
            opt.textContent = `${k.name} · ${shortKey(k.pubkeyHex)}`
            keySel.appendChild(opt)
          }
        }
        keyWrap.appendChild(keySel)
        bar.appendChild(keyWrap)


        // "Always approve" upgrade path — converts this watch into an Action.
        const alwaysWrap = document.createElement('label')
        alwaysWrap.className = 'always-row'
        const always = document.createElement('input')
        always.type = 'checkbox'
        alwaysWrap.appendChild(always)
        alwaysWrap.appendChild(document.createTextNode('Automatically approve future transactions that pass this rule. You can turn this off from the rule settings.'))

        const actions = document.createElement('div')
        actions.className = 'approve-actions'

        const approveBtn = actionButton('Approve Once', function() {
          approveEvent(e, { pubkeyHex: keySel.value, makeAuto: always.checked })
            .catch(function(err) { setStatus(`ERROR ${err.message}`, 'bad') })
        }, 'approve')

        function updateApproveLabel() {
          // approveBtn.textContent = always.checked ? 'Approve' : 'Approve Once'
          // approveBtn.textContent = always.checked ? 'Approve until cancelled' : 'Approve Once'
          // approveBtn.textContent = always.checked ? 'Approve ongoing' : 'Approve Once'
          // approveBtn.textContent = always.checked ? 'Approve ongoing' : 'Approve'
          // approveBtn.textContent = always.checked ? 'Pre-approve until cancelled' : 'Approve'
          approveBtn.textContent = always.checked ? 'Approve ongoing' : 'Approve'
        }

        always.onchange = updateApproveLabel
        updateApproveLabel()

        if (!keys.length) approveBtn.disabled = true
        actions.appendChild(actionButton('Not now', function() { openEvent = null; $('detailModal').close() }, 'quiet'))
        actions.appendChild(actionButton('Reject', function() { rejectEvent(e) }, 'reject'))
        actions.appendChild(approveBtn)
        bar.appendChild(actions)
        bar.appendChild(alwaysWrap)


        return bar
      }

      bar.classList.add('muted-bg')
      const text = e.check === 'fail'
        ? `Not approvable — check failed: ${e.summary || 'unknown'}`
        : (e.check === 'not checked' ? 'Watch-only — no check performed' : 'Not ready to approve yet')
      bar.appendChild(textNode(text, 'decision-sub'))
      return bar
    }


    function renderDecisionDetail(e) {
      const wrap = document.createElement('div')
      wrap.appendChild(sectionTitle('Approval result'))

      if (e.decision.decision === 'approved') {
        const s = e.decision.submit || {}
        wrap.appendChild(infoCard([
          ['Decision', e.decision.auto ? 'Approved (auto)' : 'Approved'],
          ['Signed at', e.decision.sign?.signedAt || '-'],
          ['Approval key', e.decision.sign?.keyName || '-'],
          ['Key pubkey', shortKey(e.decision.sign?.pubkeyHex), true],
          ['Signed over', e.decision.sign?.signedOver || '-'],
          ['Sent to', s.url || '-', true],
          ['Send status', s.sent ? `${s.ok ? 'OK' : 'error'} ${s.status || ''}`.trim() : (s.error || 'not sent')]
        ]))
      } else {
        wrap.appendChild(infoCard([
          ['Decision', 'Rejected'],
          ['Reason', e.decision.payload?.reason || '-'],
          ['Sent', 'No — reject endpoint TBC'],
          ['Recorded', formatShortTime(e.decision.at)]
        ]))
      }

      return wrap
    }

    function renderChecks(e) {
      const box = document.createElement('div')
      box.className = 'check-list'

      if (!e.verification && e.check !== 'fail') {
        box.appendChild(checkItem('⏳ Awaiting verification detail'))
        return box
      }

      if (e.verification?.ok) {
        box.appendChild(checkItem('✅ Trader intent signature checked'))
        box.appendChild(checkItem('✅ Transaction scope checked'))
        box.appendChild(checkItem('✅ PCH and bundle checks passed'))
        box.appendChild(checkItem('✅ Transfers are not worse than the signed bundle/fill'))
        return box
      }

      box.appendChild(checkItem(`❌ ${e.verification?.msg || e.summary || 'Check failed'}`))
      return box
    }

    function checkItem(text) {
      const div = document.createElement('div')
      div.className = 'check-item'
      div.textContent = text
      return div
    }

    function sectionTitle(text) {
      const h = document.createElement('h3')
      h.textContent = text
      return h
    }

    // One clean card per section with simple label/value rows — replaces the
    // old per-field bordered pills, which got noisy as sections multiplied.
    function infoCard(rows) {
      const card = document.createElement('div')
      card.className = 'info-card'

      for (const row of rows) {
        if (!row) continue
        const [label, value, mono] = row
        const r = document.createElement('div')
        r.className = 'info-row'

        const l = document.createElement('div')
        l.className = 'info-label'
        l.textContent = label

        const v = document.createElement('div')
        v.className = 'info-value' + (mono ? ' mono' : '')
        v.textContent = (value == null || value === '') ? '-' : String(value)

        r.appendChild(l)
        r.appendChild(v)
        card.appendChild(r)
      }

      return card
    }

    // Block A — why this transaction appeared (the rule that matched).
    function watchInfoRows(e) {
      const w = getWatch(e.watchId)
      const auto = isAuto(w)
      const keyName = auto ? (getKey(w.signPubkey, w.network)?.name || 'auto-approval key') : ''

      const rows = [
        ['Rule', e.watchRef || (w ? watchRef(w) : '-')],
        ['Name', w ? watchTitle(w) : (e.watchLabel || '-')]
      ]

      // Show every query field (not a hard-coded set), using the label library
      // with a raw-key fallback. If the rule was deleted, fall back to the
      // network recorded on the event itself.
      const q = (w && w.query) || (e.network ? { network: e.network } : {})
      for (const k of Object.keys(q)) {
        const raw = q[k] == null ? '' : String(q[k])
        rows.push([queryLabel(k), k === 'orderPubkey' ? shortKey(raw) : (raw || '-'), k === 'orderPubkey'])
      }

      rows.push(['Approval mode', auto ? 'Auto-approve' : 'Manual approval'])
      rows.push(auto ? ['Auto-approval key', `${keyName} · ${shortKey(w.signPubkey)}`, true] : null)
      return rows
    }

    // Block B — the actual incoming transaction.
    function txInfoRows(e) {
      const fills = (e.debug && e.debug.execution) || []
      const mandates = (e.debug && e.debug.mandates) || []
      const orderIds = mandates.map(function(m) { return m.orderId }).filter(Boolean)
      const accounts = [...new Set(mandates.flatMap(function(m) { return m.accountIds || [] }).filter(Boolean))]

      const fillsText = fills.length
        ? fills.map(function(f) { return f.fillId || '(fill)' }).join(', ')
        : '-'

      return [
        ['Tx ID', e.txid || '-', true],
        ['Strike', strikeDisplay(e)],
        ['PCH', e.pch || '-', true],
        ['Network', e.network || '-'],
        ['Source / fills', fillsText],
        orderIds.length ? ['Orders', orderIds.join(', '), true] : null,
        accounts.length ? ['Accounts', accounts.join(', '), true] : null,
        ['Notes', e.summary || '-']
      ]
    }

    function textNode(text, cls) {
      const div = document.createElement('div')
      if (cls) div.className = cls
      div.textContent = text
      return div
    }

    function jsonDetails(title, data) {
      const details = document.createElement('details')
      const summary = document.createElement('summary')
      summary.textContent = title
      details.appendChild(summary)
      details.appendChild(jsonBlock(data))
      return details
    }

    function jsonBlock(data) {
      const pre = document.createElement('pre')
      pre.textContent = JSON.stringify(data, null, 2)
      return pre
    }

    function cell(tr, text, label, cls, title) {
      const td = document.createElement('td')
      td.dataset.label = label || ''
      td.textContent = text == null ? '' : String(text)
      if (cls) td.className = cls
      if (title) td.title = title
      tr.appendChild(td)
      return td
    }

    function pillCell(tr, text, label) {
      const td = document.createElement('td')
      td.dataset.label = label || ''
      const span = document.createElement('span')
      span.className = 'pill'
      span.textContent = text
      td.appendChild(span)
      tr.appendChild(td)
      return td
    }

    // Policy chips cell: up to two small chips showing which verifiable fields
    // are in the query (intent key snippet + deal ID snippet). Shows in the
    // Policy column on both desktop and mobile.
    function policyChipCell(tr, w) {
      var td = document.createElement('td')
      td.dataset.label = 'Policy'
      td.className = 'policy-cell'
      var q = (w && w.query) || {}
      var key = String(q.orderPubkey || '').trim()
      var deal = String(q.dealId || '').trim()
      if (key) {
        var c1 = document.createElement('span')
        c1.className = 'policy-chip intent-chip'
        c1.textContent = '\uD83D\uDD11 ' + key.slice(-4)
        c1.title = 'Intent key: ' + key
        td.appendChild(c1)
      }
      if (deal) {
        var c2 = document.createElement('span')
        c2.className = 'policy-chip deal-chip'
        c2.textContent = '\uD83D\uDCDC ' + deal.slice(0, 6)
        c2.title = 'Deal: ' + deal
        td.appendChild(c2)
      }
      tr.appendChild(td)
      return td
    }

    function actionButton(text, fn, cls, title) {
      const btn = document.createElement('button')
      btn.textContent = text
      if (cls) btn.className = cls
      if (title) btn.title = title
      if (title) btn.setAttribute('aria-label', title)
      btn.onclick = function(ev) {
        ev.stopPropagation()
        fn()
      }
      return btn
    }

    function callerLine(skip = 2) {
      const stack = new Error().stack || ''
      const lines = stack.split('\n').map(function(x) { return x.trim() })
      return lines[skip] || ''
    }

    function setStatus(msg, cls) {
      const el = $('status')
      el.textContent = msg || 'Ready.'
      el.className = `status-line ${cls || ''}`

      console.debug('[KEA]', msg, callerLine(3))
    }


    // Date + time, for the keys list (createdAt / lastUsedAt diagnostics).
    function formatDateTime(ms) {
      if (!ms) return '-'
      const d = new Date(ms)
      return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }

    // A rule keeps a stable R-number. Auto-approval is shown as a suffix:
    // R12 = manual rule, R12A = same rule with auto-approval enabled.
    function isAuto(w) {
      return !!(w && String(w.signPubkey || '').trim())
    }

    // Stable R-number — auto/live status is shown visually (lightning bolt),
    // not baked into the ref string.
    function watchRef(w) {
      return w?.ref ? 'R' + w.ref : 'R?'
    }

    function approvalLabel(w) {
      return isAuto(w) ? `Auto · ${String(w.signPubkey).slice(-6)}` : 'Manual'
    }

    function watchTitle(w) {
      if (w.name) return w.name
      return `${w.network || '-'} · ${w.gameId || 'all games'}`
    }

    function watchLabel(w) {
      return `${watchRef(w)} · ${watchTitle(w)} · ${watchKeyTail(w)}`
    }

    function watchKeyTail(w) {
      return String(w.orderPubkey || '').slice(-6) || '-'
    }

    function watchStateText(w) {
      if (w.paused) return 'Paused'
      if (w.status === 'connected') return 'Live'
      if (w.status === 'connecting') return 'Connecting'
      if (w.status === 'disconnected') return 'Offline'
      if (w.status === 'error') return 'Error'
      return w.status || 'Idle'
    }

    function statusClass(w) {
      if (w.paused) return 'warn'
      if (w.status === 'connected') return 'ok'
      if (w.status === 'error') return 'bad'
      return ''
    }

    function transactionStatus(e) {
      if (e.decision?.decision === 'approved') return { text: e.decision.auto ? 'Approved (auto)' : 'Approved', tone: 'ok' }
      if (e.decision?.decision === 'rejected') return { text: 'Rejected', tone: 'bad' }
      if (e.status === 'fetch error') return { text: 'Fetch failed', tone: 'bad' }
      if (e.check === 'fail') return { text: 'Check failed', tone: 'bad' }
      if (e.check === 'pass') return { text: 'Ready', tone: 'ready' }
      if (e.status === 'fetching' || e.status === 'fetched') return { text: 'Checking…', tone: 'warn' }
      if (e.check === 'not checked') return { text: 'Watch only', tone: '' }
      if (e.status === 'doorbell') return { text: 'Doorbell', tone: 'warn' }
      return { text: e.status || 'Pending', tone: '' }
    }

    function transactionNotes(e) {
      const note = e.summary || ''
      if (!note) return '-'
      if (note === 'Doorbell received') return ''
      return shortText(note, 72)
    }

    // TX column now shows the transaction id + short PCH, e.g.
    // 0.0.3039988@1781643138.272000000#71f904 — not the matched order ids.
    function txLabel(e) {
      const pch6 = e.pch ? `#${shortHash(e.pch, 6)}` : ''
      if (e.txid) return `${e.txid}${pch6}`
      return e.pch ? shortHash(e.pch, 14) : '-'
    }

    function txTitle(e) {
      if (e.txid) return `${e.txid}${e.pch ? `#${e.pch}` : ''}`
      return e.pch || ''
    }

    function strikeDisplay(e) {
      return formatShortTime(e.strikeAt || e.createdAt)
    }

    function chainGlyph(e) {
      return e.consensusAt || e.consensusStatus || e.receipt ? '■' : '○'
    }

    function chainTitle(e) {
      return chainGlyph(e) === '■' ? 'Through Hedera consensus' : 'Not through Hedera consensus yet'
    }

    function deleteEditingWatch() {
      if (!editingWatchId) return
      const id = editingWatchId
      closeWatchModal()
      removeWatch(id)
    }

    function addWatchFromUrlParams() {   // todo review user security re watch injection
      const p = new URLSearchParams(location.search)

      const hasWatch =
        p.has('orderPubkey') ||
        p.has('intentPubkey') ||
        p.has('watchPubkey')

      if (!hasWatch) return

      try {
        const url = new URL(location.href)
        url.search = p.toString()

        const watch = parseKatomiaQr(url.toString())

        // Land on the watch's own network, not whatever was last shown.
        if (watch.network && watch.network !== mainNet) setMainNet(watch.network)
        addWatch(watch)
        setStatus(`Added ${watchLabel(watch)}`)

        history.replaceState({}, '', location.pathname)
      } catch (e) {
        setStatus(`ERROR ${e.message}`, 'bad')
      }
    }

    // ---- pro mode ----------------------------------------------------------

    function loadPro() {
      try { isPro = localStorage[PRO_KEY] === '1' } catch { isPro = false }
    }

    function applyProMode(on) {
      isPro = !!on
      try { localStorage[PRO_KEY] = isPro ? '1' : '0' } catch {}
      document.body.classList.toggle('pro', isPro)
      $('proToggle').checked = isPro
    }

    // -------------------------------------------------------------------------
    // APP BOOTSTRAP
    // -------------------------------------------------------------------------

    $('scanQrBtn').onclick = function() {
      scanQr().catch(function(e) { setStatus(`ERROR ${e.message}`, 'bad') })
    }

    $('toolsBtn').onclick = function() { openWatchModal() }
    $('pasteQrBtn').onclick = function() {
      try { pasteQr() } catch (e) { setStatus(`ERROR ${e.message}`, 'bad') }
    }
    $('stopQrBtn').onclick = function() { stopQr() }
    $('qrFile').onchange = function(e) {
      const file = e.target.files?.[0]
      if (file) readQrFile(file)
    }

    $('saveWatchBtn').onclick = function() {
      try { saveWatchFromForm() } catch (e) { showModalError(e.message) }
    }
    $('deleteWatchBtn').onclick = function() { deleteEditingWatch() }
    $('raiseCommitmentBtn').onclick = function() {
      try { raiseCommitment() } catch (e) { setStatus(`ERROR ${e.message}`, 'bad') }
    }
    $('copyCommitmentBtn').onclick = function() { copyCommitment() }
    $('addQueryRowBtn').onclick = function() { addQueryRow('', '') }
    $('watchModalCloseBtn').onclick = function() { closeWatchModal() }
    $('detailModalCloseBtn').onclick = function() { openEvent = null; $('detailModal').close() }

    $('proToggle').onchange = function(e) { applyProMode(e.target.checked) }
    $('keysBtn').onclick = function() { openKeysModal() }
    $('keysModalCloseBtn').onclick = function() { $('keysModal').close() }
    $('genKeyBtn').onclick = function() { genKey().catch(function(e) { setStatus(`ERROR ${e.message}`, 'bad') }) }
    $('importKeyBtn').onclick = function() { importKeyFlow().catch(function(e) { setStatus(`ERROR ${e.message}`, 'bad') }) }

    // Main-page network toggle: filters watches + transactions to one network.
    $('mainNetToggle').onclick = function(ev) {
      const btn = ev.target.closest('button[data-net]')
      if (btn) setMainNet(btn.dataset.net)
    }

    loadPro()
    applyProMode(isPro)
    loadKeysNet()
    applyKeysNet()
    loadMainNet()
    applyMainNet()
    loadDecisions()
    loadWatches()
    ensureDummyKey('mainnet').catch(function(e) { console.warn('key seed failed', e.message) })
    renderWatches()
    renderEvents()
    addWatchFromUrlParams()
    connectAllWatches()