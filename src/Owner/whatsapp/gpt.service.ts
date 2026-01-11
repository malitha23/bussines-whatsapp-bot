import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class GptService {
    private readonly logger = new Logger(GptService.name);
    private openai: OpenAI;
    private cache = new Map<string, { response: string; timestamp: number }>();

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.GROQ_API_KEY, // Your Groq API key
            baseURL: 'https://api.groq.com/openai/v1', // Groq endpoint
        });
    }

    // Universal message enhancer with cache
    async enhanceMessage(
        context: string,
        userMessage: string,
        businessName: string,
        language: 'en' | 'si' | 'ta',
        options?: { maxTokens?: number; temperature?: number; cacheKey?: string }
    ): Promise<string> {

        const cacheKey = options?.cacheKey || `${businessName}_${language}_${userMessage.substring(0, 30)}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 3600000) return cached.response;

        const languageMap = { en: 'English', si: 'Sinhala', ta: 'Tamil' };

        // Adjust token limit based on language
        const maxTokens = options?.maxTokens || (language === 'en' ? 500 : 500);

        const systemPrompt = `
You are a professional WhatsApp chatbot for ${businessName}.
CONTEXT: ${context}

INSTRUCTIONS:
1. Respond in ${languageMap[language]} clearly, politely, and naturally.
2. Keep messages short, crisp, friendly, and human-like.
3. Preserve all numbered/emoji options exactly as they are; do not remove, merge, or add lines.
4. Enhance readability and flow while keeping text concise.
5. Use 1-2 relevant emojis to make messages engaging, not excessive.
6. For menus, always preserve numbering and give clear instructions to type numbers.
7. Avoid extra explanations, greetings, or unnecessary words.
8. Maximum ${maxTokens} tokens.
9. Ensure the message reads like a real human is writing on WhatsApp.
10. Prioritize clarity, friendliness, and professional tone.
`;


        try {
            const response = await this.openai.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: options?.temperature ?? 0.5, // friendly & natural
                max_tokens: maxTokens,
                stream: false,
            });

            const enhancedMessage = response.choices[0].message.content || userMessage;
            this.cache.set(cacheKey, { response: enhancedMessage, timestamp: Date.now() });

            return enhancedMessage;

        } catch (error: any) {
            this.logger.error(`Groq API Error: ${error.message}`, error.stack);
            return this.generateFallbackResponse(userMessage, language, context);
        }
    }

    // Add this method to your GptService class

    async enhanceBusinessInfo(
        businessName: string,
        businessDetails: {
            name: string;
            email?: string;
            phone?: string;
            address?: string;
            isActive: boolean;
            description?: string;
            openingHours?: string;
            website?: string;
            socialMedia?: string[];
        },
        language: 'en' | 'si' | 'ta',
        options?: { maxTokens?: number; temperature?: number }
    ): Promise<string> {

        // Create a cache key for business info
        const cacheKey = `business_${businessName}_${language}_${JSON.stringify(businessDetails).substring(0, 50)}`;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 3600000) return cached.response;

        const languageMap = { en: 'English', si: 'Sinhala', ta: 'Tamil' };
        const maxTokens = options?.maxTokens || (language === 'en' ? 600 : 700);

        // Build the raw business info message
        let rawMessage = `🏢 *${businessDetails.name}*\n\n`;

        if (businessDetails.description) {
            rawMessage += `📝 ${businessDetails.description}\n\n`;
        }

        rawMessage += `📋 *Business Details:*\n`;

        if (businessDetails.email) {
            rawMessage += `📧 Email: ${businessDetails.email}\n`;
        }

        if (businessDetails.phone) {
            rawMessage += `📞 Phone: ${businessDetails.phone}\n`;
        }

        if (businessDetails.address) {
            rawMessage += `📍 Address: ${businessDetails.address}\n`;
        }

        if (businessDetails.openingHours) {
            rawMessage += `🕒 Opening Hours: ${businessDetails.openingHours}\n`;
        }

        if (businessDetails.website) {
            rawMessage += `🌐 Website: ${businessDetails.website}\n`;
        }

        if (businessDetails.socialMedia && businessDetails.socialMedia.length > 0) {
            rawMessage += `📱 Social Media: ${businessDetails.socialMedia.join(', ')}\n`;
        }

        rawMessage += `✅ Status: ${businessDetails.isActive ? 'Active & Open ✅' : 'Currently Closed ❌'}\n\n`;
        rawMessage += `➡️ Type 0 to go back to main menu`;

        const systemPrompt = `
You are a professional WhatsApp chatbot for ${businessName}.

INSTRUCTIONS:
1. Respond in ${languageMap[language]} clearly, professionally, and warmly.
2. Present business information in a clean, organized, and engaging format.
3. Keep the message concise but informative - mobile-friendly for WhatsApp.
4. Use appropriate emojis (2-3 max) to make it visually appealing.
5. Maintain all the business details exactly as provided - don't change facts.
6. Make it sound welcoming and inviting for customers.
7. For contact details, make them easy to copy/use.
8. Maximum ${maxTokens} tokens.
9. Keep the "Type 0 to go back" instruction at the end.
10. Format for easy reading on small screens.
`;

        try {
            const response = await this.openai.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: rawMessage }
                ],
                temperature: options?.temperature ?? 0.4, // Slightly more professional
                max_tokens: maxTokens,
                stream: false,
            });

            const enhancedMessage = response.choices[0].message.content || rawMessage;
            this.cache.set(cacheKey, { response: enhancedMessage, timestamp: Date.now() });

            return enhancedMessage;

        } catch (error: any) {
            this.logger.error(`Groq API Error for business info: ${error.message}`, error.stack);

            // Fallback: return formatted business info
            return this.generateBusinessInfoFallback(businessDetails, language);
        }
    }

    // Add this fallback method to your GptService class
    private generateBusinessInfoFallback(
        businessDetails: any,
        language: string
    ): string {
        const businessName = businessDetails.name || 'Our Business';

        const templates = {
            en: `🏢 *${businessName}*\n\n` +
                `We're here to serve you! Here are our details:\n\n` +
                `${businessDetails.email ? `📧 Email: ${businessDetails.email}\n` : ''}` +
                `${businessDetails.phone ? `📞 Phone: ${businessDetails.phone}\n` : ''}` +
                `${businessDetails.address ? `📍 Address: ${businessDetails.address}\n` : ''}` +
                `${businessDetails.openingHours ? `🕒 Hours: ${businessDetails.openingHours}\n` : ''}` +
                `\n✅ Currently: ${businessDetails.isActive ? 'Open for business!' : 'Temporarily closed'}\n\n` +
                `➡️ Type 0 to go back`,

            si: `🏢 *${businessName}*\n\n` +
                `අපි ඔබට සේවය කිරීමට සූදානම්! අපගේ විස්තර:\n\n` +
                `${businessDetails.email ? `📧 විද්‍යුත් තැපෑල: ${businessDetails.email}\n` : ''}` +
                `${businessDetails.phone ? `📞 දුරකථන: ${businessDetails.phone}\n` : ''}` +
                `${businessDetails.address ? `📍 ලිපිනය: ${businessDetails.address}\n` : ''}` +
                `${businessDetails.openingHours ? `🕒 විවෘත වේලා: ${businessDetails.openingHours}\n` : ''}` +
                `\n✅ දැන්: ${businessDetails.isActive ? 'ව්‍යාපාරය සඳහා විවෘතයි!' : 'තාවකාලිකව වසා ඇත'}\n\n` +
                `➡️ ආපසු යාමට 0 ටයිප් කරන්න`,

            ta: `🏢 *${businessName}*\n\n` +
                `உங்களுக்கு சேவை செய்ய நாங்கள் இங்கே இருக்கிறோம்! எங்கள் விவரங்கள்:\n\n` +
                `${businessDetails.email ? `📧 மின்னஞ்சல்: ${businessDetails.email}\n` : ''}` +
                `${businessDetails.phone ? `📞 தொலைபேசி: ${businessDetails.phone}\n` : ''}` +
                `${businessDetails.address ? `📍 முகவரி: ${businessDetails.address}\n` : ''}` +
                `${businessDetails.openingHours ? `🕒 திறந்த நேரம்: ${businessDetails.openingHours}\n` : ''}` +
                `\n✅ தற்போது: ${businessDetails.isActive ? 'வணிகத்திற்கு திறந்துள்ளது!' : 'தற்காலிகமாக மூடப்பட்டுள்ளது'}\n\n` +
                `➡️ திரும்பிச் செல்ல 0 தட்டச்சு செய்யவும்`
        };

        return templates[language as keyof typeof templates] || templates.en;
    }



    // Generate dynamic error messages
    async generateErrorResponse(
        errorType: string,
        businessName: string,
        language: 'en' | 'si' | 'ta'
    ): Promise<string> {
        const prompt = `Generate a friendly error message for a WhatsApp bot.
    
Error: ${errorType}
Business: ${businessName}
Language: ${language}

Make it helpful, not technical. Suggest what to do next.`;

        return this.enhanceMessage(
            prompt,
            '',
            businessName,
            language,
            {
                maxTokens: 100,
                cacheKey: `error_${errorType}_${language}`
            }
        );
    }

    // Enhance product descriptions
    async enhanceProductDescription(
        productName: string,
        description: string,
        businessName: string,
        language: 'en' | 'si' | 'ta'
    ): Promise<string> {
        const context = `Enhance this product description for WhatsApp chat:
    Product: ${productName}
    Original: ${description}
    
    Make it engaging, highlight key features, keep it short for mobile reading.`;

        return this.enhanceMessage(
            context,
            description,
            businessName,
            language,
            {
                cacheKey: `product_${productName}_${language}`
            }
        );
    }

    // Enhance menu options
    async enhanceMenuOptions(
        menuText: string,
        businessName: string,
        language: 'en' | 'si' | 'ta'
    ): Promise<string> {
        const context = `Enhance this menu text for WhatsApp bot. Make options clear and inviting.`;

        return this.enhanceMessage(
            context,
            menuText,
            businessName,
            language,
            {
                cacheKey: `menu_${language}`
            }
        );
    }

    // Enhance order confirmation
    async enhanceOrderConfirmation(
        orderDetails: string,
        businessName: string,
        language: 'en' | 'si' | 'ta'
    ): Promise<string> {
        const context = `Create a friendly order confirmation message for WhatsApp.`;

        return this.enhanceMessage(
            context,
            orderDetails,
            businessName,
            language,
            {
                temperature: 0.4, // Slightly more creative
                cacheKey: `order_confirm_${language}`
            }
        );
    }

    // Smart fallback when API fails
    private generateFallbackResponse(
        originalMessage: string,
        language: string,
        context?: string
    ): string {
        this.logger.warn('Using fallback response generator');

        // Detect intent from context
        if (context?.includes('error') || context?.includes('invalid')) {
            return this.getErrorFallback(language);
        }

        if (context?.includes('product') || context?.includes('description')) {
            return this.getProductFallback(originalMessage, language);
        }

        if (context?.includes('menu') || context?.includes('option')) {
            return this.getMenuFallback(originalMessage, language);
        }

        // Default enhanced fallback
        return this.getDefaultFallback(originalMessage, language);
    }

    private getErrorFallback(language: string): string {
        const errors = {
            en: "⚠️ Oops! Something went wrong. Please try again or type 'menu' for options.",
            si: "⚠️ ඔහ්! යමක් වැරදී ඇත. කරුණාකර නැවත උත්සාහ කරන්න හෝ 'මෙනු' ටයිප් කරන්න.",
            ta: "⚠️ அய்யோ! ஏதோ தவறு நடந்துள்ளது. மீண்டும் முயற்சிக்கவும் அல்லது 'மெனு' தட்டச்சு செய்யவும்."
        };
        return errors[language as keyof typeof errors] || errors.en;
    }

    private getProductFallback(message: string, language: string): string {
        const prefixes = {
            en: ["✨ ", "🛍️ ", "🌟 ", "✅ "],
            si: ["✨ ", "🛍️ ", "🌟 ", "✅ "],
            ta: ["✨ ", "🛍️ ", "🌟 ", "✅ "]
        };

        const prefix = prefixes[language as keyof typeof prefixes]?.[0] || "✨ ";
        return `${prefix}${message}`;
    }

    private getMenuFallback(message: string, language: string): string {
        const enhancements = {
            en: `📱 *Main Menu*\n\n${message}\n\nReply with number or type '0' to go back.`,
            si: `📱 *ප්‍රධාන මෙනුව*\n\n${message}\n\nඅංකයක් ලියන්න හෝ ආපසු යාමට '0' ටයිප් කරන්න.`,
            ta: `📱 *முதன்மை பட்டி*\n\n${message}\n\nஎண்ணுடன் பதிலளிக்கவும் அல்லது திரும்பிச் செல்ல '0' தட்டச்சு செய்யவும்.`
        };

        return enhancements[language as keyof typeof enhancements] || enhancements.en;
    }

    private getDefaultFallback(message: string, language: string): string {
        const responses = {
            en: `🤖 ${message}\n\nHow can I assist you further?`,
            si: `🤖 ${message}\n\nමට ඔබට තවත් කෙසේ සහාය විය හැකිද?`,
            ta: `🤖 ${message}\n\nநான் உங்களுக்கு மேலும் எவ்வாறு உதவ முடியும்?`
        };

        return responses[language as keyof typeof responses] || responses.en;
    }

    // Clear cache (optional)
    clearCache(): void {
        this.cache.clear();
        this.logger.log('GPT cache cleared');
    }

    // Get cache stats (optional)
    getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}