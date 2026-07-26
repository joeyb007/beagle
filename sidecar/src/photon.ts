// The ONLY module that touches the Photon SDK. Everything else sees PhotonLayer.
// FakePhoton drives dev/tests; RealPhoton lights up when IMESSAGE_TOKEN exists.

export interface OutEvent {
  type: "message" | "pollVote";
  handle: string;
  chatId?: string;
  text?: string;
  pollId?: string;
  optionIndex?: number;
}

export interface SentRecord {
  kind: "text" | "card" | "poll" | "typing_on" | "typing_off" | "image" | "celebrate" | "voice" | "file";
  chatId: string;
  text?: string;
  options?: string[];
}

export interface PhotonLayer {
  createChat(handles: string[]): Promise<{ id: string }>;
  sendText(chatId: string, text: string): Promise<void>;
  setTyping(chatId: string, on: boolean): Promise<void>;
  createPoll(chatId: string, question: string, options: string[]): Promise<{ id: string }>;
  sendImage(chatId: string, path: string): Promise<void>;
  /** Confetti-effect message + optional group rename + optional chat background. */
  celebrate(chatId: string, text: string, name?: string, backgroundPath?: string): Promise<void>;
  /** Native voice-note bubble from an audio file. */
  sendVoice(chatId: string, path: string, mimeType?: string): Promise<void>;
  /** Arbitrary file attachment (e.g. an .ics calendar invite). */
  sendFile(chatId: string, path: string): Promise<void>;
  isIMessageAvailable(handle: string): Promise<boolean>;
  onEvent(handler: (e: OutEvent) => void): void;
}

// ---------------------------------------------------------------- fake layer

export class FakePhoton implements PhotonLayer {
  sent: SentRecord[] = [];
  private handlers: ((e: OutEvent) => void)[] = [];
  private chatSeq = 0;
  private pollSeq = 0;

  async createChat(handles: string[]) {
    return { id: `fake-chat-${++this.chatSeq}-${handles.length}p` };
  }
  async sendText(chatId: string, text: string) {
    this.sent.push({ kind: "text", chatId, text });
  }
  async setTyping(chatId: string, on: boolean) {
    this.sent.push({ kind: on ? "typing_on" : "typing_off", chatId });
  }
  async sendImage(chatId: string, path: string) {
    this.sent.push({ kind: "image", chatId, text: path });
  }
  async celebrate(chatId: string, text: string, name?: string, backgroundPath?: string) {
    this.sent.push({ kind: "celebrate", chatId, text, options: [name ?? "", backgroundPath ?? ""] });
  }
  async sendVoice(chatId: string, path: string) {
    this.sent.push({ kind: "voice", chatId, text: path });
  }
  async sendFile(chatId: string, path: string) {
    this.sent.push({ kind: "file", chatId, text: path });
  }
  async createPoll(chatId: string, question: string, options: string[]) {
    this.sent.push({ kind: "poll", chatId, text: question, options });
    return { id: `fake-poll-${++this.pollSeq}` };
  }
  async isIMessageAvailable() {
    return true;
  }
  onEvent(handler: (e: OutEvent) => void) {
    this.handlers.push(handler);
  }
  // test injection (exposed via /_fake routes)
  inject(e: OutEvent) {
    for (const h of this.handlers) h(e);
  }
}

// ------------------------------------------------- event mapping (pure, tested)
// Shapes verified against the installed SDK v2 .d.ts:
//   MessageEvent "message.received": { chatGuid, isFromMe, actor?, message }
//     with text at message.content.text
//   PollEvent "poll.changed": { chatGuid, isFromMe, actor?, pollMessageGuid,
//     delta: { type: "voted", optionIdentifier } | ... }

export class PollOptionIndex {
  private byPoll = new Map<string, string[]>();
  remember(pollGuid: string, optionIdentifiers: string[]) {
    this.byPoll.set(pollGuid, optionIdentifiers);
  }
  indexOf(pollGuid: string, optionIdentifier: string): number {
    return (this.byPoll.get(pollGuid) ?? []).indexOf(optionIdentifier);
  }
}

export function mapMessageEvent(e: any): OutEvent | null {
  if (e?.type !== "message.received" || e.isFromMe) return null;
  return {
    type: "message",
    handle: e.actor?.address ?? e.message?.sender?.address ?? "",
    chatId: e.chatGuid ?? "",
    text: e.message?.content?.text ?? "",
  };
}

