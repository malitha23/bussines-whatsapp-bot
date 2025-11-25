import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface'; // adjust path

@Injectable()
export class OwnerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = request.user;
    console.log('OwnerRoleGuard: user role is', user.role_type);
    if (user.role_type !== 'owner') {
      throw new ForbiddenException('Only owners can access this route');
    }

    return true;
  }
}
