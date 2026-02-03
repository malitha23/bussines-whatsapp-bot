import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Bytez from 'bytez.js';
import { BusinessSettings } from '../../database/entities/business-settings.entity';
import { Business } from '../../database/entities/business.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Order } from '../../database/entities/order.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { Product } from '../../database/entities/product.entity';


@Injectable()
export class GptBytezServiceAdvance {
    private readonly logger = new Logger(GptBytezServiceAdvance.name);
    private readonly bytez: Bytez;
    private cache = new Map<string, { response: any; timestamp: number }>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

    constructor(
        @InjectRepository(Business)
        private businessRepo: Repository<Business>,
        @InjectRepository(Product)
        private productRepo: Repository<Product>,
        @InjectRepository(ProductVariant)
        private variantRepo: Repository<ProductVariant>,
        @InjectRepository(Order)
        private orderRepo: Repository<Order>,
        @InjectRepository(Customer)
        private customerRepo: Repository<Customer>,
        @InjectRepository(BusinessSettings)
        private settingsRepo: Repository<BusinessSettings>,
    ) {
        if (!process.env.BYTEZ_API_KEY) {
            throw new Error('BYTEZ_API_KEY is not defined');
        }
        this.bytez = new Bytez(process.env.BYTEZ_API_KEY!);
    }