export function mapPollEvent(e: any, index: PollOptionIndex): OutEvent | null {
  if (e?.type !== "poll.changed" || e.delta?.type !== "voted") return null;
  const optionIndex = index.indexOf(e.pollMessageGuid, e.delta.optionIdentifier);
  if (optionIndex < 0) return null; // unknown poll/option — not one of ours
  return {
    type: "pollVote",
    handle: e.actor?.address ?? "",
    pollId: e.pollMessageGuid,
    optionIndex,
  };
}

// -------------------------------------------- spectrum-ts mapping (pure, tested)
// Hosted provider path: inbound arrives as [space, message] tuples; votes are
// "poll_option" content that embeds the full poll with ordered options.

export class PollBySpace {
  private ids = new Map<string, string>();
  remember(spaceId: string, pollMessageId: string) {
    this.ids.set(spaceId, pollMessageId);
  }
  idFor(spaceId: string): string | undefined {
    return this.ids.get(spaceId);
  }
}

export function mapSpectrumInbound(space: any, message: any, polls: PollBySpace): OutEvent | null {
  const content = message?.content;

  // Votes are NOT direction-gated (per docs, poll_option is narrowed by content
  // type only — the platform may stamp votes on our own poll as non-inbound).
  // Guard against the agent's own actions via sender.kind instead.
  if (content?.type === "poll_option" && content.selected) {
    if (message.sender?.kind === "agent") return null;
    const optionIndex = (content.poll?.options ?? []).findIndex(
      (o: any) => o.title === content.option?.title
    );
    if (optionIndex < 0) return null;
    return {
      type: "pollVote",
      handle: message.sender?.id ?? "",
      pollId: polls.idFor(space.id) ?? space.id,
      optionIndex,
    };
  }

  if (message?.direction !== "inbound") return null;
  if (content?.type === "text") {
    return {
      type: "message",
      handle: message.sender?.id ?? "",
      chatId: space.id,
      text: content.text ?? "",
    };
  }
  return null;
}

// ---------------------------------------------------- real layer (spectrum-ts)

export async function createRealPhoton(): Promise<PhotonLayer> {
  const { Spectrum, poll } = await import("spectrum-ts");
  const { imessage } = await import("spectrum-ts/providers/imessage");

  // Auto-discovery from project credentials is the normal path; an explicit
  // line (address+token) is supported for independently managed credentials.
  const explicitLine =
    process.env.IMESSAGE_ADDRESS && process.env.IMESSAGE_TOKEN
      ? [{
          address: process.env.IMESSAGE_ADDRESS,
          token: process.env.IMESSAGE_TOKEN,
          phone: process.env.IMESSAGE_PHONE ?? "",
        }]
      : undefined;

  const app: any = await Spectrum({
    projectId: process.env.SPECTRUM_PROJECT_ID,
    projectSecret: process.env.SPECTRUM_PROJECT_SECRET,
    providers: [imessage.config(explicitLine ? ({ clients: explicitLine } as any) : undefined)],
  } as any);
  const im: any = imessage(app);

  const handlers: ((e: OutEvent) => void)[] = [];
  const emit = (e: OutEvent | null) => e && handlers.forEach((h) => h(e));
  const polls = new PollBySpace();
  const spaces = new Map<string, any>();
  const getSpace = async (id: string) => {
    if (!spaces.has(id)) spaces.set(id, await im.space.get(id));
    return spaces.get(id);
  };

  (async () => {
    try {
      for await (const [space, message] of app.messages) {
        spaces.set(space.id, space);
        const mapped = mapSpectrumInbound(space, message, polls);
        if (mapped) {
          emit(mapped);
        } else {
          // Recon: show exactly what arrived so mapping gaps are diagnosable
          console.error(
            "[sidecar] unmapped event:",
            JSON.stringify({
              direction: (message as any)?.direction,
              sender: (message as any)?.sender?.id,
              space: space.id,
              content: (message as any)?.content,
            }).slice(0, 600)
          );
        }
      }
    } catch (err) {
      console.error("[sidecar] spectrum message stream ended:", err);
    }
  })();

  return {
    async createChat(handles) {
      const users = await Promise.all(handles.map((h) => im.user(h)));
      const space = await im.space.create(handles.length === 1 ? users[0] : users);
      spaces.set(space.id, space);
      return { id: space.id };
    },
    async sendText(chatId, text) {
      await (await getSpace(chatId)).send(text);
    },
    async setTyping(chatId, on) {
      const space = await getSpace(chatId);
      await (on ? space.startTyping() : space.stopTyping());
    },
    async sendImage(chatId, path) {
      const { attachment } = await import("spectrum-ts");
      await (await getSpace(chatId)).send(attachment(path));
    },
    async celebrate(chatId, celebrationText, name, backgroundPath) {
      const space = await getSpace(chatId);
      const { effect, background } = await import("spectrum-ts/providers/imessage");
      await space.send(effect(celebrationText, "com.apple.messages.effect.CKConfettiEffect"));
      if (name) {
        const { rename } = await import("spectrum-ts");
        try { await space.send(rename(name)); } catch (e) { console.error("[sidecar] rename failed:", e); }
      }
      if (backgroundPath) {
        try { await space.send(background(backgroundPath)); } catch (e) { console.error("[sidecar] background failed:", e); }
      }
    },
    async sendVoice(chatId, path, mimeType) {
      const { voice } = await import("spectrum-ts");
      await (await getSpace(chatId)).send(voice(path, { mimeType: mimeType ?? "audio/mp4" }));
    },
    async sendFile(chatId, path) {
      const { attachment } = await import("spectrum-ts");
      await (await getSpace(chatId)).send(attachment(path));
    },
    async createPoll(chatId, question, options) {
      const space = await getSpace(chatId);
      const msg = await space.send(poll(question, ...options));
      const id = msg?.id ?? `poll-${chatId}`;
      polls.remember(chatId, id);
      return { id };
    },
    async isIMessageAvailable(handle) {
      try {
        await im.user(handle);
        return true; // resolvable handle — best-effort preflight
      } catch {
        return false;
      }
    },
    onEvent(handler) {
      handlers.push(handler);
    },
  };
}

