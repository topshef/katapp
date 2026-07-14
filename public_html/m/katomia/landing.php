<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
$siteConfig = katomiaSiteConfig();
$landing = $siteConfig['landing'] ?? [];
$title = $landing['title'] ?? 'Katomia';
$tagline = $landing['tagline'] ?? '';
$curatedGames = $landing['curatedGames'] ?? [];
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
<style>
  /* KATOMIA-LANDING1: intentionally tiny — a hand-picked jumping-off point,
     not a second games list (that's contents.php's job, reachable from here
     via the "See all markets" link). No grid/table chrome to inherit. */
  .landing-wrap{ max-width: 480px; margin: 32px auto; padding: 0 16px; }
  .landing-tagline{ color: #666; margin: 0 0 24px; }
  .landing-list{ display: flex; flex-direction: column; gap: 10px; }
  .landing-card{
    display: block; padding: 16px; border-radius: 10px;
    background: #fff; border: 1px solid #e5e0d4; text-decoration: none;
    color: inherit; box-shadow: 0 1px 3px rgba(0,0,0,.05);
  }
  .landing-card:hover{ border-color: #c9c2b3; }
  .landing-card-label{ font-weight: 600; }
  .landing-card-net{ font-size: 12px; color: #888; margin-top: 2px; }
  .landing-more{ margin-top: 24px; font-size: 14px; }
  .landing-empty{ color: #888; font-style: italic; }
</style>
</head>
<body>
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="landing-wrap">
  <?php if ($tagline): ?><p class="landing-tagline"><?= htmlspecialchars($tagline, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>

  <div class="landing-list">
    <?php if (!$curatedGames): ?>
      <p class="landing-empty">No curated games configured yet — see site-config.json.</p>
    <?php endif; ?>
    <?php foreach ($curatedGames as $g):
      $id = $g['id'] ?? '';
      if (!$id) continue;
      $label = $g['label'] ?? $id;
      $network = $g['network'] ?? '';
    ?>
      <a class="landing-card" href="/m/katomia/board/<?= rawurlencode($id) ?>">
        <div class="landing-card-label"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></div>
        <?php if ($network): ?><div class="landing-card-net"><?= htmlspecialchars($network, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </div>

  <p class="landing-more"><a href="/m/katomia/">See all markets →</a></p>
</div>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
</body>
</html>
