// katui router — serve the board shell for the dynamic /m/katomia/board/<id>
// route WITHOUT redirecting (so location.pathname keeps the gameId for the
// client's getGameId()). Everything else is served straight from static assets.
const BOARD = /^\/m\/katomia\/board(\/[^/]+)?\/?$/;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (BOARD.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/board.html', url), request));
    }
    return env.ASSETS.fetch(request);
  }
};