// ------------------------------------- legacy direct-gRPC layer (kept as spare)

export async function createAdvancedGrpcPhoton(): Promise<PhotonLayer> {
  const { createGrpcClient } = await import("@photon-ai/advanced-imessage");
  const client: any = createGrpcClient({
    address: process.env.IMESSAGE_ADDRESS!, // "host:port", no scheme
    token: process.env.IMESSAGE_TOKEN!,
  } as any);

  const handlers: ((e: OutEvent) => void)[] = [];
  const emit = (e: OutEvent | null) => e && handlers.forEach((h) => h(e));
  const pollIndex = new PollOptionIndex();

  (async () => {
    try {
      for await (const e of client.messages.subscribeEvents()) emit(mapMessageEvent(e));
    } catch (err) {
      console.error("[sidecar] message event stream ended:", err);
    }
  })();
  (async () => {
    try {
      for await (const e of client.polls.subscribeEvents()) emit(mapPollEvent(e, pollIndex));
    } catch (err) {
      console.error("[sidecar] poll event stream ended:", err);
    }
  })();

  return {
    async createChat(handles) {
      const res: any = await client.chats.create(handles);
      return { id: res.chat?.guid ?? res.guid ?? res.id };
    },
    async sendText(chatId, text) {
      await client.messages.sendText(chatId, text);
    },
    async setTyping(chatId, on) {
      await client.chats.setTyping(chatId, on);
    },
    async createPoll(chatId, question, options) {
      // Poll.title + PollOption.optionIdentifier per the .d.ts
      const poll: any = await client.polls.create(chatId, { title: question, options });
      const guid = poll.pollMessageGuid ?? poll.guid ?? poll.id;
      pollIndex.remember(
        guid,
        (poll.options ?? []).map((o: any) => o.optionIdentifier)
      );
      return { id: guid };
    },
    async isIMessageAvailable(handle) {
      const res: any = await client.addresses.isIMessageAvailable(handle);
      return Boolean(res?.available ?? res?.imessage ?? res);
    },
    // spare layer: no effect/voice/file support — degrade to plain text
    async sendImage() {
      throw new Error("images not supported on legacy gRPC layer");
    },
    async celebrate(chatId, celebrationText) {
      await client.messages.sendText(chatId, celebrationText);
    },
    async sendVoice() {
      throw new Error("voice not supported on legacy gRPC layer");
    },
    async sendFile() {
      throw new Error("file attachments not supported on legacy gRPC layer");
    },
    onEvent(handler) {
      handlers.push(handler);
    },
  };
}
