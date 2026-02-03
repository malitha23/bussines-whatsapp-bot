import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderCancellation } from '../database/entities/order-cancellation.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderCancellation)
    private readonly orderCancellationRepository: Repository<OrderCancellation>,
  ) {}

 async getQuickStats(businessId: number, userId?: number) {
  const teamMembers = await this.userRepository
    .createQueryBuilder("user")
    .leftJoin("user.managedBusinesses", "managers")
    .leftJoin("managers.business", "managerBusiness")
    .leftJoin("user.staffAssignments", "staff")
    .leftJoin("staff.business", "staffBusiness")
    .where("managerBusiness.id = :businessId", { businessId })
    .orWhere("staffBusiness.id = :businessId", { businessId })
    .getCount();

  // -----------------------------
  // ORDER STATS
  // -----------------------------

  const totalOrders = await this.orderRepository.count({
    where: { business: { id: businessId } },
  });

  const pendingOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, delivery_status: 'pending' },
  });


  const pendingDeliveryPaid = await this.orderRepository.count({
    where: {
      business: { id: businessId },
      delivery_status: 'pending',
      payment_status: 'paid',
    },
  });

 
  const pendingDeliveryPendingPayment = await this.orderRepository.count({
    where: {
      business: { id: businessId },
      delivery_status: 'pending',
      payment_status: 'pending',
    },
  });

  
  const shippedOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, delivery_status: 'shipped' },
  });

  
  const deliveredOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, delivery_status: 'delivered' },
  });


  const failedPayments = await this.orderRepository.count({
    where: { business: { id: businessId }, payment_status: 'failed' },
  });

 
  const refundedPayments = await this.orderRepository.count({
    where: { business: { id: businessId }, payment_status: 'refunded' },
  });

  const pendingRefundRequests = await this.orderCancellationRepository
  .createQueryBuilder('cancellation')
  .leftJoin('cancellation.order', 'order') // join the related Order
  .where('order.businessId = :businessId', { businessId })
  .andWhere('cancellation.status = :status', { status: 'pending' })
  .getCount();

  // 🔥 7. COD orders
  const codOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, payment_method: 'cod' },
  });

  // 🔥 8. Card orders
  const cardOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, payment_method: 'card' },
  });

  // 🔥 9. Deposit orders
  const depositOrders = await this.orderRepository.count({
    where: { business: { id: businessId }, payment_method: 'deposit' },
  });

  const messages = 0;

  return {
    teamMembers,
    totalOrders,
    pendingOrders,
    pendingDeliveryPaid,
    pendingDeliveryPendingPayment,
    shippedOrders,
    deliveredOrders,
    failedPayments,
    refundedPayments,
    pendingRefundRequests,
    codOrders,
    cardOrders,
    depositOrders,
    messages,
  };
}
}