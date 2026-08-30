// katui router. Mirrors lab22's board .htaccess sibling rule:
//  · /m/katomia/board/<id>            → board.html shell (URL kept → getGameId() reads <id>)
//  · /m/katomia/board/<anything>.<ext> → /m/katomia/<anything>.<ext>
//    (board.html uses RELATIVE asset paths; under /board/<id> the browser resolves them
//     against /m/katomia/board/, so they must be rewritten back to the /m/katomia/ siblings)
const ASSET = /^\/m\/katomia\/board\/(.+\.[^/]+)$/;   // anything after board/ ending in .ext
const PAGE  = /^\/m\/katomia\/board(\/[^/.]+)?\/?$/;  // board, or board/<id> (no dot)
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
