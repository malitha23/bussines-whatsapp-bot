import { Repository } from 'typeorm';
import { BotMessage } from '../../../database/entities/bot-messages.entity';

/**
 * Get the bot message text for a business, language and key.
 * Falls back to English if translation is missing.
 */
export async function getBotMessage(
  botMessageRepo: Repository<BotMessage>,
  businessId: number,
  language: string,
  keyName: string
): Promise<string> {
  // Try selected language
  const msg = await botMessageRepo.findOne({
    where: { business_id: businessId, language, key_name: keyName },
  });

  if (msg?.text) return msg.text;

  // Fallback to English if Sinhala/Tamil missing
  const fallback = await botMessageRepo.findOne({
    where: { business_id: businessId, language: 'en', key_name: keyName },
  });

  if (fallback?.text) return fallback.text;

  // Final fallback to readable default string (never return blank)
  return `⚠️ Missing message: ${keyName}`;
}
