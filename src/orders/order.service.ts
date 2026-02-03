import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { DeliveryStatus, Order, OrderStatus } from '../database/entities/order.entity';
import { Customer } from '../database/entities/customer.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { ProductVariant } from '../database/entities/product-variant.entity';
import { Business } from '../database/entities/business.entity';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { OrderCancellation } from '../database/entities/order-cancellation.entity';
import { TeamActivityService } from '../team-activity/team-activity.service';
import { OrderTracking } from '../database/entities/order-tracking.entity';
import { UpdateTrackingDto } from './dro/TrackingDto';
import { OrdersService } from '../Owner/orders/orders.service';
import { CancellationQueryDto } from './dro/CancellationsDto';

enum PaymentStatus {
    pending = 'pending',
    paid = 'paid',
    failed = 'failed',
    refund = 'refund',
    partially_refunded = 'partially_refunded'
}


@Injectable()
export class OrderService {
    constructor(
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,

        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,

        @InjectRepository(OrderItem)
        private readonly orderItemRepo: Repository<OrderItem>,

        @InjectRepository(ProductVariant)
        private readonly variantRepo: Repository<ProductVariant>,

        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,

        @InjectRepository(OrderCancellation)
        private readonly cancellationRepo: Repository<OrderCancellation>,

        @InjectRepository(User)
        private readonly userRepo: Repository<User>,

        @InjectRepository(Manager)
        private readonly managerRepo: Repository<Manager>,

        @InjectRepository(Staff)
        private readonly staffRepo: Repository<Staff>,

        @InjectRepository(OrderTracking)
        private readonly trackingRepo: Repository<OrderTracking>,

        private readonly activityService: TeamActivityService,
        private readonly ownerOrderService: OrdersService
    ) { }

    // -------------------------------------------------------
    // Get Business by user
    // -------------------------------------------------------
    private async getBusinessByUser(email: string): Promise<{ businessId: number, business: Business }> {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user) throw new NotFoundException('User not found');

        let business;

        if (user.role_type === 'owner') {
            business = await this.businessRepo.findOne({
                where: { owner: { id: user.id } },
                relations: ['owner'],
            });
        } else if (user.role_type === 'manager') {
            const manager = await this.managerRepo.findOne({
                where: { user: { id: user.id } },
                relations: ['business'],
            });
            business = manager?.business;
        } else if (user.role_type === 'staff') {
            const staff = await this.staffRepo.findOne({
                where: { user: { id: user.id } },
                relations: ['business'],
            });
            business = staff?.business;
        }

