import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    ParseIntPipe,
    UseGuards,
    Req,
    HttpCode,
    Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnerRoleGuard } from '../guards/owner-role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { DeliveryStatus, PaymentMethod, PaymentStatus } from '../../database/entities/order.entity';

interface UserRequest extends Request {
    user: JwtPayload;
}

@Controller('owner/orders')
@UseGuards(JwtAuthGuard, OwnerRoleGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    // 🟩 Create Order
    @Post()
    async createOrder(
        @Body() dto: any,
        @Req() req: UserRequest,
    ) {
        const businessId = req.user.sub;
        return this.ordersService.createOrder(businessId, dto);
    }

    // 🟦 Get All Orders
    @Get()
    async getAllOrders(@Req() req: UserRequest) {
        const businessId = req.user.sub;
        return this.ordersService.getAllOrders(businessId);
    }

    // Example: GET /owner/orders/filters?payment_status=paid&delivery_status=shipped&payment_method=card
    @Get('filters')
    async getOrdersWithFilters(
        @Req() req: UserRequest,
        @Query('payment_status') payment_status?: PaymentStatus,
        @Query('delivery_status') delivery_status?: DeliveryStatus,
        @Query('payment_method') payment_method?: PaymentMethod,
    ) {
        const businessId = req.user.sub;
        return this.ordersService.getOrdersWithFilters(businessId, payment_status, delivery_status, payment_method);
    }

    // 🟨 Get Single Order
    @Get(':id')
    async getOrder(@Param('id', ParseIntPipe) id: number) {
        return this.ordersService.getOrder(id);
    }

    // 🟧 Update Order (status, etc.)
    @Patch(':id')
    async updateOrder(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: any,
    ) {
        return this.ordersService.updateOrder(id, dto);
    }

    // 🟥 Delete Order
    @Delete(':id')
    @HttpCode(204)
    async deleteOrder(@Param('id', ParseIntPipe) id: number) {
        return this.ordersService.deleteOrder(id);
    }

    // 🟪 Get Orders by Customer
    @Get('customer/:customerId')
    async getOrdersByCustomer(@Param('customerId', ParseIntPipe) customerId: number) {
        return this.ordersService.getOrdersByCustomer(customerId);
    }

    @Patch(':id/payment-status')
    updatePaymentStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status') status: PaymentStatus,
    ) {
        return this.ordersService.updatePaymentStatus(id, status);
    }

    @Patch(':id/delivery-status')
    updateDeliveryStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status') status: DeliveryStatus,
    ) {
        return this.ordersService.updateDeliveryStatus(id, status);
    }

    // GET /owner/orders/pending-deposit
    @Get('pending-deposit')
    async getPendingDepositOrders(@Req() req: UserRequest) {
        const businessId = req.user.sub;
        return this.ordersService.getPendingDepositOrders(businessId);
    }

    // Fetch selected pending deposit orders
    @Post('pending-deposits/selected')
    async getSelectedPendingDeposits(
        @Body('orderIds') orderIds: number[] | number,
        @Req() req: UserRequest,
    ) {
        const businessId = req.user.sub;
        return this.ordersService.getPendingDepositOrdersByIds(businessId, orderIds);
    }

}
