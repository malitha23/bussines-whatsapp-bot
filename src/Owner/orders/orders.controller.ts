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
import { RoleGuard, Roles } from '../../guards/role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { DeliveryStatus, PaymentMethod, PaymentStatus } from '../../database/entities/order.entity';

interface UserRequest extends Request {
    user: JwtPayload;
}

@Controller('owner/orders')
@UseGuards(JwtAuthGuard, RoleGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    // 🟩 Create Order
    @Post()
    @Roles('owner', 'manager', 'staff')
    async createOrder(
        @Body() dto: any,
        @Req() req: UserRequest,
    ) {
        const businessId = req.user.sub;
        return this.ordersService.createOrder(businessId, dto);
    }

    // 🟦 Get All Orders
    @Get()
    @Roles('owner', 'manager', 'staff')
    async getAllOrders(@Req() req: UserRequest) {
        const businessId = req.user.sub;
        return this.ordersService.getAllOrders(businessId);
    }

    // Example: GET /owner/orders/filters?payment_status=paid&delivery_status=shipped&payment_method=card
    @Get('filters')
    @Roles('owner', 'manager', 'staff')
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
    @Roles('owner', 'manager', 'staff')
    async getOrder(@Param('id', ParseIntPipe) id: number) {
        return this.ordersService.getOrder(id);
    }

    // 🟧 Update Order (status, etc.)
    @Patch(':id')
    @Roles('owner', 'manager', 'staff')
    async updateOrder(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: any,
    ) {
        return this.ordersService.updateOrder(id, dto);
    }

    // 🟥 Delete Order
    @Delete(':id')
    @Roles('owner', 'manager', 'staff')
    @HttpCode(204)
    async deleteOrder(@Param('id', ParseIntPipe) id: number) {
        return this.ordersService.deleteOrder(id);
    }

    // 🟪 Get Orders by Customer
    @Get('customer/:customerId')
    @Roles('owner', 'manager', 'staff')
    async getOrdersByCustomer(@Param('customerId', ParseIntPipe) customerId: number) {
        return this.ordersService.getOrdersByCustomer(customerId);
    }

    @Patch(':id/payment-status')
    @Roles('owner', 'manager', 'staff')
    updatePaymentStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status') status: PaymentStatus,
    ) {
        return this.ordersService.updatePaymentStatus(id, status);
    }

    // GET /owner/orders/pending-deposit
    @Get('pending-deposit')
    @Roles('owner', 'manager', 'staff')
    async getPendingDepositOrders(@Req() req: UserRequest) {
        const businessId = req.user.sub;
        return this.ordersService.getPendingDepositOrders(businessId);
    }

    // Fetch selected pending deposit orders
    @Post('pending-deposits/selected')
    @Roles('owner', 'manager', 'staff')
    async getSelectedPendingDeposits(
        @Body('orderIds') orderIds: number[] | number,
        @Req() req: UserRequest,
    ) {
        const businessId = req.user.sub;
        return this.ordersService.getPendingDepositOrdersByIds(businessId, orderIds);
    }

}