        if (!business) throw new NotFoundException('Business not found for this user');
        return { businessId: business.id, business };
    }

    // -------------------------------------------------------
    // GET ALL ORDERS WITH FILTERS
    // -------------------------------------------------------
    async getAllOrders(email: string, filters: any) {
        const { businessId } = await this.getBusinessByUser(email);

        // Extract and normalize query params
        const pageNumber = Number(filters.page) || 1;
        const limitNumber = Number(filters.limit) || 20;
        const status = filters.status || null;
        const paymentStatus = filters.paymentStatus || null;
        const deliveryStatus = filters.deliveryStatus || null;
        const paymentMethod = filters.paymentMethod || null;
        const search = filters.search || null;
        const startDate = filters.startDate || null;
        const endDate = filters.endDate || null;
        const sortBy = filters.sortBy || 'created_at';
        const sortOrder = (filters.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const skip = (pageNumber - 1) * limitNumber;

        // Build query
        const query = this.orderRepo.createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoinAndSelect('order.items', 'items')
            .leftJoinAndSelect('items.variant', 'variant')
            .leftJoinAndSelect('variant.images', 'images')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoin('order.business', 'business')
            .where('business.id = :businessId', { businessId });

        // Filters
        if (status) query.andWhere('order.status = :status', { status });
        if (paymentStatus) query.andWhere('order.payment_status = :paymentStatus', { paymentStatus });
        if (deliveryStatus) query.andWhere('order.delivery_status = :deliveryStatus', { deliveryStatus });
        if (paymentMethod) query.andWhere('order.payment_method = :paymentMethod', { paymentMethod });

        // Date range filter
        if (startDate && endDate) {
            query.andWhere('order.created_at BETWEEN :startDate AND :endDate', {
                startDate: new Date(startDate),
                endDate: new Date(endDate),
            });
        }

        // Search filter
        if (search) {
            const searchTerm = `%${search}%`;
            query.andWhere(
                '(customer.name LIKE :search OR customer.phone LIKE :search OR CAST(order.id AS CHAR) LIKE :search)',
                { search: searchTerm },
            );
        }

        // Sorting
        const validSortFields = ['created_at', 'total_amount', 'status'];
        const orderBy = validSortFields.includes(sortBy) ? `order.${sortBy}` : 'order.created_at';
        query.orderBy(orderBy, sortOrder);

        // Pagination
        query.skip(skip).take(limitNumber);

        const [orders, total] = await query.getManyAndCount();
        const pendingCount = await this.orderRepo.createQueryBuilder('order')
            .leftJoin('order.business', 'business')
            .where('business.id = :businessId', { businessId })
            .andWhere('order.status = :status', { status: 'pending' })
            .getCount();
        const countCancelRequest = await this.cancellationRepo.createQueryBuilder('cancellation')
            .leftJoin('cancellation.order', 'order')
            .leftJoin('order.business', 'business')
            .where('cancellation.status = :status', { status: 'pending' })
            .andWhere('business.id = :businessId', { businessId })
            .getCount();


        return {
            orders,
            meta: {
                total,
                page: pageNumber,
                limit: limitNumber,
                totalPages: Math.ceil(total / limitNumber),
                pendingCount,
                countCancelRequest
            },
        };
    }


    // -------------------------------------------------------
    // GET ORDER BY ID
    // -------------------------------------------------------
    async getOrderById(email: string, orderId: number) {
        const { businessId } = await this.getBusinessByUser(email);

        const order = await this.orderRepo.findOne({
            where: { id: orderId, business: { id: businessId } },
            relations: [
                'customer',
                'items',
                'items.variant',
                'items.variant.product',
                'business'
            ],
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }

    async deleteOrder(email: string, orderId: number) {
        const { business, businessId } = await this.getBusinessByUser(email);

        const order = await this.orderRepo.findOne({
            where: { id: orderId, business: { id: businessId } },
            relations: ['items', 'items.variant']
        });

        if (!order) throw new NotFoundException('Order not found');

        // Optional: Restore stock if order was paid
        if (order.payment_status === 'paid') {
            // await this.handleOrderRefund(orderId);
        }

        // Delete order items
        if (order.items && order.items.length > 0) {
            await this.orderItemRepo.remove(order.items);
        }

        // Delete the order
        await this.orderRepo.remove(order);

        // ✅ Fetch user entity
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user) throw new NotFoundException('User not found');

        // Log activity with proper user entity
        await this.activityService.logActivity(user, business, `deleted order #${orderId}`);

        return { id: orderId };
    }



    // -------------------------------------------------------
    // GET ORDER TRAKING BY ID
    // -------------------------------------------------------
    async upsertTracking(
        orderId: number,
        dto: UpdateTrackingDto,
    ): Promise<OrderTracking> {

        const order = await this.orderRepo.findOne({
            where: { id: orderId },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }


        let tracking = await this.trackingRepo.findOne({
            where: { order: { id: orderId } },
            relations: ['order'],
        });


        if (!tracking) {
            tracking = this.trackingRepo.create({
                order,
                ...dto,
            });
        } else {
            Object.assign(tracking, dto);
        }

        await this.ownerOrderService.sendTrackingUpdate(orderId, dto);

        return await this.trackingRepo.save(tracking);
    }

    // -------------------------------------------------------
    // GET ORDER STATISTICS
    // -------------------------------------------------------
    async getOrderStats(email: string, period: string = 'month') {
        const { businessId } = await this.getBusinessByUser(email);
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                break;
            case 'year':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        }

        // Total orders count
        const totalOrders = await this.orderRepo.count({
            where: { business: { id: businessId } }
        });

        // Revenue statistics
        const revenueResult = await this.orderRepo
            .createQueryBuilder('order')
            .select('SUM(order.total_amount)', 'totalRevenue')
            .addSelect('SUM(order.delivery_fee)', 'totalDeliveryFees')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .getRawOne();

        // Recent orders (last period)
        const recentOrders = await this.orderRepo.count({
            where: {
                business: { id: businessId },
                created_at: MoreThanOrEqual(startDate)
            }
        });

        // Status breakdown
        const statusBreakdown = await this.orderRepo
            .createQueryBuilder('order')
            .select('order.status', 'status')
            .addSelect('COUNT(order.id)', 'count')
            .where('order.businessId = :businessId', { businessId })
            .groupBy('order.status')
            .getRawMany();

        // Payment method breakdown
        const paymentMethodBreakdown = await this.orderRepo
            .createQueryBuilder('order')
            .select('order.payment_method', 'method')
            .addSelect('COUNT(order.id)', 'count')
            .addSelect('SUM(order.total_amount)', 'amount')
            .where('order.businessId = :businessId', { businessId })
            .groupBy('order.payment_method')
            .getRawMany();

        // Pending payments
        const pendingPayments = await this.orderRepo.count({
            where: {
                business: { id: businessId },
                payment_status: 'pending'
            }
        });

        return {
            stats: {
                totalOrders,
                totalRevenue: Number(revenueResult.totalRevenue) || 0,
                totalDeliveryFees: Number(revenueResult.totalDeliveryFees) || 0,
                recentOrders,
                pendingPayments
            },
            breakdown: {
                status: statusBreakdown,
                paymentMethods: paymentMethodBreakdown
            }
        };
    }

    async updateOrderStatus(email: string, orderId: number, statusData: any) {
        const { business, businessId } = await this.getBusinessByUser(email);
        const user = await this.userRepo.findOne({ where: { email } });

        const order = await this.orderRepo.findOne({
            where: { id: orderId, business: { id: businessId } },
            relations: ['customer']
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        const oldStatus = order.status;
        const oldPaymentStatus = order.payment_status;
        const oldDeliveryStatus = order.delivery_status;

        // --------------------
        // EXISTING CODE (unchanged)
        // --------------------
        if (statusData.status) order.status = statusData.status;
        if (statusData.payment_status) order.payment_status = statusData.payment_status;
        if (statusData.delivery_status) order.delivery_status = statusData.delivery_status;
        if(statusData.status === 'paid') order.payment_status = 'paid';
        const allowedStatuses: OrderStatus[] = [
            'pending',
            'confirmed',
            'paid',
            'processing',
            'shipped',
            'out_for_delivery',
            'delivered',
            'return_requested',
            'returned',
            'canceled',
            'refunded',
            'partially_refunded',
        ];

    
        if (statusData.status) {
            if (allowedStatuses.includes(statusData.status)) {
                this.ownerOrderService.updateOrderStatus(orderId, statusData.status, statusData.notes);
            }
        }

        if (statusData.payment_status === 'refunded' || statusData.payment_status === 'paid') {
            await this.ownerOrderService.updatePaymentStatus(orderId, statusData.payment_status);
        }

        if (order.payment_method === 'cod' && (statusData.status === 'confirmed' || statusData.status === 'canceled' || statusData.status === 'returned')) {
           
            await this.ownerOrderService.updateCodInventory(orderId, order.status);
        }

        const updatedOrder = await this.orderRepo.save(order);

        // Log activity (unchanged)
        const changes: string[] = [];
        if (oldStatus !== updatedOrder.status)
            changes.push(`status from "${oldStatus}" to "${updatedOrder.status}"`);

        if (oldPaymentStatus !== updatedOrder.payment_status)
            changes.push(`payment status from "${oldPaymentStatus}" to "${updatedOrder.payment_status}"`);

        if (oldDeliveryStatus !== updatedOrder.delivery_status)
            changes.push(`delivery status from "${oldDeliveryStatus}" to "${updatedOrder.delivery_status}"`);

        if (changes.length > 0) {
            await this.activityService.logActivity(
                user!,
                business,
                `updated order #${orderId}: ${changes.join(', ')}`,
            );
        }

        return updatedOrder;
    }

    // -------------------------------------------------------
    // CREATE ORDER CANCELLATION REQUEST
    // -------------------------------------------------------
    async createCancellationRequest(email: string, orderId: number, reason: string) {
        const { business, businessId } = await this.getBusinessByUser(email);
        const user = await this.userRepo.findOne({ where: { email } });

        const order = await this.orderRepo.findOne({
            where: { id: orderId, business: { id: businessId } },
            relations: ['customer']
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        // Check if cancellation already exists
        const existingCancellation = await this.cancellationRepo.findOne({
            where: { order: { id: orderId } }
        });

        if (existingCancellation) {
            throw new BadRequestException('Cancellation request already exists for this order');
        }

        // Create cancellation request
        const cancellation = this.cancellationRepo.create({
            order,
            reason,
            status: 'pending'
        });

        const savedCancellation = await this.cancellationRepo.save(cancellation);

        // Log activity
        await this.activityService.logActivity(
            user!,
            business,
            `created cancellation request for order #${orderId}: ${reason}`,
        );

        return savedCancellation;
    }

    // -------------------------------------------------------
    // PROCESS CANCELLATION REQUEST
    // -------------------------------------------------------
    async processCancellationRequest(email: string, cancellationId: number, status: 'approved' | 'rejected') {
        const { business, businessId } = await this.getBusinessByUser(email);
        const user = await this.userRepo.findOne({ where: { email } });

        const cancellation = await this.cancellationRepo.findOne({
            where: { id: cancellationId },
            relations: ['order', 'order.business']
        });

        if (!cancellation) {
            throw new NotFoundException('Cancellation request not found');
        }

        // Check if order belongs to user's business
        if (cancellation.order.business.id !== businessId) {
            throw new NotFoundException('Cancellation request not found');
        }

        cancellation.status = status;
        const updatedCancellation = await this.cancellationRepo.save(cancellation);

        // If approved, cancel the order and restore stock
        if (status === 'approved') {
            const order = await this.orderRepo.findOne({
                where: { id: cancellation.order.id },
                relations: ['items', 'items.variant']
            });

            if (order) {
                order.status = 'canceled';
                order.payment_status = order.payment_status === 'paid' ? 'refunded' : order.payment_status;
                await this.orderRepo.save(order);

                // Restore stock
                await this.ownerOrderService.updatePaymentStatus(order.id, 'refunded');
            }
        }

        // Log activity
        await this.activityService.logActivity(
            user!,
            business,
            `${status} cancellation request for order #${cancellation.order.id}`,
        );

        return updatedCancellation;
    }

    // ------------------------------------------------------- 
    // GET CANCELLATION REQUESTS
    // -------------------------------------------------------
    async getCancellationRequests(email: string, filters: CancellationQueryDto) {
        try {
            const { businessId } = await this.getBusinessByUser(email);

            // ------------------------
            // Pagination with validation
            // ------------------------
            const page = Number(filters.page) || 1;
            const limit = Number(filters.limit) || 10; // Max 100 per page
            const skip = (page - 1) * limit;

            const sortBy = filters.sortBy || 'created_at';
            const sortOrder = (filters.sortOrder || 'DESC').toUpperCase() as 'ASC' | 'DESC';

            // ------------------------
            // Base Query
            // ------------------------
            const query = this.cancellationRepo
                .createQueryBuilder('cancellation')
                .leftJoinAndSelect('cancellation.order', 'order')
                .leftJoinAndSelect('order.customer', 'customer')
                .leftJoinAndSelect('order.items', 'items')
                .leftJoinAndSelect('items.variant', 'variant')
                .leftJoinAndSelect('variant.product', 'product')
                .leftJoinAndSelect('variant.images', 'images')
                .leftJoin('order.business', 'business')
                .where('business.id = :businessId', { businessId });

            // ------------------------
            // Filters with validation
            // ------------------------
            if (filters.status) {
                const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
                if (validStatuses.includes(filters.status.toLowerCase())) {
                    query.andWhere('cancellation.status = :status', {
                        status: filters.status.toLowerCase()
                    });
                }
            }

            if (filters.orderId) {
                const orderId = Number(filters.orderId);
                if (!isNaN(orderId) && orderId > 0) {
                    query.andWhere('order.id = :orderId', { orderId });
                }
            }

            if (filters.search) {
                const search = `%${filters.search}%`;
                query.andWhere(
                    `(
                    customer.name LIKE :search OR
                    customer.phone LIKE :search OR
                    CAST(order.id AS CHAR) LIKE :search
                )`,
                    { search }
                );
            }

            if (filters.startDate && filters.endDate) {
                try {
                    const startDate = new Date(filters.startDate);
                    const endDate = new Date(filters.endDate);

                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                        // Set end date to end of day
                        endDate.setHours(23, 59, 59, 999);

                        query.andWhere('cancellation.created_at BETWEEN :start AND :end', {
                            start: startDate,
                            end: endDate,
                        });
                    }
                } catch (error) {
                    // Log error but don't apply date filter
                    console.error('Invalid date format:', error);
                }
            }

            // ------------------------
            // Sorting with validation
            // ------------------------
            const allowedSortFields = ['created_at', 'status'];
            const orderByField = allowedSortFields.includes(sortBy)
                ? `cancellation.${sortBy}`
                : 'cancellation.created_at';

            query.orderBy(orderByField, sortOrder);

            // ------------------------
            // Pagination
            // ------------------------
            query.skip(skip).take(limit);

            // ------------------------
            // Execute with error handling
            // ------------------------
            const [data, total] = await query.getManyAndCount();

            return {
                data,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page < Math.ceil(total / limit),
                    hasPrevPage: page > 1,
                },
            };
        } catch (error) {
            console.error('Error fetching cancellation requests:', error);
            throw new InternalServerErrorException('Failed to fetch cancellation requests');
        }
    }



    // -------------------------------------------------------
    // GET DAILY SALES REPORT
    // -------------------------------------------------------
    async getDailySalesReport(email: string, days: number = 7) {
        const { businessId } = await this.getBusinessByUser(email);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await this.orderRepo
            .createQueryBuilder('order')
            .select('DATE(order.created_at)', 'date')
            .addSelect('COUNT(order.id)', 'orderCount')
            .addSelect('SUM(order.total_amount)', 'totalAmount')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .groupBy('DATE(order.created_at)')
            .orderBy('date', 'ASC')
            .getRawMany();

        return result;
    }

    // -------------------------------------------------------
    // GET TOP SELLING PRODUCTS
    // -------------------------------------------------------
    async getTopSellingProducts(email: string, limit: number = 10) {
        const { businessId } = await this.getBusinessByUser(email);

        const result = await this.orderItemRepo
            .createQueryBuilder('item')
            .leftJoinAndSelect('item.order', 'order')
            .leftJoinAndSelect('item.variant', 'variant')
            .leftJoinAndSelect('variant.product', 'product')
            .select('product.name', 'productName')
            .addSelect('variant.variant_name', 'variantName')
            .addSelect('SUM(item.quantity)', 'totalQuantity')
            .addSelect('SUM(item.total_price)', 'totalRevenue')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .groupBy('variant.id, product.id')
            .orderBy('totalQuantity', 'DESC')
            .limit(limit)
            .getRawMany();

        return result;
    }

    // -------------------------------------------------------
    // GET CUSTOMER ORDER HISTORY
    // -------------------------------------------------------
    async getCustomerOrderHistory(email: string, customerId: number) {
        const { businessId } = await this.getBusinessByUser(email);

        const orders = await this.orderRepo.find({
            where: {
                customer: { id: customerId },
                business: { id: businessId }
            },
            relations: ['items', 'items.variant'],
            order: { created_at: 'DESC' }
        });

        const customer = await this.customerRepo.findOne({
            where: { id: customerId, business: { id: businessId } }
        });

        if (!customer) {
            throw new NotFoundException('Customer not found');
        }

        // Calculate customer stats
        const totalOrders = orders.length;
        const totalSpent = orders
            .filter(order => order.payment_status === 'paid')
            .reduce((sum, order) => sum + Number(order.total_amount), 0);

        return {
            customer,
            orders,
            stats: {
                totalOrders,
                totalSpent
            }
        };
    }

    // -------------------------------------------------------
    // EXPORT ORDERS TO CSV
    // -------------------------------------------------------
    async exportOrders(email: string, filters: any) {
        const { businessId } = await this.getBusinessByUser(email);
        const { orders } = await this.getAllOrders(email, { ...filters, limit: 10000 });

        // Format orders for CSV
        const csvData = orders.map(order => ({
            'Order ID': order.id,
            'Customer Name': order.customer?.name || '',
            'Customer Phone': order.customer?.phone || '',
            'Total Amount': order.total_amount,
            'Delivery Fee': order.delivery_fee,
            'Payment Method': order.payment_method,
            'Payment Status': order.payment_status,
            'Delivery Status': order.delivery_status,
            'Order Status': order.status,
            'Date': order.created_at,
            'Items Count': order.items?.length || 0
        }));

        return csvData;
    }

    // -------------------------------------------------------
    // GET DASHBOARD ANALYTICS
    // -------------------------------------------------------
    async getDashboardAnalytics(email: string): Promise<any> {
        const { businessId } = await this.getBusinessByUser(email);
        const now = new Date();
        console.log('Dateeeeeeeeeeeeeeeeeeeeeeeeeeeeee ' + now);
        // -------------------
        // TIME PERIODS
        // -------------------
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const dayOfWeek = todayStart.getDay();
        const weekStart = new Date(todayStart);
        weekStart.setDate(todayStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

        // -------------------
        // HELPER FUNCTIONS
        // -------------------
        const getOrdersAndRevenue = async (start: Date, end: Date) => {
            const result = await this.orderRepo
                .createQueryBuilder('order')
                .select([
                    'COUNT(order.id) as orders',
                    'SUM(order.total_amount) as revenue',
                    'AVG(order.total_amount) as average'
                ])
                .where('order.businessId = :businessId', { businessId })
                .andWhere('order.payment_status = :paid', { paid: 'paid' })
                .andWhere('order.created_at BETWEEN :start AND :end', { start, end })
                .getRawOne();

            return {
                orders: Number(result?.orders) || 0,
                revenue: Number(result?.revenue) || 0,
                averageOrderValue: Number(result?.average) || 0
            };
        };

        const getPending = async (start: Date, end: Date) => {
            const [orders, deliveries, payments] = await Promise.all([
                this.orderRepo.count({ where: { business: { id: businessId }, status: 'pending', created_at: Between(start, end) } }),
                this.orderRepo.count({ where: { business: { id: businessId }, delivery_status: 'pending', created_at: Between(start, end) } }),
                this.orderRepo.count({ where: { business: { id: businessId }, payment_status: 'pending', created_at: Between(start, end) } }),
            ]);
            return { orders, deliveries, payments };
        };

        const getPaymentMethods = async (start: Date, end: Date) => {
            const results = await this.orderRepo
                .createQueryBuilder('order')
                .select([
                    'order.payment_method as method',
                    'COUNT(order.id) as count',
                    'SUM(order.total_amount) as amount'
                ])
                .where('order.businessId = :businessId', { businessId })
                .andWhere('order.payment_status = :paid', { paid: 'paid' })
                .andWhere('order.created_at BETWEEN :start AND :end', { start, end })
                .groupBy('order.payment_method')
                .getRawMany();

            const paymentMethods = { cod: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, deposit: { count: 0, amount: 0 } };
            results.forEach(r => {
                const method = r.method.toLowerCase() as keyof typeof paymentMethods;
                if (paymentMethods[method]) {
                    paymentMethods[method].count = Number(r.count) || 0;
                    paymentMethods[method].amount = Number(r.amount) || 0;
                }
            });
            return paymentMethods;
        };

        const getPaymentBreakdown = async (start: Date, end: Date) => {
            const orders = await this.orderRepo.find({
                where: { business: { id: businessId }, created_at: Between(start, end) },
                select: ['payment_method', 'payment_status', 'payment_receipt_url']
            });

            const codOrders = orders.filter(o => o.payment_method === 'cod');
            const cardOrders = orders.filter(o => o.payment_method === 'card');
            const depositOrders = orders.filter(o => o.payment_method === 'deposit');

            return {
                cod: { total: codOrders.length, pendingCollection: codOrders.filter(o => o.payment_status === 'pending').length, collected: codOrders.filter(o => o.payment_status === 'paid').length },
                card: { total: cardOrders.length, paid: cardOrders.filter(o => o.payment_status === 'paid').length },
                deposit: { total: depositOrders.length, awaitingReceipt: depositOrders.filter(o => !o.payment_receipt_url).length, verified: depositOrders.filter(o => o.payment_receipt_url).length },
            };
        };

        const getOrderStatusWithPayment = async (start: Date, end: Date) => {
            const results = await this.orderRepo
                .createQueryBuilder('order')
                .select('order.status', 'status')
                .addSelect('order.payment_status', 'payment_status')
                .addSelect('COUNT(order.id)', 'count')
                .where('order.businessId = :businessId', { businessId })
                .andWhere('order.created_at BETWEEN :start AND :end', { start, end })
                .groupBy('order.status')
                .addGroupBy('order.payment_status')
                .getRawMany();

            const orderStatus = {
                pending: 0,
                confirmed: 0,
                paid: 0,
                processing: 0,
                shipped: 0,
                delivered: 0,
                canceled: 0,
                refunded: 0
            };

            // Initialize all payment statuses
            const paymentStatus: Record<PaymentStatus, number> = {
                pending: 0,
                paid: 0,
                failed: 0,
                refund: 0,
                partially_refunded: 0
            };

            results.forEach(r => {
                const statusKey = r.status?.toLowerCase() as keyof typeof orderStatus;
                const paymentKey = r.payment_status as PaymentStatus;

                if (statusKey && orderStatus[statusKey] !== undefined) {
                    orderStatus[statusKey] += Number(r.count) || 0;
                }

                if (paymentKey && paymentStatus[paymentKey] !== undefined) {
                    paymentStatus[paymentKey] += Number(r.count) || 0;
                }
            });

            return { orderStatus, paymentStatus };
        };


        const getDailySales = async (start: Date, end: Date) => {
            const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            const sales = [];
            for (let i = 0; i < days; i++) {
                const dayStart = new Date(start);
                dayStart.setDate(start.getDate() + i);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayStart.getDate() + 1);

                const result = await this.orderRepo
                    .createQueryBuilder('order')
                    .select(['COUNT(order.id) as orders', 'SUM(order.total_amount) as revenue'])
                    .where('order.businessId = :businessId', { businessId })
                    .andWhere('order.payment_status = :paid', { paid: 'paid' })
                    .andWhere('order.created_at BETWEEN :start AND :end', { start: dayStart, end: dayEnd })
                    .getRawOne();

                sales.push({ date: dayStart.toISOString().split('T')[0], orders: Number(result?.orders) || 0, revenue: Number(result?.revenue) || 0 });
            }
            return sales;
        };

        // -------------------
        // FETCH DATA FOR EACH PERIOD
        // -------------------
        const todayMetrics = await getOrdersAndRevenue(todayStart, todayEnd);
        const weekMetrics = await getOrdersAndRevenue(weekStart, weekEnd);
        const monthMetrics = await getOrdersAndRevenue(monthStart, monthEnd);
        const yearMetrics = await getOrdersAndRevenue(yearStart, yearEnd);

        const todayPending = await getPending(todayStart, todayEnd);
        const weekPending = await getPending(weekStart, weekEnd);
        const monthPending = await getPending(monthStart, monthEnd);
        const yearPending = await getPending(yearStart, yearEnd);

        const todayPaymentMethods = await getPaymentMethods(todayStart, todayEnd);
        const weekPaymentMethods = await getPaymentMethods(weekStart, weekEnd);
        const monthPaymentMethods = await getPaymentMethods(monthStart, monthEnd);
        const yearPaymentMethods = await getPaymentMethods(yearStart, yearEnd);

        const todayPaymentBreakdown = await getPaymentBreakdown(todayStart, todayEnd);
        const weekPaymentBreakdown = await getPaymentBreakdown(weekStart, weekEnd);
        const monthPaymentBreakdown = await getPaymentBreakdown(monthStart, monthEnd);
        const yearPaymentBreakdown = await getPaymentBreakdown(yearStart, yearEnd);

        const todayStatus = await getOrderStatusWithPayment(todayStart, todayEnd);
        const weekStatus = await getOrderStatusWithPayment(weekStart, weekEnd);
        const monthStatus = await getOrderStatusWithPayment(monthStart, monthEnd);
        const yearStatus = await getOrderStatusWithPayment(yearStart, yearEnd);


        const todayTrends = await getDailySales(todayStart, todayEnd);
        const weekTrends = await getDailySales(weekStart, weekEnd);
        const monthTrends = await getDailySales(monthStart, monthEnd);
        const yearTrends = await getDailySales(yearStart, yearEnd);

        // -------------------
        // FINAL RESPONSE
        // -------------------
        return {
            today: { metrics: todayMetrics, pending: todayPending, paymentMethods: todayPaymentMethods, paymentBreakdown: todayPaymentBreakdown, orderStatus: todayStatus.orderStatus, paymentStatus: todayStatus.paymentStatus, trends: todayTrends },
            week: { metrics: weekMetrics, pending: weekPending, paymentMethods: weekPaymentMethods, paymentBreakdown: weekPaymentBreakdown, orderStatus: weekStatus.orderStatus, paymentStatus: weekStatus.paymentStatus, trends: weekTrends },
            month: { metrics: monthMetrics, pending: monthPending, paymentMethods: monthPaymentMethods, paymentBreakdown: monthPaymentBreakdown, orderStatus: monthStatus.orderStatus, paymentStatus: monthStatus.paymentStatus, trends: monthTrends },
            year: { metrics: yearMetrics, pending: yearPending, paymentMethods: yearPaymentMethods, paymentBreakdown: yearPaymentBreakdown, orderStatus: yearStatus.orderStatus, paymentStatus: yearStatus.paymentStatus, trends: yearTrends }
        };
    }


    async getChartsData(
        email: string,
        period: 'today' | 'week' | 'month' | 'year' = 'month'
    ) {
        const { businessId } = await this.getBusinessByUser(email);
        const now = new Date();
        let startDate: Date;

        // Determine start date based on period
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                const dayOfWeek = now.getDay();
                startDate = new Date(now);
                startDate.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }
        const endDate = now;

        // -------------------------------
        // Payment Methods Chart
        // -------------------------------
        const paymentMethodsRaw = await this.orderRepo
            .createQueryBuilder('order')
            .select('order.payment_method', 'method')
            .addSelect('COUNT(order.id)', 'count')
            .addSelect('SUM(order.total_amount)', 'amount')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .andWhere('order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
            .groupBy('order.payment_method')
            .getRawMany();

        const paymentMethods = { card: { count: 0, amount: 0 }, cod: { count: 0, amount: 0 }, deposit: { count: 0, amount: 0 } };
        paymentMethodsRaw.forEach(r => {
            const method = r.method.toLowerCase() as keyof typeof paymentMethods;
            if (paymentMethods[method]) {
                paymentMethods[method].count = Number(r.count) || 0;
                paymentMethods[method].amount = Number(r.amount) || 0;
            }
        });

        // -------------------------------
        // Order Status Chart
        // -------------------------------
        const statusRaw = await this.orderRepo
            .createQueryBuilder('order')
            .select('order.status', 'status')
            .addSelect('COUNT(order.id)', 'count')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
            .groupBy('order.status')
            .getRawMany();

        const orderStatus: Record<string, number> = {};
        statusRaw.forEach(r => {
            orderStatus[r.status] = Number(r.count) || 0;
        });

        // -------------------------------
        // Top Selling Products Chart
        // -------------------------------
        const topProducts = await this.orderItemRepo
            .createQueryBuilder('item')
            .leftJoin('item.order', 'order')
            .leftJoin('item.variant', 'variant')
            .leftJoin('variant.product', 'product')
            .select('product.name', 'productName')
            .addSelect('variant.variant_name', 'variantName')
            .addSelect('SUM(item.quantity)', 'totalQuantity')
            .addSelect('SUM(item.total_price)', 'totalRevenue')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .andWhere('order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
            .groupBy('variant.id, product.id')
            .orderBy('totalQuantity', 'DESC')
            .limit(10)
            .getRawMany();

        // -------------------------------
        // Customers Orders Count Chart
        // -------------------------------
        const customerOrdersRaw = await this.orderRepo
            .createQueryBuilder('order')
            .leftJoin('order.customer', 'customer')
            .select('customer.name', 'customerName')
            .addSelect('COUNT(order.id)', 'ordersCount')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
            .groupBy('customer.id')
            .orderBy('ordersCount', 'DESC')
            .limit(10)
            .getRawMany();

        // -------------------------------
        // Revenue vs Delivery Fee Chart
        // -------------------------------
        const revenueVsDelivery = await this.orderRepo
            .createQueryBuilder('order')
            .select('SUM(order.total_amount)', 'totalRevenue')
            .addSelect('SUM(order.delivery_fee)', 'totalDeliveryFee')
            .where('order.businessId = :businessId', { businessId })
            .andWhere('order.payment_status = :status', { status: 'paid' })
            .andWhere('order.created_at BETWEEN :start AND :end', { start: startDate, end: endDate })
            .getRawOne();

        return {
            paymentMethods,
            orderStatus,
            topProducts,
            customerOrders: customerOrdersRaw,
            revenueVsDelivery: {
                totalRevenue: Number(revenueVsDelivery?.totalRevenue) || 0,
                totalDeliveryFee: Number(revenueVsDelivery?.totalDeliveryFee) || 0
            }
        };
    }


}