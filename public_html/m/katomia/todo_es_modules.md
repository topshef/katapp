



Good instinct. Your current structure spreads **state + logic + DOM + network** everywhere, which is why modules explode into tons of imports.

The clean pattern is:

**One shared state module.  
Everything else reads/writes that.**

Then each module only imports **state + a few functions**, not 20 variables.

---

# Clean architecture

```
state.js
helpers.js
render.js
network.js
app.js
```

Only **state.js** owns mutable state.

---

# 1️⃣ state.js (single source of truth)

```js
export const state = {
  gameId: null,
  socket: null,
  game: null,
  data: null,
  currentPlayerId: null,

  viewMode: window.innerWidth < 700 ? "merged" : "columns",
  showActiveOnly: false,

  selectedAssetId: null,
  selectedFromAccountId: null,
  selectedFromBasketToAccountId: null
}

export const dom = {
  accountLabelInput: document.getElementById("accountLabelInput"),
  addAccountBtn: document.getElementById("addAccountBtn"),
  viewToggle: document.getElementById("viewToggle"),
  activeOnlyCheckbox: document.getElementById("activeOnly"),
  headerEl: document.getElementById("header"),
  gameEl: document.getElementById("game")
}
```

Now everyone imports **one thing**:

```js
import { state, dom } from "./state.js"
```

---

# 2️⃣ helpers.js

```js
import { state } from "./state.js"

export function clearSelection(){
  state.selectedAssetId = null
  state.selectedFromAccountId = null
  state.selectedFromBasketToAccountId = null
}
```

No giant import list.

---

# 3️⃣ render.js

```js
import { state, dom } from "./state.js"
import { getAccounts } from "./helpers.js"
```

Then inside render:

```js
dom.gameEl.innerHTML = ""
```

---

# 4️⃣ network.js

```js
import { state, dom } from "./state.js"
import { render } from "./render.js"
```

Example:

```js
state.socket = new WebSocket(url)
```

---

# 5️⃣ app.js (bootstrap)

```js
import "./state.js"
import "./helpers.js"
import "./render.js"
import "./network.js"
```

---

# Result

Instead of this nightmare:

```
import { state, game, socket, viewMode, showActiveOnly, selectedAssetId... }
```

You get:

```
import { state, dom }
```

Huge reduction in complexity.

---

# Dependency graph becomes simple

```
state
 ↑
helpers
 ↑
render
 ↑
network
 ↑
app
```

No circular imports.

---

# Why this works well

You currently treat the app like a **mutable game engine**, which is correct.

So putting all mutable things in one object (`state`) matches the architecture naturally.

---

# If you want

I can also show you a **10-minute refactor of your exact files** that converts your current project to this architecture with **minimal code movement (≈40 lines changed)** instead of rewriting everything.



| File                   | EXPORT these                                                                                                                                                                                                                                                                                                                             | IMPORT these                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **katomia-core.js**    | `gameId`, `socket`, `currentPlayerId`, `state`, `game`, `viewMode`, `showActiveOnly`, `selectedAssetId`, `selectedFromAccountId`, `selectedFromBasketToAccountId`, `accountLabelInput`, `addAccountBtn`, `viewToggle`, `activeOnlyCheckbox`, `headerEl`, `gameEl`, `getOrCreatePlayerToken`, `offerSelectedToAccount`, `setupDropTarget` | *(none)*                                                                                                                                                                                                                                                                                                                                                               |
| **katomia-helpers.js** | `getPlayerColour`, `applyOwnerSleeve`, `applyHoverHighlight`, `clearSelection`, `isSelected`, `setSelectedAsset`, `getAccounts`, `getAccountMap`, `getFromAccountId`, `isMyAccount`, `buildReservedByAccount`, `highlightAssetsForAccount`, `highlightTradePair`, `clearTradeLine`, `drawTradeLine`, `getVisibleAccounts`                | from **core:** `state`, `currentPlayerId`, `gameEl`, `selectedAssetId`, `selectedFromAccountId`, `selectedFromBasketToAccountId`, `showActiveOnly`                                                                                                                                                                                                                     |
| **katomia-render.js**  | `render`, `makeAssetEl`                                                                                                                                                                                                                                                                                                                  | from **core:** `state`, `game`, `viewMode`, `headerEl`, `gameEl`, `setupDropTarget`, `socket`, `gameId` from **helpers:** `applyOwnerSleeve`, `isSelected`, `setSelectedAsset`, `getAccounts`, `getAccountMap`, `getFromAccountId`, `isMyAccount`, `buildReservedByAccount`, `highlightAssetsForAccount`, `highlightTradePair`, `getVisibleAccounts`, `clearSelection` |
| **katomia-network.js** | `connect`, `exitGame`                                                                                                                                                                                                                                                                                                                    | from **core:** `gameId`, `socket`, `state`, `game`, `currentPlayerId`, `viewMode`, `showActiveOnly`, `accountLabelInput`, `addAccountBtn`, `viewToggle`, `activeOnlyCheckbox`, `gameEl`, `getOrCreatePlayerToken` from **helpers:** `clearSelection` from **render:** `render`                                                                                         |
| **katomia-app.js**     | *(nothing)*                                                                                                                                                                                                                                                                                                                              | `connect` from **katomia-network.js**                                                                                                                                                                                                                                                                                                                                  |
