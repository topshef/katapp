<!DOCTYPE html>
<html>
<head>
  <title>KPool Demo</title>
  <script src="https://unpkg.com/localbase/dist/localbase.dev.js"></script>

</head>
<body>
  <h1>KPool JSON Output</h1>
  <p>placeholder first step in grabbing future dated tx</p>
  <p>placeholder first step in grabbing future dated tx</p>
  <pre id="output">Loading...</pre>

  <script>

    const RETENTION_DAYS = 14
    const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60
    const MIN_RECORDS_TO_KEEP = 20

      
    const db = new Localbase('kpool')

    async function updateTxList(network) {
      try {
        const res = await fetch('kpool' + window.location.search)  // todo review.. no sanitizing here
        const data = await res.json()
        if (!data.success || !data.result) throw 'Invalid data structure'

        const entries = [...(data.result.tx || []), ...(data.result.sig || [])]

        for (const entry of entries) {
          if (entry.network !== network) continue
          const key = `${entry.network};${entry.txid};${entry.pch}`
          const exists = await db.collection('tx').doc({ id: key }).get()
          if (!exists)
            await db.collection('tx').add({ id: key, ...entry })
        }

        document.getElementById('output').textContent = `Stored ${entries.length} entries (deduplicated)`
      } catch (err) {
        document.getElementById('output').textContent = 'Error: ' + err
      }
    }
      

    ;(async () => {
      await updateTxList('mainnet')
      await purgeOldTx('mainnet')
      await getTx('mainnet')
    })()


    async function getTx(network) {
      try {
        const allTx = await db.collection('tx').get()
        const filtered = allTx.filter(e => e.network === network && e.type === 'tx')
        document.getElementById('output').textContent = JSON.stringify(filtered, null, 2)
      } catch (err) {
        document.getElementById('output').textContent = 'Error: ' + err
      }
    }


    function txEpochFromTxid(txid) {
      const at = txid.indexOf('@')
      if (at === -1) return null
      return Number(txid.slice(at + 1).split('.')[0])
    }

    async function purgeOldTx(network) {
      const now = Math.floor(Date.now() / 1000)
      const cutoff = now - RETENTION_SECONDS

      const allTx = await db.collection('tx').get()

      const scoped = allTx
        .filter(e => e.network === network && e.txid)
        .map(e => ({
          ...e,
          epoch: txEpochFromTxid(e.txid)
        }))
        .filter(e => e.epoch)

      scoped.sort((a, b) => b.epoch - a.epoch)

      const keepIds = new Set(
        scoped.slice(0, MIN_RECORDS_TO_KEEP).map(e => e.id)
      )

      for (const e of scoped.slice(MIN_RECORDS_TO_KEEP)) {
        if (e.epoch < cutoff && !keepIds.has(e.id))
          await db.collection('tx').doc({ id: e.id }).delete()
      }
    }



  </script>
</body>
</html>
