import { TypingAndSeenManager } from './typingAndSeenManager';

export class SendTextMessagesManager {
  private static instance: SendTextMessagesManager;
  private typingManager: TypingAndSeenManager;

  private constructor(private client: any) {
    this.typingManager = TypingAndSeenManager.getInstance(client);
  }

  static getInstance(client: any) {
    if (!SendTextMessagesManager.instance) {
      SendTextMessagesManager.instance = new SendTextMessagesManager(client);
    }
    return SendTextMessagesManager.instance;
  }

  async sendMessage({ phone, text }: { phone: string; text: string }) {
    try {
      await this.typingManager.stopTyping(phone);
      await this.client.sendMessage(phone, { text });
    } catch (err) {
      console.error('❌ SendTextMessagesManager error', err);
    }
  }

  async sendMessageImage(
    phone: string,
    image: Buffer,
    caption?: string,
    mimetype?: string
  ) {
    try {
      const safeCaption =
        typeof caption === 'string' && caption.trim() !== ''
          ? caption
          : undefined;

      await this.typingManager.stopTyping(phone);

      await this.client.sendMessage(phone, {
        image,
        caption: safeCaption,
        mimetype,
      });
    } catch (err) {
      console.error('❌ SendTextMessagesManager.sendImage error', err);
    }
  }
}
 