    /**
     * Process incoming message with AI
     */
    async processMessage(
        businessId: number,
        customerPhone: string,
        customerName: string,
        message: string,
    ): Promise<{
        response: string;
        intent: string;
        suggestedActions?: string[];
        extractedData?: any;
    }> {
        const cacheKey = `${businessId}_${customerPhone}_${message.substring(0, 50)}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.response;
        }

        try {
            // Get business context
            const context = await this.getBusinessContext(businessId, customerPhone, customerName);

            // Get AI response
            const aiResponse = await this.getAIResponse(message, context);

            // Cache the response
            this.cache.set(cacheKey, {
                response: aiResponse,
                timestamp: Date.now()
            });

            return aiResponse;
        } catch (error) {
            this.logger.error(`AI processing error: ${error}`);
            return {
                response: "I apologize, but I'm having trouble processing your request. Please try again or contact support.",
                intent: 'error',
                suggestedActions: ['Contact Support']
            };
        }
    }

    /**
     * Extract order details from natural language
     */
    async extractOrderDetails(
        businessId: number,
        message: string
    ): Promise<{
        items: Array<{
            productName: string;
            variantName?: string;
            quantity: number;
            unitPrice?: number;
        }>;
        totalAmount?: number;
        deliveryInfo?: string;
        customerNotes?: string;
    }> {
        try {
            // Get business products for context
            const products = await this.productRepo.find({
                where: { business: { id: businessId }, is_active: true },
                relations: ['variants'],
            });

            const productList = products.map(p => ({
                name: p.name,
                basePrice: p.base_price,
                variants: p.variants.map(v => ({
                    name: v.variant_name,
                    price: v.price,
                    unit: v.unit
                }))
            }));

            const model = this.bytez.model('openai/gpt-4.1');

            const { error, output } = await model.run([
                {
                    role: 'system',
                    content: `You are an order extraction assistant. Extract order details from customer messages.
Available products: ${JSON.stringify(productList)}
Format: Return ONLY valid JSON with items array, each item should have productName, variantName (if any), quantity, and unitPrice.`
                },
                {
                    role: 'user',
                    content: message
                }
            ]);

            if (error) {
                this.logger.error('Order extraction AI error', error);
                throw new Error(error);
            }

            const aiText = output?.[0]?.content || '{}';

            let extracted;
            try {
                extracted = JSON.parse(aiText);
            } catch (e) {
                this.logger.error('Invalid JSON from AI', aiText);
                extracted = { items: [] };
            }

            return extracted;

        } catch (error) {
            this.logger.error(`Order extraction error: ${error}`);
            return { items: [] };
        }
    }

    /**
     * Generate personalized response based on context
     */
    async generateResponse(
        businessId: number,
        customerPhone: string,
        message: string,
        intent: string,
        contextData: any
    ): Promise<string> {
        const business = await this.businessRepo.findOne({
            where: { id: businessId },
            relations: ['settings'],
        });

        const settings = business!.settings || await this.settingsRepo.findOne({
            where: { business: { id: businessId } }
        });

        // Get customer's recent orders
        const recentOrders = await this.orderRepo.find({
            where: {
                business: { id: businessId },
                customer: { phone: customerPhone }
            },
            order: { created_at: 'DESC' },
            take: 3
        });

        const systemPrompt = this.buildResponsePrompt({
            businessName: business!.name,
            settings,
            customerOrders: recentOrders,
            intent,
            contextData,
            message
        });
        const model = this.bytez.model('openai/gpt-4.1');

        const { error, output } = await model.run([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
        ]);

        if (error) {
            this.logger.error('Bytez AI error', error);
            throw new Error(error);
        }

        return output?.[0]?.content || 'Sorry, I could not generate a response.';
    }

    /**
     * Check order status intelligently
     */
    async checkOrderStatus(
        businessId: number,
        customerPhone: string,
        message: string
    ): Promise<{
        orderFound: boolean;
        orderDetails?: Order;
        response: string;
    }> {
        // Extract order number from message
        const orderNumber = this.extractOrderNumber(message);

        if (orderNumber) {
            const order = await this.orderRepo.findOne({
                where: {
                    business: { id: businessId },
                    customer: { phone: customerPhone },
                    order_number: orderNumber
                },
                relations: ['items', 'items.variant', 'tracking']
            });

            if (order) {
                const statusText = this.formatOrderStatus(order);
                return {
                    orderFound: true,
                    orderDetails: order,
                    response: statusText
                };
            }
        }

        // If no specific order found, check recent orders
        const recentOrders = await this.orderRepo.find({
            where: {
                business: { id: businessId },
                customer: { phone: customerPhone }
            },
            order: { created_at: 'DESC' },
            take: 5
        });

        if (recentOrders.length > 0) {
            const response = await this.generateResponse(
                businessId,
                customerPhone,
                message,
                'order_status_summary',
                { orders: recentOrders }
            );
            return { orderFound: true, response };
        }

        return {
            orderFound: false,
            response: "I couldn't find any orders. Please provide your order number or place a new order."
        };
    }

    /**
     * Suggest products based on query
     */
    async suggestProducts(
        businessId: number,
        query: string
    ): Promise<{
        products: Product[];
        suggestions: string[];
        response: string;
    }> {
        const products = await this.productRepo
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.variants', 'variants')
            .where('product.business_id = :businessId', { businessId })
            .andWhere('product.is_active = :isActive', { isActive: true })
            .andWhere('(product.name LIKE :query OR product.description LIKE :query)', {
                query: `%${query}%`
            })
            .take(10)
            .getMany();

        if (products.length === 0) {
            return {
                products: [],
                suggestions: [],
                response: "I couldn't find products matching your search. Try different keywords or ask for our menu."
            };
        }

        // Generate AI response with product suggestions
        const productList = products.map(p => ({
            name: p.name,
            price: p.base_price,
            description: p.description,
            variants: p.variants.length
        }));

        const model = this.bytez.model('openai/gpt-3.5-turbo');

        const { error, output } = await model.run([
            {
                role: 'system',
                content: `You're a helpful sales assistant. Suggest products based on customer query.
Products found: ${JSON.stringify(productList)}
Be enthusiastic and helpful. Mention prices if available.`
            },
            {
                role: 'user',
                content: `I'm looking for: ${query}`
            }
        ]);

        if (error) {
            this.logger.error('Product suggestion AI error', error);
            throw new Error(error);
        }

        const aiResponse = output?.[0]?.content || '';

        return {
            products,
            suggestions: products.map(p => p.name),
            response: aiResponse
        };

    }

    /**
     * Handle FAQ and common queries
     */
    async handleFAQ(
        businessId: number,
        question: string
    ): Promise<{
        answer: string;
        confidence: number;
        relatedQuestions?: string[];
    }> {
        const business = await this.businessRepo.findOne({
            where: { id: businessId },
            relations: ['settings']
        });

        const faqContext = {
            businessName: business!.name,
            businessHours: business!.settings?.business_hours_start
                ? `${business!.settings.business_hours_start} - ${business!.settings.business_hours_end}`
                : '9 AM - 5 PM',
            deliveryOptions: await this.getDeliveryOptions(businessId),
            paymentOptions: await this.getPaymentOptions(businessId)
        };

        const model = this.bytez.model('openai/gpt-4.1');

        const { error, output } = await model.run([
            {
                role: 'system',
                content: `You're a customer service agent for ${faqContext.businessName}.
Business hours: ${faqContext.businessHours}
Delivery: ${JSON.stringify(faqContext.deliveryOptions)}
Payment: ${JSON.stringify(faqContext.paymentOptions)}

Answer common questions about ordering, delivery, payments, returns, etc.
If you don't know, suggest contacting support.`
            },
            {
                role: 'user',
                content: question
            }
        ]);

        if (error) {
            this.logger.error('FAQ AI error', error);
            throw new Error(error);
        }

        const answer = output?.[0]?.content || 'Please contact support for further assistance.';

        // Simple confidence heuristic
        const confidence = Math.min(0.9, answer.length / 500);

        return {
            answer,
            confidence,
            relatedQuestions: this.suggestRelatedQuestions(question),
        };

    }

    // ========== PRIVATE METHODS ==========

    private async getBusinessContext(
        businessId: number,
        customerPhone: string,
        customerName: string
    ) {
        const [business, customer, recentOrders, topProducts] = await Promise.all([
            this.businessRepo.findOne({
                where: { id: businessId },
                relations: ['settings']
            }),
            this.customerRepo.findOne({
                where: {
                    business: { id: businessId },
                    phone: customerPhone
                }
            }),
            this.orderRepo.find({
                where: {
                    business: { id: businessId },
                    customer: { phone: customerPhone }
                },
                order: { created_at: 'DESC' },
                take: 3
            }),
            this.productRepo.find({
                where: { business: { id: businessId }, is_active: true },
                take: 10,
                order: { created_at: 'DESC' }
            })
        ]);

        return {
            business: {
                name: business!.name,
                type: this.detectBusinessType(business!),
                settings: business!.settings
            },
            customer: {
                name: customerName,
                phone: customerPhone,
                hasPreviousOrders: recentOrders.length > 0,
                lastOrder: recentOrders[0]
            },
            products: topProducts.map((p: { name: any; base_price: any; }) => ({
                name: p.name,
                price: p.base_price
            })),
            timestamp: new Date().toISOString()
        };
    }

    private async getAIResponse(message: string, context: any) {
        const model = this.bytez.model('openai/gpt-4.1');

        const systemPrompt = `
${this.buildSystemPrompt(context)}

You must classify the customer's intent.

Return ONLY valid JSON in the following format:
{
  "intent": "greeting | order_placement | order_status | menu_request | product_inquiry | price_check | delivery_info | payment_info | complaint | return_request | help | other",
  "confidence": number,
  "suggestedActions": string[],
  "needsHuman": boolean
}

Rules:
- Do NOT include explanations
- Do NOT include markdown
- Output JSON only
`;

        const { error, output } = await model.run([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ]);

        if (error) {
            this.logger.error('Intent classification AI error', error);
            throw new Error(error);
        }

        const aiText = output?.[0]?.content || '{}';

        let intentData: {
            intent: string;
            confidence: number;
            suggestedActions?: string[];
            needsHuman?: boolean;
        };

        try {
            intentData = JSON.parse(aiText);
        } catch (e) {
            this.logger.error('Invalid intent JSON from AI', aiText);
            intentData = {
                intent: 'other',
                confidence: 0.3,
                suggestedActions: [],
                needsHuman: false
            };
        } 

        // Generate response based on intent 
        const response = await this.generateIntentResponse(
            intentData.intent,
            message,
            context
        );

        return {
            response,
            intent: intentData.intent,
            suggestedActions: intentData.suggestedActions || [],
            needsHuman: intentData.needsHuman || false
        };
    }


    private buildSystemPrompt(context: any): string {
        return `
        You are ${context.business!.name}'s WhatsApp AI assistant.
        
        Business Context:
        - Name: ${context.business!.name}
        - Customer: ${context.customer.name} ${context.customer.hasPreviousOrders ? '(returning customer)' : '(new customer)'}
        ${context.customer.lastOrder ? `- Last order: ${context.customer.lastOrder.order_number}` : ''}
        
        Available actions:
        1. Take new orders
        2. Check order status
        3. Show menu/products
        4. Answer FAQs
        5. Provide delivery info
        6. Escalate to human if needed
        
        Guidelines:
        - Be friendly and professional
        - Ask clarifying questions if order details are unclear
        - Suggest popular items if customer is unsure
        - Always confirm order details before finalizing
        - Provide estimated delivery times when known
        - Escalate complex issues to human support
        
        Current time: ${new Date().toLocaleString()}
        `;
    }

    private async generateIntentResponse(intent: string, message: string, context: any): Promise<string> {
        switch (intent) {
            case 'greeting':
                return context.business!.settings?.greeting_message
                    || `Hello ${context.customer.name}! Welcome to ${context.business!.name}. How can I help you today?`;

            case 'order_placement':
                return await this.generateOrderResponse(context.business!.name, message);

            case 'order_status':
                return "I'll check your order status. Please provide your order number or tell me what you're looking for.";

            case 'menu_request':
                return "Here's what we have available. What would you like to order?";

            case 'product_inquiry':
                return await this.generateProductInquiryResponse(context.business!.id, message);

            default:
                return context.business!.settings?.default_reply_message
                    || "I understand you're asking about something. Could you please provide more details so I can assist you better?";
        }
    }

    private async generateOrderResponse(businessName: string, message: string): Promise<string> {
        return `Great! I can help you place an order at ${businessName}. Please tell me what you'd like to order, or ask for our menu if you'd like to see options.`;
    }

    private async generateProductInquiryResponse(businessId: number, query: string): Promise<string> {
        const suggestions = await this.suggestProducts(businessId, query);
        return suggestions.response;
    }

    private extractOrderNumber(message: string): string | null {
        const patterns = [
            /ORD-[\d]+-[\d]+/i,
            /order\s*#?\s*([A-Z0-9\-]+)/i,
            /([A-Z]{3}-\d{8}-\d{4})/
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match) return match[1] || match[0];
        }
        return null;
    }

    private formatOrderStatus(order: Order): string {
        return `
Order: ${order.order_number}
Status: ${order.status}
Total: $${order.total_amount}
Items: ${order.items.length}
Delivery Status: ${order.delivery_status}
${order.tracking?.[0] ? `Tracking: ${order.tracking[0].carrier} - ${order.tracking[0].tracking_number}` : ''}
        `.trim();
    }

    private detectBusinessType(business: Business): string {
        // Simple detection based on name or categories
        const name = business!.name.toLowerCase();
        if (name.includes('restaurant') || name.includes('food') || name.includes('cafe')) return 'restaurant';
        if (name.includes('shop') || name.includes('store') || name.includes('mart')) return 'retail';
        if (name.includes('service') || name.includes('cleaning') || name.includes('repair')) return 'service';
        return 'general';
    }

    private async getDeliveryOptions(businessId: number): Promise<any[]> {
        // Implement based on BusinessDeliveryFee entity
        return [];
    }

    private async getPaymentOptions(businessId: number): Promise<any[]> {
        // Implement based on BusinessPaymentOption entity
        return [];
    }

    private suggestRelatedQuestions(question: string): string[] {
        const relatedMap = {
            'delivery': ['Delivery time?', 'Delivery areas?', 'Delivery cost?'],
            'payment': ['Payment methods?', 'Card payment?', 'COD available?'],
            'order': ['Track order?', 'Cancel order?', 'Modify order?'],
            'return': ['Return policy?', 'Refund process?', 'Exchange items?']
        };

        const lowerQuestion = question.toLowerCase();
        for (const [key, questions] of Object.entries(relatedMap)) {
            if (lowerQuestion.includes(key)) {
                return questions;
            }
        }
        return ['Business hours?', 'Contact support?', 'Menu/Products?'];
    }

    private buildResponsePrompt(context: {
        businessName: string;
        settings: BusinessSettings;
        customerOrders: Order[];
        intent: string;
        contextData: any;
        message: string;
    }): string {
        return `
        Generate a helpful response for ${context.businessName}.
        
        Customer Context:
        - Previous orders: ${context.customerOrders.length}
        - Current query: ${context.message}
        - Intent: ${context.intent}
        
        Business Style:
        - ${context.settings?.greeting_message ? 'Use friendly tone' : 'Be professional'}
        - Keep responses concise for WhatsApp
        - Include emojis if appropriate
        - Suggest next steps
        
        Additional Context: ${JSON.stringify(context.contextData)}
        
        Generate a natural, helpful response:
        `;
    }
}