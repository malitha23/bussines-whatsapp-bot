import { Controller, Get, Patch, Body, UseGuards, Req, Param, Put, Query, Post } from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';

@Controller('business/settings')
@UseGuards(JwtAuthGuard, RoleGuard)
export class BusinessController {
    constructor(private readonly businessService: BusinessService) { }

    // Get business for logged-in user
    @Get('/')
    @Roles('owner', 'manager', 'staff')
    async getBusiness(@Req() req: Request & { user: JwtPayload }) {
        return this.businessService.getBusinessByUser(req.user.email);
    }

    // Update business info for logged-in user
    @Patch('/')
    @Roles('owner')
    async updateBusiness(
        @Req() req: Request & { user: JwtPayload },
        @Body() body: Partial<{ name: string; email: string; phone: string; address: string }>,
    ) {
        return this.businessService.updateBusinessInfoByUserEmail(req.user.email, body);
    }



    // Get all bot messages
    @Get('/bot-messages')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get all bot messages for the business' })
    @ApiResponse({ status: 200, description: 'Returns all bot messages' })
    async getBotMessages(@Req() req: Request & { user: JwtPayload }) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessages(businessId);
    }

    // Get bot messages by language
    @Get('/bot-messages/language/:language')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get bot messages by language' })
    @ApiParam({ name: 'language', enum: ['en', 'si', 'ta'] })
    @ApiResponse({ status: 200, description: 'Returns bot messages for specified language' })
    async getBotMessagesByLanguage(
        @Req() req: Request & { user: JwtPayload },
        @Param('language') language: string,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessagesByLanguage(businessId, language);
    }

    // Get bot messages by key name
    @Get('/bot-messages/key/:keyName')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get bot messages by key name' })
    @ApiResponse({ status: 200, description: 'Returns bot messages for specified key' })
    async getBotMessagesByKey(
        @Req() req: Request & { user: JwtPayload },
        @Param('keyName') keyName: string,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessagesByKey(businessId, keyName);
    }

    // Get specific bot message by ID
    @Get('/bot-messages/:id')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get specific bot message by ID' })
    @ApiResponse({ status: 200, description: 'Returns the bot message' })
    async getBotMessage(
        @Req() req: Request & { user: JwtPayload },
        @Param('id') id: number,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessage(businessId, id);
    }

    // Update bot message text
    @Put('/bot-messages/:id')
    @Roles('owner', 'manager')
    @ApiOperation({ summary: 'Update bot message text' })
    @ApiResponse({ status: 200, description: 'Bot message updated successfully' })
    async updateBotMessage(
        @Req() req: Request & { user: JwtPayload },
        @Param('id') id: number,
        @Body() body: { text: string },
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.updateBotMessage(businessId, id, body.text);
    }

    // Bulk update bot messages
    @Put('/bot-messages/bulk-update')
    @Roles('owner', 'manager')
    @ApiOperation({ summary: 'Update multiple bot messages at once' })
    @ApiResponse({ status: 200, description: 'Bot messages updated successfully' })
    async bulkUpdateBotMessages(
        @Req() req: Request & { user: JwtPayload },
        @Body() body: Array<{ id: number; text: string }>,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.bulkUpdateBotMessages(businessId, body);
    }

    // Get bot message by key and language
    @Get('/bot-messages/key/:keyName/language/:language')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get bot message by key and language' })
    @ApiResponse({ status: 200, description: 'Returns the bot message' })
    async getBotMessageByKeyAndLanguage(
        @Req() req: Request & { user: JwtPayload },
        @Param('keyName') keyName: string,
        @Param('language') language: string,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessageByKeyAndLanguage(businessId, keyName, language);
    }

    // Get available languages
    @Get('/bot-messages/languages')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get available languages for bot messages' })
    @ApiResponse({ status: 200, description: 'Returns list of languages' })
    async getBotMessageLanguages(@Req() req: Request & { user: JwtPayload }) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessageLanguages(businessId);
    }

    // Get available message keys
    @Get('/bot-messages/keys')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Get available message keys' })
    @ApiResponse({ status: 200, description: 'Returns list of message keys' })
    async getBotMessageKeys(@Req() req: Request & { user: JwtPayload }) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.getBotMessageKeys(businessId);
    }

    // Search bot messages
    @Get('/bot-messages/search')
    @Roles('owner', 'manager', 'staff')
    @ApiOperation({ summary: 'Search bot messages' })
    @ApiQuery({ name: 'q', required: true, description: 'Search term' })
    @ApiQuery({ name: 'language', required: false, description: 'Filter by language' })
    @ApiQuery({ name: 'key', required: false, description: 'Filter by key name' })
    @ApiResponse({ status: 200, description: 'Returns search results' })
    async searchBotMessages(
        @Req() req: Request & { user: JwtPayload },
        @Query('q') searchTerm: string,
        @Query('language') language?: string,
        @Query('key') keyName?: string,
    ) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        return this.businessService.searchBotMessages(businessId, searchTerm, language, keyName);
    }
 
    @Post('/bot-messages/reset')
    @Roles('owner')
    @ApiOperation({ summary: 'Reset bot messages to default' })
    @ApiResponse({ status: 200, description: 'Bot messages reset successfully' })
    async resetBotMessages(@Req() req: Request & { user: JwtPayload }) {
        const businessId = await this.businessService.getBusinessIdFromUser(req.user.email);
        const messages = await this.businessService.resetBotMessages(businessId);
        return {
            message: 'Bot messages have been reset to default',
            count: messages.length,
            data: messages,
        };
    }
}
