## 🧺 Multi-Asset Atomic Swap Pricing Demo — Overview

This demo explores **how prices can emerge from real swaps**, rather than being predefined by pools or oracles. It’s designed as a **playful module** inside a larger experiment where people create **multi-party, multi-asset atomic swaps** and get feedback about whether their offers are roughly fair.

The goal isn’t to impose a rigid trading model — it’s to **help humans and eventually AI agents explore a complex trading space** where baskets of assets move between many parties at once.

------

# 🎮 Core idea

Participants create **atomic swap baskets** like:

```
Alice:  +1 APPLE, -6 HBAR
Carol:  -1 APPLE, +6 HBAR
```

or even more complex multi-party exchanges.

The system then estimates **market prices and fairness signals** from observed swaps and oracle hints.

This lets players answer questions like:

- 🍌 “Am I offering enough bananas for apples?”
- 💰 “Is this trade good or bad for me?”
- ⚖️ “What would make this swap fair?”

------

# 🧠 Key mechanisms in the demo

### 1️⃣ Global price vector

Each asset gets a **single market price relative to an anchor**:

```
APPLE = 1.52
HBAR  = 0.015
BANANA = 0.23
```

These prices are **inferred from swap activity**, not imposed.

------

### 2️⃣ Basket equilibrium rule

Every swap provides a constraint:

```
Σ(amount × price) ≈ 0
```

Meaning:

> The market value of what you give should equal what you receive.

This is the same equilibrium condition used in **Walrasian economics**.

------

### 3️⃣ Continuous price learning

Prices adjust gradually as new swaps arrive.

Conceptually:

```
swap imbalance → price adjustment
```

This is similar to **Walrasian tâtonnement** (price discovery through imbalance).

------

### 4️⃣ Trade scoring

For any participant (e.g., Alice) the system calculates:

| Metric   | Meaning                              |
| -------- | ------------------------------------ |
| value    | profit/loss at current market prices |
| notional | total size of the trade              |
| score    | normalized fairness indicator        |

Example:

```
value = +1.43
notional = 1.61
score = 0.8879
```

Meaning:

> Alice captures ~89% of the trade value.

------

### 5️⃣ Fairness suggestion

The system can propose how to make a trade fair.

Example:

```
Alice pays:    6 HBAR
Alice receives 1 APPLE
```

Market says fair would be:

```
Alice receives 0.0594 APPLE
```

So the UI shows:

```
Δrecv = -0.9406 APPLE
```

This nudges players toward **market-aligned trades**.

------

# 🌍 Interesting conceptual parallels

### 🧮 Walrasian markets

Inspired by the work of
**Léon Walras**

Key idea:

```
Σ(q × p) = 0
```

Markets clear when total value balances.

Your demo effectively performs **Walrasian price discovery from observed trades**.

------

### 🦄 DeFi design ideas

Systems like
**Uniswap v4**

treat swaps as programmable events with extensible logic.

While Uniswap prices assets using **liquidity pools**, this demo instead derives prices from **swap observations**.

------

### 🌐 Currency graph intuition

Every swap reveals an **exchange ratio**.

Over time, these ratios form a **graph of assets**, and the solver estimates the global price vector that best fits all observed trades.

This is similar to how **FX markets implicitly determine cross-currency prices**.

------

# 🎯 What this demo is really about

This is **not a finished trading system**.

It’s a **sandbox for discovery**.

It explores what happens when:

- 🧺 trades involve **multiple assets**
- 👥 trades involve **multiple parties**
- 🤖 future agents may negotiate and construct baskets automatically

Instead of humans thinking only in simple pairs like:

```
APPLE / USD
```

we move toward **multi-dimensional exchanges** like:

```
APPLES + BANANAS + HBAR
    ↔
CARROTS + USDC
```

------

# 🧪 Why this matters

As Web3 platforms like
**Hedera Hashgraph**
support **native atomic multi-asset swaps**, it becomes possible to experiment with richer trading structures.

This demo is an early step toward:

- 🎲 playful economic games
- 🧠 AI-assisted trading agents
- 🌐 multi-asset market discovery
- ⚖️ decentralized price inference

------

# 🚀 The spirit of the project

This isn’t about enforcing prices.

It’s about **helping markets discover them**.

Players propose baskets, the system offers feedback, and the ecosystem gradually learns:

> *What is a banana worth in apples today?* 🍌🍎

And eventually:

> *What combinations of assets best satisfy everyone’s needs?*
