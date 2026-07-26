"""PhotonMessaging: MessagingPort over the Node sidecar (docs/branch-b.md).

Commands cross a loopback HTTP boundary; events arrive on a WebSocket and are
dispatched to registered handlers. The adapter owns the sidecar lifecycle
(T9) so wiring.py needs zero Node knowledge.
"""

import asyncio
import json
import os
import subprocess
from pathlib import Path
from typing import Callable

import httpx
import websockets

from src.contracts import (
    Card,
    ChatRef,
    InboundMessage,
    PollRef,
    PollSpec,
    PollVote,
)

SIDECAR_DIR = Path(__file__).resolve().parents[2] / "sidecar"


class PhotonMessaging:
    def __init__(
        self,
        sidecar_url: str = "http://127.0.0.1:8787",
        *,
        fake: bool = False,
        auto_spawn: bool = True,
    ):
        self._url = sidecar_url.rstrip("/")
        self._fake = fake
        self._auto_spawn = auto_spawn
        self._http = httpx.AsyncClient(base_url=self._url, timeout=10.0)
        self._proc: subprocess.Popen | None = None
        self._ws_task: asyncio.Task | None = None
        self._inbound_handlers: list[Callable[[InboundMessage], None]] = []
        self._vote_handlers: list[Callable[[PollVote], None]] = []

    # ------------------------------------------------------- T9: lifecycle

    async def ensure_running(self) -> None:
        if await self._healthy():
            self._start_ws()
            return
        if not self._auto_spawn:
            raise RuntimeError(f"sidecar not reachable at {self._url}")
        env = os.environ.copy()
        env["SIDECAR_PORT"] = self._url.rsplit(":", 1)[1]
        if self._fake:
            env["SIDECAR_FAKE"] = "1"
        log = open(SIDECAR_DIR.parent / "sidecar.log", "a")  # noqa: SIM115 — lives as long as the process
        self._proc = subprocess.Popen(
            ["npm", "run", "start", "--silent"],
            cwd=SIDECAR_DIR,
            env=env,
            stdout=log,
            stderr=log,
        )
        for _ in range(100):  # up to ~10s for tsx cold start
            if await self._healthy():
                self._start_ws()
                return
            await asyncio.sleep(0.1)
        raise RuntimeError("sidecar failed to become healthy")

    async def _healthy(self) -> bool:
        try:
            resp = await self._http.get("/health")
            return resp.status_code == 200 and resp.json().get("ok") is True
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        if self._ws_task:
            self._ws_task.cancel()
        await self._http.aclose()
        if self._proc:
            self._proc.terminate()
            self._proc.wait(timeout=5)

    # ------------------------------------------- T4-T7: command passthrough

    async def open_direct(self, handle: str) -> ChatRef:
        data = await self._post("/chats/direct", {"handle": handle})
        return ChatRef(id=data["id"])

    async def open_group(self, handles: list[str]) -> ChatRef:
        data = await self._post("/chats/group", {"handles": handles})
        return ChatRef(id=data["id"])

    async def send_text(self, chat: ChatRef, text: str) -> None:
        await self._post("/messages/text", {"chatId": chat.id, "text": text})

    async def set_typing(self, chat: ChatRef, on: bool) -> None:
        try:
            await self._post("/chats/typing", {"chatId": chat.id, "on": on})
        except Exception as e:  # cosmetic — never let a typing bubble kill a beat
            print(f"[messaging] set_typing failed (non-fatal): {e}")

    async def send_card(self, chat: ChatRef, card: Card) -> None:
        await self._post("/messages/card", {"chatId": chat.id, "card": card.model_dump()})

    async def create_poll(self, chat: ChatRef, poll: PollSpec) -> PollRef:
        data = await self._post(
            "/polls", {"chatId": chat.id, "question": poll.question, "options": poll.options}
        )
        return PollRef(id=data["id"])

    async def _post(self, path: str, payload: dict) -> dict:
        resp = await self._http.post(path, json=payload)
        if resp.status_code >= 400:  # surface the sidecar's error body, not just the code
            raise RuntimeError(f"sidecar {path} -> {resp.status_code}: {resp.text}")
        return resp.json()

    # ------------------------------------------------- T8: event dispatch

    def on_inbound(self, handler: Callable[[InboundMessage], None]) -> None:
        self._inbound_handlers.append(handler)

    def on_poll_vote(self, handler: Callable[[PollVote], None]) -> None:
        self._vote_handlers.append(handler)

    def _start_ws(self) -> None:
        if self._ws_task is None or self._ws_task.done():
            self._ws_task = asyncio.create_task(self._ws_loop())

    async def _ws_loop(self) -> None:
        ws_url = self._url.replace("http", "ws", 1) + "/events"
        while True:  # auto-reconnect on drop
            try:
                async with websockets.connect(ws_url) as ws:
                    async for raw in ws:
                        self._dispatch(json.loads(raw))
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.5)

    def _dispatch(self, e: dict) -> None:
        if e.get("type") == "message":
            m = InboundMessage(handle=e["handle"], chat_id=e["chatId"], text=e.get("text", ""))
            for h in self._inbound_handlers:
                h(m)
        elif e.get("type") == "pollVote":
            v = PollVote(
                poll_id=e["pollId"], handle=e["handle"], option_index=e["optionIndex"]
            )
            for h in self._vote_handlers:
                h(v)

    # ------------------------------------------------------ T10: preflight

    async def is_imessage_available(self, handle: str) -> bool:
        resp = await self._http.get("/addresses/check", params={"handle": handle})
        resp.raise_for_status()
        return bool(resp.json().get("imessage"))
