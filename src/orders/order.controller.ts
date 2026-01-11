import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Req,
    Res,
    ParseIntPipe,
    UsePipes,
    ValidationPipe
} from '@nestjs/common';
import { OrderService } from './order.service';
import { Request, Response } from 'express';
import * as Papa from 'papaparse';
import { MoreThanOrEqual } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../guards/role.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateTrackingDto } from './dro/TrackingDto';
import { CancellationQueryDto } from './dro/CancellationsDto';

@Controller('business/orders')
@UseGuards(JwtAuthGuard, RoleGuard)
export class OrderController {
    constructor(private readonly orderService: OrderService) { }

    // -------------------------------------------------------
    // GET ALL ORDERS
    // -------------------------------------------------------
    @Get()
    @Roles('owner', 'manager', 'staff')
    async getAllOrders(
        @Req() req: Request & { user: JwtPayload },
        @Query() query: any
    ) {
        const email = req.user?.email;
        return this.orderService.getAllOrders(email, query);
    }

    // -------------------------------------------------------
    // GET ORDER BY ID
    // -------------------------------------------------------
    @Get(':id')
    @Roles('owner', 'manager', 'staff')
    async getOrderById(
        @Req() req: Request & { user: JwtPayload },
        @Param('id', ParseIntPipe) id: number
    ) {
        const email = req.user?.email;
        return this.orderService.getOrderById(email, id);
    }

    // -------------------------------------------------------
    // Add / Update ORDER TRAKING BY ID
    // -------------------------------------------------------
    @Put(':id/tracking')
    @Roles('owner', 'manager', 'staff')
    async updateTracking(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTrackingDto,
    ) {
        const tracking = await this.orderService.upsertTracking(id, dto);

        return {
            status: 'success',
            message: 'Tracking updated successfully',
            data: tracking,
        };
    }

    // -------------------------------------------------------
    // GET ORDER STATISTICS
    // -------------------------------------------------------
    @Get('stats/summary')
    @Roles('owner', 'manager', 'staff')
    async getOrderStats(
        @Req() req: Request & { user: JwtPayload },
        @Query('period') period: string
    ) {
        const email = req.user?.email;
        return this.orderService.getOrderStats(email, period);
    }

    // -------------------------------------------------------
    // UPDATE ORDER STATUS
    // -------------------------------------------------------
    @Put(':id/status')
    @Roles('owner', 'manager', 'staff')
    async updateOrderStatus(
        @Req() req: Request & { user: JwtPayload },
        @Param('id', ParseIntPipe) id: number,
        @Body() body: any
    ) {
        const email = req.user?.email;
        return this.orderService.updateOrderStatus(email, id, body);
    }

    // -------------------------------------------------------
    // DELETE ORDER (only for canceled or refunded orders)
    // -------------------------------------------------------
    @Delete(':id')
    @Roles('owner', 'manager')
    async deleteOrder(
        @Req() req: Request & { user: JwtPayload },
        @Param('id', ParseIntPipe) id: number
    ) {
        const email = req.user?.email;
        const result = await this.orderService.deleteOrder(email, id);

        return {
            status: 'success',
            message: 'Order deleted successfully',
            data: result
        };
    }

    // @Put(':id/payment-status')
    // @Roles('owner', 'manager', 'staff')
    // async updatePaymentStatus(
    //     @Req() req: Request & { user: JwtPayload },
    //     @Param('id', ParseIntPipe) id: number,
    //     @Body() body: any
    // ) {
    //     const email = req.user?.email;
    //     return this.orderService.updatePaymentStatus(email, id, body);
    // }


    // -------------------------------------------------------
    // CREATE CANCELLATION REQUEST
    // -------------------------------------------------------
    @Post(':id/cancellations')
    @Roles('owner', 'manager', 'staff')
    async createCancellationRequest(
        @Req() req: Request & { user: JwtPayload },
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { reason: string }
    ) {
        const email = req.user?.email;
        return this.orderService.createCancellationRequest(email, id, body.reason);
    }

    // -------------------------------------------------------
    // GET CANCELLATION REQUESTS
    // -------------------------------------------------------
    @Get('orders/cancellations')
    @Roles('owner', 'manager', 'staff')
    async getCancellations(
        @Req() req: Request & { user: JwtPayload },
        @Query() query: any  // Use typed DTO
    ) {
        return this.orderService.getCancellationRequests(req.user.email, query);
    }

    // -------------------------------------------------------
    // PROCESS CANCELLATION REQUEST
    // -------------------------------------------------------
    @Put('cancellations/:cancellationId')
    @Roles('owner', 'manager', 'staff')
    async processCancellationRequest(
        @Req() req: Request & { user: JwtPayload },
        @Param('cancellationId', ParseIntPipe) cancellationId: number,
        @Body() body: { status: 'approved' | 'rejected' }
    ) {
        const email = req.user?.email;
        return this.orderService.processCancellationRequest(email, cancellationId, body.status);
    }

    // -------------------------------------------------------
    // GET DAILY SALES REPORT
    // -------------------------------------------------------
    @Get('reports/daily-sales')
    @Roles('owner', 'manager', 'staff')
    async getDailySalesReport(
        @Req() req: Request & { user: JwtPayload },
        @Query('days', ParseIntPipe) days: number
    ) {
        const email = req.user?.email;
        return this.orderService.getDailySalesReport(email, days);
    }

    // -------------------------------------------------------
    // GET TOP SELLING PRODUCTS
    // -------------------------------------------------------
    @Get('reports/top-products')
    @Roles('owner', 'manager', 'staff')
    async getTopSellingProducts(
        @Req() req: Request & { user: JwtPayload },
        @Query('limit', ParseIntPipe) limit: number
    ) {
        const email = req.user?.email;
        return this.orderService.getTopSellingProducts(email, limit);
    }

    // -------------------------------------------------------
    // GET CUSTOMER ORDER HISTORY
    // -------------------------------------------------------
    @Get('customers/:customerId/history')
    @Roles('owner', 'manager', 'staff')
    async getCustomerOrderHistory(
        @Req() req: Request & { user: JwtPayload },
        @Param('customerId', ParseIntPipe) customerId: number
    ) {
        const email = req.user?.email;
        return this.orderService.getCustomerOrderHistory(email, customerId);
    }

    // -------------------------------------------------------
    // EXPORT ORDERS TO CSV
    // -------------------------------------------------------
    @Get('export/csv')
    @Roles('owner', 'manager', 'staff')
    async exportOrdersToCSV(
        @Req() req: Request & { user: JwtPayload },
        @Res() res: Response,
        @Query() query: any
    ) {
        const email = req.user?.email;
        const orders = await this.orderService.exportOrders(email, query);

        const csv = Papa.unparse(orders);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=orders_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    }

    // -------------------------------------------------------
    // GET ORDER ANALYTICS DASHBOARD
    // -------------------------------------------------------
    @Get('dashboard/analytics')
    @Roles('owner', 'manager', 'staff')
    async getDashboardAnalytics(@Req() req: Request & { user: JwtPayload }) {
        const email = req.user?.email;
        return this.orderService.getDashboardAnalytics(email);
    }

    @Get('dashboard/charts')
    @Roles('owner', 'manager', 'staff')
    async getCharts(
        @Req() req: Request & { user: JwtPayload },
        @Query('period') period: 'today' | 'week' | 'month' | 'year' = 'month',
    ) {
        const email = req.user?.email;
        return this.orderService.getChartsData(email, period);
    }
}