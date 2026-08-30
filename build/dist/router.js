// katui router. Mirrors lab22's board .htaccess:
//  · /m/katomia/board(/<id>)      → the board.html shell (URL kept, so getGameId() reads <id>)
//  · /m/katomia/board/<id>/<file> → the sibling asset /m/katomia/<file>
//    (board.html uses RELATIVE asset paths, which resolve under /board/<id>/ in the browser)
const PAGE  = /^\/m\/katomia\/board(\/[^/.]+)?\/?$/;          // last segment has no dot = a game id
const ASSET = /^\/m\/katomia\/board\/[^/]+\/(.+\.[^/]+)$/;    // deeper path ending in <name>.<ext> = an asset
export default {
  async fetch(request, env) {
    const url = new URL(request.url); let m;
    if ((m = url.pathname.match(ASSET)))
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/' + m[1] + url.search, url), request));
    if (PAGE.test(url.pathname))
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/board.html', url), request));
    return env.ASSETS.fetch(request);
  }
};
