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
      
    const db = new Localbase('kpool')

    async function updateTxList(network) {
      try {
        const res = await fetch('kpool')
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


  </script>
</body>
</html>
