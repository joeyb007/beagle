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
  kind: "text" | "card" | "poll" | "typing_on" | "typing_off";
  chatId: string;
  text?: string;
  options?: string[];
}

export interface PhotonLayer {
  createChat(handles: string[]): Promise<{ id: string }>;
  sendText(chatId: string, text: string): Promise<void>;
  setTyping(chatId: string, on: boolean): Promise<void>;
  createPoll(chatId: string, question: string, options: string[]): Promise<{ id: string }>;
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

// ---------------------------------------------------------------- real layer

export async function createRealPhoton(): Promise<PhotonLayer> {
  const { createGrpcClient, parseMessageChangeEvent, parsePollChangeEvent } = await import(
    "@photon-ai/advanced-imessage"
  );
  const client: any = createGrpcClient({
    address: process.env.IMESSAGE_ADDRESS!,
    token: process.env.IMESSAGE_TOKEN!,
  } as any);

  const handlers: ((e: OutEvent) => void)[] = [];
  const emit = (e: OutEvent) => handlers.forEach((h) => h(e));

  // Live streams: chat events carry inbound messages, poll events carry votes.
  // Field mapping is best-effort against SDK v1 — verify at hour 0 with the line.
  (async () => {
    try {
      for await (const raw of client.chats.subscribeEvents()) {
        const e: any = parseMessageChangeEvent(raw as any);
        const msg = e?.message;
        if (msg && !msg.isFromMe) {
          emit({
            type: "message",
            handle: msg.sender ?? msg.handle ?? "",
            chatId: msg.chatGuid ?? msg.chatId ?? "",
            text: msg.text ?? msg.attributedBody?.text ?? "",
          });
        }
      }
    } catch (err) {
      console.error("[sidecar] chat event stream ended:", err);
    }
  })();
  (async () => {
    try {
      for await (const raw of client.polls.subscribeEvents()) {
        const e: any = parsePollChangeEvent(raw as any);
        const vote = e?.vote ?? e;
        if (vote?.pollId != null && vote?.optionIndex != null) {
          emit({
            type: "pollVote",
            handle: vote.voter ?? vote.handle ?? "",
            pollId: String(vote.pollId),
            optionIndex: Number(vote.optionIndex),
          });
        }
      }
    } catch (err) {
      console.error("[sidecar] poll event stream ended:", err);
    }
  })();

  return {
    async createChat(handles) {
      const chat: any = await client.chats.create(handles);
      return { id: chat.guid ?? chat.id };
    },
    async sendText(chatId, text) {
      await client.messages.sendText(chatId, text);
    },
    async setTyping(chatId, on) {
      await client.chats.setTyping(chatId, on);
    },
    async createPoll(chatId, question, options) {
      const poll: any = await client.polls.create(chatId, { question, options });
      return { id: poll.guid ?? poll.id };
    },
    async isIMessageAvailable(handle) {
      const res: any = await client.addresses.isIMessageAvailable(handle);
      return Boolean(res?.available ?? res);
    },
    onEvent(handler) {
      handlers.push(handler);
    },
  };
}
