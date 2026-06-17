
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
      verifyKeaForWatch
    } from './kea-verify.js'

    import {
      loadKeys,
      getKey,
      generateKey,
      importKey,
      deleteKey,
      ensureDummyKey,
      signApprovalPackage,
      buildSignedPayload,
      buildRejectPayload,
      submitSignedResult
    } from './kea-sign.js'

    // -------------------------------------------------------------------------
    // MODEL: app state, local persistence, normalisation
    // -------------------------------------------------------------------------

    const WATCHES_KEY = 'keaWatches.v1'
    const DECISIONS_KEY = 'keaDecisions.v1'   // approve/reject decisions, keyed by event key
    const PRO_KEY = 'keaPro.v1'

    const events = []
    const sockets = {}

    let watches = []
    let decisions = {}
    let isPro = false
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
      return {
        id: w.id || makeId(),
        ref: normaliseWatchRef(w.ref),
        name: String(w.name || '').trim(),
        baseUrl: cleanUrl(w.baseUrl || 'https://hapi5.katomia.com'),
        wsUrl: cleanUrl(w.wsUrl || 'wss://hapi5.katomia.com/ws'),
        network: String(w.network || 'mainnet').trim(),
        gameId: String(w.gameId || '').trim(),
        orderPubkey: String(w.orderPubkey || '').trim().toLowerCase(),
        signPubkey: String(w.signPubkey || '').trim().toLowerCase(),
        mode: w.mode || 'fetch',
        paused: !!w.paused,
        status: w.paused ? 'paused' : (w.status || 'idle'),
        note: w.note || '',
        createdAt: w.createdAt || Date.now(),
        lastSeenAt: w.lastSeenAt || null
      }
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
        network: w.network,
        gameId: w.gameId,
        orderPubkey: w.orderPubkey,
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
      return normaliseWatch({
        id: editingWatchId || undefined,
        name: $('watchName').value,
        baseUrl: $('baseUrl').value,
        wsUrl: $('wsUrl').value,
        network: $('network').value,
        gameId: $('scopeGameId').value,
        orderPubkey: $('orderPubkey').value,
        signPubkey: $('signPubkey').value,
        mode: $('watchMode').value
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
        Object.assign(e, base, { key, createdAt: e.createdAt || base.createdAt })
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

    function saveWatchFromForm() {
      const watch = watchFromForm()
      validateWatch(watch)

      // Edit (only when not cloning) updates in place and refreshes the socket.
      if (editingWatchId && !cloningFromId) {
        const saved = updateExistingWatch(watch)
        closeWatchModal()
        setStatus(`Saved ${watchLabel(saved)}`)
        return
      }

      addWatch(watch)
      closeWatchModal()
    }

    function validateWatch(watch) {
      if (!watch.wsUrl) throw new Error('Missing WebSocket URL')
      if (!watch.baseUrl) throw new Error('Missing KPool base URL')
      if (!watch.network) throw new Error('Missing network')
      if (!watch.orderPubkey) throw new Error('Missing trader intent public key')
    }

    function addWatch(watch) {
      watch = normaliseWatch(watch)
      validateWatch(watch)

      const existing = watches.find(function(w) {
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

      if (w.mode === 'doorbell') {
        e.summary = 'Watch only'
        e.check = 'not checked'
        renderEvents()
        return
      }

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

      const result = await verifyKeaForWatch(out.kea, w)
      e.check = result.ok ? 'pass' : 'fail'
      e.summary = result.msg
      e.verification = result
      e.debug = buildEventDebug(e, w, out.kea || null)

      sortEvents()
      renderEvents()
      refreshOpenEventDetail(e)
      setStatus(result.ok ? `Checked ${shortHash(e.pch)} OK — ready to approve` : `Check failed: ${result.msg}`, result.ok ? 'ok' : 'bad')
    }

    // -------------------------------------------------------------------------
    // CONTROLLER: approve / reject / sign
    // -------------------------------------------------------------------------

    function eventIsReady(e) {
      return e.check === 'pass' && !e.decision
    }

    async function approveEvent(e) {
      if (e.check !== 'pass') throw new Error('Cannot approve — checks have not passed')
      if (!e.kea) throw new Error('No approval package to sign')

      const w = getWatch(e.watchId)
      if (!w) throw new Error('Watch no longer exists')

      // Prefer the watch's chosen action key; fall back to the only/first key
      // so the demo can sign out of the box.
      let key = w.signPubkey ? getKey(w.signPubkey) : null
      if (!key) {
        const all = loadKeys()
        key = all[0] || null
      }
      if (!key) throw new Error('No action key available. Turn on Pro mode and open 🔑 Keys to add one.')

      setStatus(`Signing ${shortHash(e.pch)}…`)

      const sign = await signApprovalPackage(e.kea, key)
      const payload = buildSignedPayload(e, sign)
      const submit = await submitSignedResult(w.baseUrl, payload)

      const dec = { decision: 'approved', at: Date.now(), sign, payload, submit }
      setDecision(e.key, dec)
      e.decision = dec

      renderEvents()
      refreshOpenEventDetail(e)

      if (submit.ok) setStatus(`Approved & sent ${shortHash(e.pch)} (signed with ${key.name})`, 'ok')
      else setStatus(`Approved & signed ${shortHash(e.pch)}; send back to KPool: ${submit.error || submit.status || 'TBC'}`, 'warn')
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

    function reopenDecision(e) {
      delete decisions[e.key]
      saveDecisions()
      e.decision = null
      renderEvents()
      refreshOpenEventDetail(e)
      setStatus(`Reopened ${shortHash(e.pch)}`)
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
      const mode = p.get('mode') || ($('watchMode') ? $('watchMode').value : '') || 'fetch'

      if (!domain) throw new Error('QR missing domain')
      if (!network) throw new Error('QR missing network')
      if (!orderPubkey) throw new Error('QR missing trader intent public key')

      return normaliseWatch({ baseUrl, wsUrl, network, gameId, orderPubkey, mode, name })
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

      if (!watches.length) {
        el.innerHTML = '<div class="empty">No watches yet. Scan a QR to add one. Turn on Pro mode for 🛠️ manual entry.</div>'
        return
      }

      const table = document.createElement('table')
      const head = document.createElement('tr')

      for (const h of ['#', 'Watch', 'Key', 'Mode', 'State', 'Last', '']) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }

      table.appendChild(head)

      for (const w of sortedWatches()) {
        const tr = document.createElement('tr')
        tr.className = 'clickable card-row watch-row'
        tr.onclick = function() { showWatchDetail(w) }

        cell(tr, watchRef(w), '#', 'watch-ref-cell')
        cell(tr, watchTitle(w), 'Watch', 'strong-cell')
        cell(tr, shortKey(w.orderPubkey), 'Key', 'mono key-cell')
        pillCell(tr, modeLabel(w.mode), 'Mode')
        cell(tr, watchStateText(w), 'State', statusClass(w))
        cell(tr, w.lastSeenAt ? formatShortTime(w.lastSeenAt) : '-', 'Last', 'time-cell')

        const controls = document.createElement('td')
        controls.dataset.label = ''
        controls.className = 'controls'
        controls.appendChild(actionButton(w.paused ? '▶️' : '⏸️', function() { toggleWatchPaused(w.id) }, 'icon-action', w.paused ? 'Resume watch' : 'Pause watch'))
        controls.appendChild(actionButton('🛠️', function() { openWatchModal(w) }, 'icon-action pro-only', 'Edit watch'))
        controls.appendChild(actionButton('📋', function() { openWatchModal(w, { clone: true }) }, 'icon-action pro-only', 'Clone watch'))
        controls.appendChild(actionButton('✕', function() { removeWatch(w.id) }, 'icon-action danger', 'Delete watch'))
        tr.appendChild(controls)

        table.appendChild(tr)
      }

      el.appendChild(table)
    }

    function renderEvents() {
      const el = $('events')
      el.innerHTML = ''

      if (!events.length) {
        el.innerHTML = '<div class="empty">No transactions yet. KEA will list doorbells and checked approval packages here.</div>'
        return
      }

      const showWatch = shouldShowTransactionWatch()
      const table = document.createElement('table')
      const head = document.createElement('tr')
      const headers = ['', 'Strike', showWatch ? 'Watch' : null, 'Tx', 'Status', 'Notes'].filter(function(x) { return x !== null })

      for (const h of headers) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }

      table.appendChild(head)

      for (const e of events) {
        const tr = document.createElement('tr')
        const status = transactionStatus(e)
        tr.className = `clickable card-row tx-row ${status.tone || ''}`
        tr.onclick = function() { showEventDetail(e) }

        cell(tr, chainGlyph(e), '', `tx-chain ${status.tone || ''}`, chainTitle(e))
        cell(tr, strikeDisplay(e), 'Strike', 'time-cell')
        if (showWatch) cell(tr, e.watchRef || '-', 'Watch', 'watch-ref-cell')
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

    // ---- watch modal -------------------------------------------------------

    function openWatchModal(w, opts) {
      const clone = !!(opts && opts.clone)
      cloningFromId = clone ? (w ? w.id : null) : null
      editingWatchId = (w && !clone) ? w.id : null

      if (clone) {
        $('watchModalTitle').textContent = `⚙️ Clone ${watchRef(w)}`
        $('saveWatchBtn').textContent = 'Add watch'
        $('deleteWatchBtn').style.display = 'none'
        const seed = Object.assign({}, w, { name: w.name ? `${w.name} (copy)` : '' })
        fillWatchForm(seed)
      } else if (w) {
        $('watchModalTitle').textContent = `⚙️ Edit ${watchRef(w)}`
        $('saveWatchBtn').textContent = 'Save watch'
        $('deleteWatchBtn').style.display = 'inline-block'
        fillWatchForm(w)
      } else {
        $('watchModalTitle').textContent = '⚙️ Add watch'
        $('saveWatchBtn').textContent = 'Add watch'
        $('deleteWatchBtn').style.display = 'none'
        fillWatchForm(defaultWatch())
      }

      $('watchModal').showModal()
    }

    function closeWatchModal() {
      editingWatchId = null
      cloningFromId = null
      $('watchModal').close()
    }

    function fillWatchForm(w) {
      $('watchName').value = w.name || ''
      $('baseUrl').value = w.baseUrl || ''
      $('wsUrl').value = w.wsUrl || ''
      $('network').value = w.network || ''
      $('scopeGameId').value = w.gameId || ''
      $('orderPubkey').value = w.orderPubkey || ''
      $('watchMode').value = w.mode || 'fetch'
      refreshSignKeyOptions(w.signPubkey || '')
    }

    function refreshSignKeyOptions(selected) {
      const sel = $('signPubkey')
      sel.innerHTML = ''

      const none = document.createElement('option')
      none.value = ''
      none.textContent = loadKeys().length ? '(use any available key)' : '(no keys yet)'
      sel.appendChild(none)

      for (const k of loadKeys()) {
        const opt = document.createElement('option')
        opt.value = k.pubkeyHex
        opt.textContent = `${k.name} · ${shortKey(k.pubkeyHex)}`
        sel.appendChild(opt)
      }

      sel.value = selected || ''
    }

    function defaultWatch() {
      return normaliseWatch({})
    }

    function showWatchDetail(w) {
      showJsonDetail(`${watchRef(w)} detail`, stripWatchRuntime(w))
    }

    // ---- keys modal --------------------------------------------------------

    function openKeysModal() {
      renderKeys()
      $('keysModal').showModal()
    }

    function renderKeys() {
      const el = $('keysList')
      el.innerHTML = ''

      const keys = loadKeys()
      if (!keys.length) {
        el.innerHTML = '<div class="empty">No action keys yet. Generate or import one below.</div>'
        return
      }

      const table = document.createElement('table')
      const head = document.createElement('tr')
      for (const h of ['Name', 'Public key', 'Added', '']) {
        const th = document.createElement('th')
        th.textContent = h
        head.appendChild(th)
      }
      table.appendChild(head)

      for (const k of keys) {
        const tr = document.createElement('tr')
        cell(tr, k.name, 'Name', 'strong-cell')
        cell(tr, shortKey(k.pubkeyHex), 'Public key', 'mono', k.pubkeyHex)
        cell(tr, formatShortTime(k.createdAt), 'Added', 'time-cell')

        const controls = document.createElement('td')
        controls.dataset.label = ''
        controls.className = 'controls'
        controls.appendChild(actionButton('✕', function() {
          deleteKey(k.id)
          renderKeys()
          refreshSignKeyOptions($('signPubkey') ? $('signPubkey').value : '')
          setStatus(`Deleted key ${k.name}`)
        }, 'icon-action danger', 'Delete key'))
        tr.appendChild(controls)

        table.appendChild(tr)
      }

      el.appendChild(table)
    }

    async function genKey() {
      const name = prompt('Name this action key', `Action key ${loadKeys().length + 1}`)
      if (name === null) return
      const k = await generateKey(name || undefined)
      renderKeys()
      refreshSignKeyOptions($('signPubkey') ? $('signPubkey').value : '')
      setStatus(`Generated ${k.name}`)
    }

    async function importKeyFlow() {
      const seed = prompt('Paste a 32-byte ed25519 seed (64 hex chars)')
      if (!seed) return
      const name = prompt('Name this imported key', 'Imported key')
      if (name === null) return
      const k = await importKey(name || undefined, seed)
      renderKeys()
      refreshSignKeyOptions($('signPubkey') ? $('signPubkey').value : '')
      setStatus(`Imported ${k.name}`)
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

      body.appendChild(sectionTitle('Approval package'))
      body.appendChild(kvGrid([
        ['Watch', `${e.watchRef || '-'} ${e.watchLabel || ''}`.trim()],
        ['Network', e.network || '-'],
        ['Strike', strikeDisplay(e)],
        ['Tx ID', e.txid || '-'],
        ['PCH', e.pch || '-'],
        ['Internal state', e.status || '-'],
        ['Check', e.check || '-'],
        ['Notes', e.summary || '-'],
        ['Mode', modeLabel(e.mode)]
      ]))

      body.appendChild(sectionTitle('Checks'))
      body.appendChild(renderChecks(e))

      if (e.decision) body.appendChild(renderDecisionDetail(e))

      const dbg = document.createElement('div')
      dbg.className = 'pro-only'
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
        const line = s.ok
          ? '✅ Approved and sent to KPool'
          : `✅ Approved and signed — send back ${s.error ? `failed (${s.error})` : `returned ${s.status || 'TBC'}`}`
        bar.appendChild(textNode(line, 'decision-headline'))
        bar.appendChild(textNode(`Signed with ${e.decision.sign?.keyName || 'action key'} · ${shortKey(e.decision.sign?.pubkeyHex)}`, 'decision-sub'))
        bar.appendChild(decisionReopen(e))
        return bar
      }

      if (e.decision?.decision === 'rejected') {
        bar.classList.add('bad-bg')
        bar.appendChild(textNode('🚫 Rejected', 'decision-headline'))
        bar.appendChild(textNode(e.decision.payload?.reason || 'Stored locally, not sent to KPool', 'decision-sub'))
        bar.appendChild(decisionReopen(e))
        return bar
      }

      if (eventIsReady(e)) {
        bar.classList.add('ready-bg')
        bar.appendChild(textNode('🔔 Ready to approve', 'decision-headline'))
        bar.appendChild(textNode('KEA checked the package and the promise matches the action.', 'decision-sub'))

        const actions = document.createElement('div')
        actions.className = 'approve-actions'
        actions.appendChild(actionButton('✅ Approve', function() {
          approveEvent(e).catch(function(err) { setStatus(`ERROR ${err.message}`, 'bad') })
        }, 'approve primary'))
        actions.appendChild(actionButton('🚫 Reject', function() { rejectEvent(e) }, 'reject'))
        actions.appendChild(actionButton('Not now', function() { openEvent = null; $('detailModal').close() }, 'quiet'))
        bar.appendChild(actions)
        return bar
      }

      bar.classList.add('muted-bg')
      const text = e.check === 'fail'
        ? `Not approvable — check failed: ${e.summary || 'unknown'}`
        : (e.check === 'not checked' ? 'Watch-only — no check performed' : 'Not ready to approve yet')
      bar.appendChild(textNode(text, 'decision-sub'))
      return bar
    }

    function decisionReopen(e) {
      const wrap = document.createElement('div')
      wrap.className = 'approve-actions pro-only'
      wrap.appendChild(actionButton('↩︎ Reopen', function() { reopenDecision(e) }, 'quiet'))
      return wrap
    }

    function renderDecisionDetail(e) {
      const wrap = document.createElement('div')
      wrap.appendChild(sectionTitle('Approval result'))

      if (e.decision.decision === 'approved') {
        const s = e.decision.submit || {}
        wrap.appendChild(kvGrid([
          ['Decision', 'Approved'],
          ['Signed at', e.decision.sign?.signedAt || '-'],
          ['Action key', e.decision.sign?.keyName || '-'],
          ['Key pubkey', shortKey(e.decision.sign?.pubkeyHex)],
          ['Signed over', e.decision.sign?.signedOver || '-'],
          ['Sent to', s.url || '-'],
          ['Send status', s.sent ? `${s.ok ? 'OK' : 'error'} ${s.status || ''}`.trim() : (s.error || 'not sent')]
        ]))
      } else {
        wrap.appendChild(kvGrid([
          ['Decision', 'Rejected'],
          ['Reason', e.decision.payload?.reason || '-'],
          ['Sent', 'No — reject endpoint TBC'],
          ['Recorded', formatShortTime(e.decision.at)]
        ]))
      }

      return wrap
    }

    function showJsonDetail(title, data) {
      openEvent = null
      $('detailModalTitle').textContent = title
      const body = $('detailModalBody')
      body.innerHTML = ''
      body.appendChild(jsonBlock(data))
      $('detailModal').showModal()
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

    function textNode(text, cls) {
      const div = document.createElement('div')
      if (cls) div.className = cls
      div.textContent = text
      return div
    }

    function kvGrid(items) {
      const grid = document.createElement('div')
      grid.className = 'grid'

      for (const item of items) {
        const div = document.createElement('div')
        div.className = 'kv'

        const label = document.createElement('div')
        label.className = 'kv-label'
        label.textContent = item[0]

        const value = document.createElement('div')
        value.className = 'kv-value'
        value.textContent = item[1]

        div.appendChild(label)
        div.appendChild(value)
        grid.appendChild(div)
      }

      return grid
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

    function setStatus(msg, cls) {
      const el = $('status')
      el.textContent = msg || 'Ready.'
      el.className = `status-line ${cls || ''}`
      console.debug('[KEA]', msg)
    }

    function watchRef(w) {
      return w?.ref ? `W${w.ref}` : 'W?'
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

    function modeLabel(mode) {
      if (mode === 'doorbell') return 'Watch'
      if (mode === 'sign') return 'Sign'
      return 'Check'
    }

    function statusClass(w) {
      if (w.paused) return 'warn'
      if (w.status === 'connected') return 'ok'
      if (w.status === 'error') return 'bad'
      return ''
    }

    function transactionStatus(e) {
      if (e.decision?.decision === 'approved') return { text: 'Approved', tone: 'ok' }
      if (e.decision?.decision === 'rejected') return { text: 'Rejected', tone: 'bad' }
      if (e.status === 'fetch error') return { text: 'Fetch failed', tone: 'bad' }
      if (e.check === 'fail') return { text: 'Check failed', tone: 'bad' }
      if (e.check === 'pass') return { text: 'Ready', tone: 'ok' }
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
        p.set('mode', 'doorbell')

        const url = new URL(location.href)
        url.search = p.toString()

        const watch = parseKatomiaQr(url.toString())
        watch.mode = 'doorbell'

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
      try { saveWatchFromForm() } catch (e) { setStatus(`ERROR ${e.message}`, 'bad') }
    }
    $('deleteWatchBtn').onclick = function() { deleteEditingWatch() }
    $('watchModalCloseBtn').onclick = function() { closeWatchModal() }
    $('detailModalCloseBtn').onclick = function() { openEvent = null; $('detailModal').close() }

    $('proToggle').onchange = function(e) { applyProMode(e.target.checked) }
    $('keysBtn').onclick = function() { openKeysModal() }
    $('keysModalCloseBtn').onclick = function() { $('keysModal').close() }
    $('genKeyBtn').onclick = function() { genKey().catch(function(e) { setStatus(`ERROR ${e.message}`, 'bad') }) }
    $('importKeyBtn').onclick = function() { importKeyFlow().catch(function(e) { setStatus(`ERROR ${e.message}`, 'bad') }) }

    loadPro()
    applyProMode(isPro)
    loadDecisions()
    loadWatches()
    ensureDummyKey().catch(function(e) { console.warn('key seed failed', e.message) })
    renderWatches()
    renderEvents()
    addWatchFromUrlParams()
    connectAllWatches()
    
    