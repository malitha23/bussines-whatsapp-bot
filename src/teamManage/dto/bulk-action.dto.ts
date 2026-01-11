import { ArrayNotEmpty, IsArray, IsEnum, IsInt } from 'class-validator';
import { UserStatus } from '../../database/entities/user.entity';
import { Type } from 'class-transformer';

export class BulkStatusDto {
  @IsArray()
  userIds!: number[];

  @IsEnum(UserStatus)
  status!: UserStatus;
}

export enum ActionStatus {
  DELETE = 'delete',
}

export class BulkDeleteDto {
  @IsArray()
  userIds!: number[];

  @IsEnum(ActionStatus)
  status!: ActionStatus;
}