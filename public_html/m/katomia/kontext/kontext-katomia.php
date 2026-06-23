<?php

date_default_timezone_set('UTC');

$ip=preg_replace('/[^a-zA-Z0-9._-]/','_',$_SERVER['REMOTE_ADDR'] ?? 'unknown');
$logFile=__DIR__.'/context_'.$ip.'.log';

file_put_contents($logFile,date('Y-m-d H:i:s')."\n".json_encode($_SERVER,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n\n----------------------\n\n",FILE_APPEND);


$domain = 'swap.kpay.live';

$sources=[
// 'backend js'=>['/home/hbarlive_hts/web*.js'],
'backend js'=>['/home/hbarlive_hts/{kat,kpool,deal,websocket}*.js'],
// 'kbot'=>['/home/hbarlive_hts/kbot/swarms/*.js'],  //nope - just zip it
'KEA webapp'=>["/var/www/$domain/public_html/m/katomia/KEA/*.{html,js,css}"],
'frontend katomia'=>["/var/www/$domain/public_html/m/katomia/*.{html,js,css,php}"],
'frontend kpay widget'=>["/var/www/$domain/public_html/vendor/kpay/kpool_widget/*.{html,js,css,php}"],
'og signing page'=>["/var/www/$domain/public_html/future/*.{html,js,css,php}"]
];

$exclude=['zz*', '*.min.js','*bundle*','*node_modules*','*context_*','*log*'];

function isExcluded($file,$exclude){

  foreach($exclude as $pattern) if(fnmatch($pattern,basename($file))) return true;

  return false;

}

function expandPatterns($patterns,$exclude){

  $files=[];

  foreach($patterns as $pattern){

    // foreach(glob($pattern)?:[] as $file){
    foreach(glob($pattern,GLOB_BRACE)?:[] as $file){

      if(!is_file($file)) continue;
      if(isExcluded($file,$exclude)) continue;

      $files[]=realpath($file);

    }

  }

  sort($files);

  return array_unique($files);

}

$all=[];

foreach($sources as $group=>$patterns) $all[$group]=expandPatterns($patterns,$exclude);

if(isset($_GET['json'])){

  $out=[];

  foreach($all as $group=>$files){

    foreach($files as $file){

      $out[$group][]=[
      'name'=>basename($file),
      'hash'=>substr(md5_file($file),0,8),
      'mtime'=>filemtime($file),
      'modified'=>date('Y-m-d H:i:s',filemtime($file)),
      'path'=>$file,
      'url'=>'?file='.urlencode(base64_encode($file))
      ];

    }

  }

  header('Content-Type:application/json');
  echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
  exit;

}

if(isset($_GET['file'])){

  $requested=realpath(base64_decode($_GET['file']));
  $allowed=[];

  foreach($all as $files) $allowed=array_merge($allowed,$files);

  if(!$requested || !in_array($requested,$allowed)){
    http_response_code(404);
    exit('not found');
  }

  header('Content-Type:text/plain');
  readfile($requested);
  exit;

}

$fileData=[];

foreach($all as $group=>$files){

  foreach($files as $file){

    $fileData[]=[
    'group'=>$group,
    'name'=>basename($file),
    'hash'=>substr(md5_file($file),0,8),
    'modified'=>date('Y-m-d H:i:s',filemtime($file)),
    'path'=>$file,
    'content'=>file_get_contents($file)
    ];

  }

}

?>

<!doctype html>
<html>
<head>

<meta charset="utf-8">

<title>Kontext</title>

<style>

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

body{
  font-family:'Inter',sans-serif;
  margin:20px;
}

.toolbar{margin-bottom:20px;}

.group{margin-bottom:18px;}

.group h3{
  margin:0 0 6px 0;
  font-size:16px;
  font-weight:600;
}

.group h3 label{
  cursor:pointer;
}

.file{padding:4px 0;}

.hash{font-size:12px;color:#666;}
button{margin-right:8px;}
.status{margin-left:10px;color:#666;font-size:12px;}
#preview{width:100%;height:500px;margin-top:20px;font-family:monospace;display:none;}

.zipOption{
  font-size:13px;
  margin-right:8px;
  white-space:nowrap;
}
</style>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
</head>

<body>

<h2>Kontext</h2>

<div class="toolbar">
<button onclick="selectAll()">Select all</button>
<button onclick="selectNone()">Select none</button>
<button onclick="buildContext()">Copy to clipboard as text</button>
<button onclick="buildContextZIPbase64()">Copy to clipboard as base64 zip data</button>
<button onclick="buildContextZIP()">Save zip file</button>
<label class="zipOption">
  <input type="checkbox" id="zipBySource">
  group by source
</label>


<span id="status" class="status"></span>
</div>

<?php foreach($all as $group=>$files){ ?>

<div class="group">

<h3>
  <label>
    <input type="checkbox" class="ctxGroup" data-group="<?=htmlspecialchars($group)?>">
    <?=$group?>
  </label>
</h3>

<?php foreach($files as $file){

$name=basename($file);
$hash=substr(md5_file($file),0,8);
$mtime=date('Y-m-d H:i:s',filemtime($file));
$chars=filesize($file);
$lines=count(file($file));
$id=base64_encode($file);

?>

<div class="file">

<label>

<input type="checkbox" class="ctxFile" data-group="<?=htmlspecialchars($group)?>" data-path="<?=htmlspecialchars($file)?>" value="<?=htmlspecialchars($name)?>" checked>

<a href="?file=<?=urlencode($id)?>" target="_blank"><?=$name?></a>

<span class="hash">[<?=$hash?>] [<?=$lines?> lines] [<?=$chars?> chars] [<?=$mtime?>]</span>

</label>

</div>

<?php } ?>

</div>

<?php } ?>



<textarea id="preview"></textarea>

<script>

const files=<?=json_encode(
  $fileData,
  JSON_UNESCAPED_SLASHES|
  JSON_UNESCAPED_UNICODE|
  JSON_HEX_TAG|
  JSON_HEX_AMP|
  JSON_HEX_APOS|
  JSON_HEX_QUOT
)?>;

let generated="";

function selectAll(){
  document.querySelectorAll(".ctxFile").forEach(x=>x.checked=true)
  updateGroupChecks()
}

function selectNone(){
  document.querySelectorAll(".ctxFile").forEach(x=>x.checked=false)
  updateGroupChecks()
}

function getGroupFiles(group){
  return [...document.querySelectorAll(`.ctxFile[data-group="${CSS.escape(group)}"]`)]
}

function updateGroupChecks(){
  document.querySelectorAll(".ctxGroup").forEach(groupBox=>{
    const group=groupBox.dataset.group
    const boxes=getGroupFiles(group)
    const checked=boxes.filter(x=>x.checked).length

    groupBox.checked=checked===boxes.length
    groupBox.indeterminate=checked>0 && checked<boxes.length
  })
}

document.addEventListener("change",e=>{
  if(e.target.classList.contains("ctxFile")) updateGroupChecks()


  if(e.target.classList.contains("ctxGroup")){
    const group=e.target.dataset.group
    const boxes=getGroupFiles(group)

    const makeChecked=
      e.target.indeterminate ||
      e.target.checked

    boxes.forEach(x=>x.checked=makeChecked)

    updateGroupChecks()
  }

})

document.addEventListener("DOMContentLoaded",updateGroupChecks)


function getSelectedFiles(){

  const selected=new Set(
    [...document.querySelectorAll(".ctxFile:checked")]
      .map(x=>x.dataset.path)
  )

  return files.filter(f=>selected.has(f.path))
}


function updateStatus(msg){
  document.getElementById("status").innerText=msg
}


async function buildContext(){

  generated=""

  const selectedFiles=getSelectedFiles()

  selectedFiles.forEach(f=>{

    generated+=`// ====================================================
// FILE: ${f.name}
// HASH: ${f.hash}
// MODIFIED: ${f.modified}
// PATH: ${f.path}
// ====================================================

${f.content}


// END ${f.name}


`

  })

  const preview=document.getElementById("preview")

  preview.value=generated
  preview.style.display="block"

  await navigator.clipboard.writeText(generated)

  const lines=generated.split('\n').length

  updateStatus(
    "✓ Copied text | "+
    generated.length+
    " chars | "+
    lines+
    " lines"
  )

}



function zipSafeName(s){
  return String(s)
    .replace(/[<>:"\\|?*\x00-\x1F]/g,"_")
    .replace(/\.\.+/g,".")
    .replace(/^\/+|\/+$/g,"")
    .trim() || "source"
}

function getZipPath(f){
  const bySource=document.getElementById("zipBySource")?.checked

  if(!bySource) return zipSafeName(f.name)

  return `${zipSafeName(f.group)}/${zipSafeName(f.name)}`
}

async function buildContextZIPbase64(){

  try{

    const selectedFiles=getSelectedFiles()

    const zip=new JSZip()

    selectedFiles.forEach(f => {

      zip.file(getZipPath(f),f.content)

    })

    const zipBase64=await zip.generateAsync({
      type:"base64",
      compression:"DEFLATE"
    })

    const payload=
`---BEGIN KATOMIA ZIP---
${zipBase64}
---END KATOMIA ZIP---`

    await navigator.clipboard.writeText(payload)

    const preview=document.getElementById("preview")

    preview.value=selectedFiles
      .map(f=>getZipPath(f))
      .join('\n')

    preview.style.display="block"

    updateStatus(
      "✓ ZIP copied as base64 | "+
      selectedFiles.length+
      " files | "+
      payload.length+
      " chars"
    )

  }catch(e){

    console.error(e)

    updateStatus(
      "✗ ZIP build failed"
    )

  }

}


async function buildContextZIP(){

  try{

    const selectedFiles=getSelectedFiles()

    const zip=new JSZip()

    selectedFiles.forEach(f=>{

      zip.file(getZipPath(f),f.content)

    })

    const blob=await zip.generateAsync({
      type:"blob",
      compression:"DEFLATE"
    })

    const preview=document.getElementById("preview")

    preview.value=
      selectedFiles
      .map(f=>getZipPath(f))
      .join('\n')

    preview.style.display="block"

    try{

      await navigator.clipboard.write([
        new ClipboardItem({
          "application/zip":blob
        })
      ])

      updateStatus(
        "✓ ZIP copied | "+
        selectedFiles.length+
        " files"
      )

    }catch(e){

      const a=document.createElement("a")

      a.href=URL.createObjectURL(blob)
      a.download="katomia-context.zip"
      a.click()

      updateStatus(
        "✓ ZIP downloaded | "+
        selectedFiles.length+
        " files"
      )

    }

  }catch(e){

    console.error(e)

    updateStatus(
      "✗ ZIP failed"
    )

  }

}

</script>

</body>
</html>