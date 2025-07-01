<!DOCTYPE html>
<html>
<head>
  <title>KPool Demo</title>
</head>
<body>
  <h1>KPool JSON Output</h1>
  <p>placeholder first step in grabbing future dated tx</p>
  <p>placeholder first step in grabbing future dated tx</p>
  <pre id="output">Loading...</pre>

  <script>
    fetch('kpool')
      .then(res => res.json())
      .then(data => {
        document.getElementById('output').textContent = JSON.stringify(data, null, 2)
      })
      .catch(err => {
        document.getElementById('output').textContent = 'Error: ' + err
      })
  </script>
</body>
</html>
