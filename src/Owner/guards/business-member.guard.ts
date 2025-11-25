import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Request } from 'express';

interface BusinessRequest extends Request {
  user: JwtPayload;
  body: { businessId?: number };
  params: { businessId?: string }; // must be string
}

@Injectable()
export class BusinessMemberGuard implements CanActivate {
  constructor(private readonly businessService: BusinessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BusinessRequest>();
    const user = request.user;

    // Convert params.businessId from string to number if exists
    const businessId =
      request.body.businessId ??
      (request.params.businessId
        ? parseInt(request.params.businessId)
        : undefined);

    if (!businessId) throw new ForbiddenException('Business ID is required');

    const business = await this.businessService.findOne(businessId, user.sub);
    if (!business) throw new ForbiddenException('Access denied');

    return true;
  }
}
