export class TypingAndSeenManager {
  private static instance: TypingAndSeenManager;

  private typingLoops = new Map<string, NodeJS.Timeout>();
  private stopTimeouts = new Map<string, NodeJS.Timeout>();

  private constructor(private client: any) {}

  static getInstance(client: any) {
    if (!TypingAndSeenManager.instance) {
      TypingAndSeenManager.instance = new TypingAndSeenManager(client);
    }
    return TypingAndSeenManager.instance;
  }

  async markAsSeen(msg: any) {
    if (msg?.key?.id) {
      await this.client.readMessages([
        {
          id: msg.key.id,
          remoteJid: msg.key.remoteJid,
          participant: msg.key.participant || undefined,
        },
      ]);
    }
  }

  async startTyping(jid: string) {
    if (this.typingLoops.has(jid)) return;

    await this.client.presenceSubscribe(jid);

    let typing = false;

    const loop = setInterval(async () => {
      typing = !typing;

      await this.client.sendPresenceUpdate(
        typing ? 'composing' : 'available',
        jid,
      );
    }, 3000 + 2000); // 3s typing + 2s break

    // Start immediately as typing
    await this.client.sendPresenceUpdate('composing', jid);

    this.typingLoops.set(jid, loop);

    // ⏱️ HARD STOP after 15s
    const stopTimeout = setTimeout(async () => {
      await this.stopTyping(jid);
    }, 15000);

    this.stopTimeouts.set(jid, stopTimeout);
  }

  async stopTyping(jid: string) {
    const loop = this.typingLoops.get(jid);
    if (loop) {
      clearInterval(loop);
      this.typingLoops.delete(jid);
    }

    const stopTimeout = this.stopTimeouts.get(jid);
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      this.stopTimeouts.delete(jid);
    }

    await this.client.sendPresenceUpdate('available', jid);
  }

  async seenAndTyping(msg: any, jid: string) {
    await this.markAsSeen(msg);
    await this.startTyping(jid);
  }
}
