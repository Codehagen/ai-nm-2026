# Grocery Bot Challenge

## What is this?

The Grocery Bot is one of four tasks in NM i AI 2026. Build a bot that controls agents via WebSocket to navigate a grocery store, pick up items, and deliver orders.

- **Task type**: Real-time game (WebSocket)
- **Platform**: [app.ainm.no](https://app.ainm.no)
- **Weight**: 25% of total score
- **Status**: WARM-UP — live now (pre-competition)

## How It Works

1. **Pick a map** from the 21 available maps on the Challenge page
2. **Get a WebSocket URL** — click Play to get a game token
3. **Connect your bot** to the WebSocket URL
4. **Receive game state** each round as JSON
5. **Respond with actions** — one per bot (move, pickup, dropoff, or wait)
6. **Best score per map** is saved automatically. Leaderboard = sum of all 21 best scores.

## Difficulty Levels

Bot count and grid size increase with difficulty:

| Level | Bots | Grid | Maps | Rounds | Time Limit |
|-------|------|------|------|--------|------------|
| Easy | 1 | 12×10 | 5 | 300 | 2 min |
| Medium | 3 | 16×12 | 5 | 300 | 2 min |
| Hard | 5 | 22×14 | 5 | 300 | 2 min |
| Expert | 10 | 28×18 | 5 | 300 | 2 min |
| Nightmare | 20 | 30×18 | 1 | 500 | 5 min |

Nightmare features 3 drop-off zones instead of 1.

## Key Features

- **WebSocket** — you connect to the game server, not the other way around
- **No fog of war** — full map visible from round 1
- **Bot collision** — bots block each other (no two on same tile, except spawn)
- **Infinite orders** — orders keep generating, rounds are the only limit
- **Daily rotation** — item placement and orders change daily to prevent hardcoding
- **Deterministic within a day** — same map + same day = same game every time

---

# Game Mechanics

## Concept

You control bots navigating a grocery store to fulfill orders sequentially. Pick up items from shelves, deliver them to the drop-off zone, complete orders one at a time for bonus points. Bot count scales by difficulty.

## Store Layout

The store is a rectangular grid with border walls:

- **Floor** (`.`) — walkable cells
- **Walls** (`#`) — impassable barriers (borders + aisle walls)
- **Shelves** — contain items, not walkable. Pick up by standing adjacent.
- **Drop-off** (`D`) — where you deliver items, also walkable

Stores have parallel vertical aisles (shelf-walkway-shelf, 3 cells wide), connected by horizontal corridors at top, bottom, and mid-height.

## Game Flow

1. All bots start at bottom-right of the store (inside border)
2. Each round, your bot receives the full game state via WebSocket
3. You respond with actions for each bot
4. The game runs for **300 rounds** maximum
5. Wall-clock limit: **120 seconds** per game

## Bots

- **Bot count varies** by difficulty (1, 3, 5, 10, or 20)
- **Inventory capacity**: 3 items per bot
- **Collision**: bots block each other — no two bots can occupy the same tile. Actions resolve in bot ID order (lower IDs move first). Spawn tile is exempt so bots can start stacked.
- **Full visibility**: all items on all shelves are always visible

## Sequential Orders (Infinite)

Orders are revealed **one at a time** and keep generating indefinitely:

- **Active order**: the current order you must complete. Full details visible. You can deliver items for this order.
- **Preview order**: the next order. Full details visible. You CANNOT deliver items for it yet, but you can pre-pick items.
- **Hidden orders**: all remaining orders are not shown.
- **Infinite**: when you complete an order, a new one appears. Orders never run out. Rounds are the only limit.

When the active order is completed:
- The preview order becomes active
- A new order becomes the preview
- Any items in bot inventories that match the new active order are auto-delivered

### Pickup rules
- Bots can pick up **any item** from any shelf, regardless of which order needs it
- Bad picks waste inventory slots — choose wisely

### Dropoff rules
- Only the **active order** can be delivered to
- Items matching the active order are consumed; non-matching items **stay in inventory**
- When the active order completes, the next order activates immediately and remaining items are re-checked

### Order sizes

| Level | Items per Order |
|-------|----------------|
| Easy | 3-4 |
| Medium | 3-5 |
| Hard | 3-5 |
| Expert | 4-6 |
| Nightmare | 4-7 |

## Actions

Each bot can perform one action per round:

| Action | Description |
|--------|-------------|
| `move_up` | Move one cell up |
| `move_down` | Move one cell down |
| `move_left` | Move one cell left |
| `move_right` | Move one cell right |
| `pick_up` | Pick up an item from adjacent shelf (requires `item_id`) |
| `drop_off` | Deliver matching inventory at the drop-off zone |
| `wait` | Do nothing |

Invalid actions are treated as `wait` — no penalty, no error.

## Key Constraints

- **300 rounds** — plan carefully, every round counts
- **3 items per bot** inventory capacity
- **Sequential orders** — complete one before the next activates
- **Infinite orders** — rounds are the only limit
- **No fog of war** — full map visible every round
- **Deterministic per day** — same game every run within a day
- **60s cooldown** between games, max **40/hour** and **300/day** per team
- **Disconnect = game over** — score what you have, no reconnect

---

# WebSocket Protocol Specification

## Connection

Connect via WebSocket to the URL provided when you request a game token:

```
wss://game.ainm.no/ws?token=<jwt_token>
```

Get a token by clicking "Play" on a map at app.ainm.no/challenge, or by calling the `request_game(map_id)` MCP tool.

## Message Flow

```
Server → Client: {"type": "game_state", ...}     (round 0)
Client → Server: {"actions": [...]}
Server → Client: {"type": "game_state", ...}     (round 1)
Client → Server: {"actions": [...]}
...
Server → Client: {"type": "game_over", ...}       (final)
```

## Game State Message

```json
{
  "type": "game_state",
  "round": 42,
  "max_rounds": 300,
  "action_status": "ok",
  "grid": {
    "width": 14,
    "height": 10,
    "walls": [[1,1], [1,2], [3,1]]
  },
  "bots": [
    {"id": 0, "position": [3, 7], "inventory": ["milk"]},
    {"id": 1, "position": [5, 3], "inventory": []},
    {"id": 2, "position": [10, 7], "inventory": ["bread", "eggs"]}
  ],
  "items": [
    {"id": "item_0", "type": "milk", "position": [2, 1]},
    {"id": "item_1", "type": "bread", "position": [4, 1]}
  ],
  "orders": [
    {
      "id": "order_0",
      "items_required": ["milk", "bread", "eggs"],
      "items_delivered": ["milk"],
      "complete": false,
      "status": "active"
    },
    {
      "id": "order_1",
      "items_required": ["cheese", "butter", "pasta"],
      "items_delivered": [],
      "complete": false,
      "status": "preview"
    }
  ],
  "drop_off": [6, 9],
  "score": 12,
  "active_order_index": 0,
  "total_orders": 8
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `round` | int | Current round number (0-indexed) |
| `max_rounds` | int | Maximum rounds (300, or 500 for Nightmare) |
| `action_status` | string | Result of your last action: `"ok"`, `"timeout"`, or `"error"` |
| `grid.width` | int | Grid width in cells |
| `grid.height` | int | Grid height in cells |
| `grid.walls` | int[][] | List of [x, y] wall positions |
| `bots` | object[] | All bots with id, position [x,y], and inventory |
| `items` | object[] | All items on shelves with id, type, and position [x,y] |
| `orders` | object[] | Only active + preview orders (max 2). Each has `status`: `"active"` or `"preview"` |
| `drop_off` | int[] | [x, y] position of the drop-off zone (Easy-Expert) |
| `drop_off_zones` | int[][] | Array of [x, y] positions (Nightmare only, 3 zones) |
| `score` | int | Current score |
| `active_order_index` | int | Index of the current active order |
| `total_orders` | int | Total number of orders in the game |

### `action_status`

| Value | Meaning |
|-------|---------|
| `"ok"` | Your actions were received and applied normally |
| `"timeout"` | Your bot didn't respond within the 2-second window |
| `"error"` | Your message was received but couldn't be parsed |

## Bot Response

Send within **2 seconds** of receiving the game state:

```json
{
  "actions": [
    {"bot": 0, "action": "move_up"},
    {"bot": 1, "action": "pick_up", "item_id": "item_3"},
    {"bot": 2, "action": "drop_off"}
  ]
}
```

### Optional `round` Field

Include `"round": 42` to guard against desync. If it doesn't match the server's round, actions are rejected.

### Actions

| Action | Extra Fields | Description |
|--------|-------------|-------------|
| `move_up` | — | Move one cell up (y-1) |
| `move_down` | — | Move one cell down (y+1) |
| `move_left` | — | Move one cell left (x-1) |
| `move_right` | — | Move one cell right (x+1) |
| `pick_up` | `item_id` | Pick up item from adjacent shelf |
| `drop_off` | — | Deliver matching items to active order at drop-off zone |
| `wait` | — | Do nothing |

### Move Rules

- Moves to walls, shelves, or out-of-bounds cells fail silently (treated as `wait`)
- Moves to a cell occupied by another bot fail silently (`blocked_by_bot`)
- Actions resolve in **bot ID order** — bot 0 moves first, then bot 1, etc.
- The spawn tile (bottom-right) is exempt from collision

### Pickup Rules

- Bot must be **adjacent** (Manhattan distance 1) to the shelf containing the item
- Bot inventory must not be full (max 3 items)
- `item_id` must match an item on the map

### Dropoff Rules

- Bot must be standing **on** the drop-off cell
- Bot must have items in inventory
- Only items matching the **active order** are delivered — non-matching items **stay in inventory**
- Each delivered item = **+1 point**
- Completed order = **+5 bonus points**

## Game Over Message

```json
{
  "type": "game_over",
  "score": 47,
  "rounds_used": 200,
  "items_delivered": 22,
  "orders_completed": 5
}
```

The game ends when: max rounds reached, wall-clock timeout (120s/300s), or client disconnect.

## Coordinate System

- Origin `(0, 0)` is the **top-left** corner
- X increases to the right
- Y increases downward

---

# Scoring

## Score Formula

```
score = items_delivered × 1 + orders_completed × 5
```

## Leaderboard

Your **leaderboard score** = **sum of best scores across all 21 maps**.

- Play each map as many times as you want (60s cooldown, 40/hour, 300/day)
- Only your highest score per map is saved
- Deterministic within a day

## Rate Limits

- 60 second cooldown between games
- Max 40 games per hour per team
- Max 300 games per day per team

---

# Example Bot (Python)

```python
import asyncio
import json
import websockets

WS_URL = "wss://game.ainm.no/ws?token=YOUR_TOKEN_HERE"


async def play():
    async with websockets.connect(WS_URL) as ws:
        async for message in ws:
            data = json.loads(message)

            if data["type"] == "game_over":
                print(f"Game over! Score: {data['score']}, Rounds: {data['rounds_used']}")
                break

            if data["type"] == "game_state":
                actions = decide_actions(data)
                await ws.send(json.dumps({"actions": actions}))


def decide_actions(state):
    bots = state["bots"]
    items = state["items"]
    orders = state["orders"]
    drop_off = state["drop_off"]

    actions = []
    for bot in bots:
        action = decide_bot_action(bot, items, orders, drop_off)
        actions.append(action)
    return actions


def decide_bot_action(bot, items, orders, drop_off):
    bx, by = bot["position"]
    inventory = bot["inventory"]

    active = next((o for o in orders if o.get("status") == "active" and not o["complete"]), None)
    if not active:
        return {"bot": bot["id"], "action": "wait"}

    needed = {}
    for item in active["items_required"]:
        needed[item] = needed.get(item, 0) + 1
    for item in active["items_delivered"]:
        needed[item] = needed.get(item, 0) - 1
    needed = {k: v for k, v in needed.items() if v > 0}

    has_useful = any(needed.get(item, 0) > 0 for item in inventory)
    if has_useful and bx == drop_off[0] and by == drop_off[1]:
        return {"bot": bot["id"], "action": "drop_off"}

    if len(inventory) >= 3 or (has_useful and not needed):
        return navigate_to(bot["id"], bx, by, drop_off[0], drop_off[1])

    best_item = None
    best_dist = float("inf")
    for item in items:
        if needed.get(item["type"], 0) > 0:
            ix, iy = item["position"]
            dist = abs(bx - ix) + abs(by - iy)
            if dist < best_dist:
                best_dist = dist
                best_item = item

    if best_item:
        ix, iy = best_item["position"]
        if abs(bx - ix) + abs(by - iy) == 1:
            return {"bot": bot["id"], "action": "pick_up", "item_id": best_item["id"]}
        return navigate_to(bot["id"], bx, by, ix, iy)

    if has_useful:
        return navigate_to(bot["id"], bx, by, drop_off[0], drop_off[1])

    return {"bot": bot["id"], "action": "wait"}


def navigate_to(bot_id, x, y, tx, ty):
    dx = tx - x
    dy = ty - y
    if abs(dx) > abs(dy):
        return {"bot": bot_id, "action": "move_right" if dx > 0 else "move_left"}
    if dy != 0:
        return {"bot": bot_id, "action": "move_down" if dy > 0 else "move_up"}
    if dx != 0:
        return {"bot": bot_id, "action": "move_right" if dx > 0 else "move_left"}
    return {"bot": bot_id, "action": "wait"}


asyncio.run(play())
```

### Improvements needed:
- **Add pathfinding** — BFS/A* around walls and shelves
- **Assign roles** — split bots into different map regions
- **Coordinate pickups** — track what each bot is targeting to avoid duplication
- **Order prioritization** — focus on nearly-complete orders first
- **Pre-pick preview order items** — use idle bots to pre-position for next order
