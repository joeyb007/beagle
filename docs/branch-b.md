# Beagle — Branch B: Photon / iMessage

**Branch:** `feat/imessage` · **Owner role:** the messaging surface
**Mission:** implement one clean `MessagingPort` (Python) over Photon so the agent never touches the SDK. Photon's SDK is **TS-only**, so you own two pieces: a thin **Node sidecar** (`sidecar/`) that wraps `@photon-ai/advanced-imessage`, and a **Python adapter** (`src/imessage/`) that talks to the sidecar over loopback. **Provision the Photon line FIRST — it's the critical path.**

---

## Shared model (same in all four docs)
Three processes, one SQLite file. The agent is a **Python/FastAPI** project at repo root; you implement a single interface from the frozen `src/contracts.py`; the Orchestrator (A) consumes it. Your Node sidecar is an implementation detail hidden entirely behind your Python adapter — nobody else knows it exists. Own only your directories → no merge conflicts. Branch from the hour-0 `main` A commits.

---

## ⏱ Hour 0 — do this before writing any other code
Provision the Photon iMessage line + auth, and confirm the team's real numbers can receive iMessage (`im.addresses` availability check). Everything B does is dead without a working line, and it's the longest pole in the whole build. Put `IMESSAGE_TOKEN` + server address in `.env`.

---

## Owned paths
`src/imessage/**` and `sidecar/**` (Node mini-project, own `package.json` — deps there are yours alone).

## Architecture: sidecar + adapter

```
Orchestrator (A, Python)
      │  MessagingPort (contracts.py)
      ▼
PhotonMessaging (src/imessage/, Python)
      │  loopback HTTP (commands) + WebSocket (event stream)
      ▼
sidecar/ (Node + @photon-ai/advanced-imessage, TS)
      │  gRPC (full v1 surface incl. live event subscriptions)
      ▼
Photon Spectrum gateway → iMessage
```

The sidecar is deliberately dumb: one route per SDK call, one WebSocket pushing normalized events. All logic lives in Python. (The Photon server also has an HTTP transport, but live `subscribeEvents` streams are on the gRPC surface — that's why the sidecar wraps the SDK instead of Python hitting the server directly.)

## Contract you IMPLEMENT (`src/imessage/photon_messaging.py`)

```python
class ChatRef(BaseModel): id: str
class Card(BaseModel): title: str; body: str; fields: list[CardField] | None = None; url: str | None = None
class InboundMessage(BaseModel): handle: str; chat_id: str; text: str
class PollSpec(BaseModel): question: str; options: list[str]
class PollVote(BaseModel): poll_id: str; handle: str; option_index: int
class PollRef(BaseModel): id: str

class MessagingPort(Protocol):
    async def open_direct(self, handle: str) -> ChatRef: ...
    async def open_group(self, handles: list[str]) -> ChatRef: ...
    async def send_text(self, chat: ChatRef, text: str) -> None: ...
    async def set_typing(self, chat: ChatRef, on: bool) -> None: ...
    async def send_card(self, chat: ChatRef, card: Card) -> None: ...
    async def create_poll(self, chat: ChatRef, poll: PollSpec) -> PollRef: ...
    def on_inbound(self, handler: Callable[[InboundMessage], None]) -> None: ...
    def on_poll_vote(self, handler: Callable[[PollVote], None]) -> None: ...
```

## Contracts you CONSUME
None. You're a pure adapter over the Photon SDK (via your sidecar).

---

## Tasks

**Sidecar (`sidecar/`, TS — keep it dumb):**
- [ ] **T1. Client + line** — `createClient({ address, token })`; verify TLS default. *(hour 0)*
- [ ] **T2. Command routes** — one loopback HTTP route per SDK call: `im.chats.create` (DM + group), `im.messages.sendText`, `im.chats.setTyping`, card send, `im.polls.create`. Thin passthrough, no logic.
- [ ] **T3. Event stream** — subscribe to `im.messages` + `im.polls` events via gRPC; normalize to `{handle, chatId, text}` / `{pollId, handle, optionIndex}` JSON; push over a loopback WebSocket. Decode `attributedBody` if text is empty. *(FR4, FR6)*

**Python adapter (`src/imessage/`):**
- [ ] **T4. `open_direct` / `open_group`** — POST sidecar → return `ChatRef`. *(FR2)*
- [ ] **T5. `send_text` / `set_typing`** — the human-feel typing bubbles. *(FR2)*
- [ ] **T6. `send_card`** — rich/mini-app card via sidecar; fallback to formatted text if needed. *(FR8)*
- [ ] **T7. `create_poll`** — poll via sidecar → `PollRef`. *(FR6)*
- [ ] **T8. `on_inbound` / `on_poll_vote`** — consume the sidecar WebSocket; dispatch to registered handlers. Auto-reconnect on drop. *(FR4, FR6)*
- [ ] **T9. Lifecycle** — adapter spawns (or health-checks) the sidecar process on startup so `wiring.py` needs zero Node knowledge.
- [ ] **T10. Availability preflight** — helper via `im.addresses` to confirm a number is iMessage-capable (so a demo reply doesn't arrive as green-bubble SMS).
- [ ] **T11. (stretch, with A)** — deliver A's generated components as Photon mini-app cards. Strictly last; never blocks the deadline. *(FR34)*

## Acceptance (branch green in isolation)
A standalone script (`src/imessage/smoke.py`) instantiates `PhotonMessaging` (which brings up the sidecar) and, against a **real** phone number: opens a DM, shows typing, sends a text, sends a card, creates a poll, and logs live inbound messages + poll votes to the console. Green = real iMessages fly and events stream back **through the full Python↔sidecar path**.

## Consolidation seam
Zero glue on your side. In consolidation, A's `wiring.py` does `PhotonMessaging(...)` and injects it into the Orchestrator; your adapter handles the sidecar lifecycle itself. Your only job is that the interface matches `contracts.py` exactly.

## Conflict rules
Keep everything in `src/imessage/` and `sidecar/`. Don't import from `src/agent` or `src/data`. If Photon can't express something the interface needs (e.g. a group poll quirk), solve it inside your adapter or sidecar — don't change `contracts.py` without telling A.
