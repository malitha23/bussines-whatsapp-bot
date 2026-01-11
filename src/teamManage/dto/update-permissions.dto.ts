import { IsArray } from 'class-validator';

export class UpdatePermissionsDto {
  userId!: number;
  @IsArray()
  permissions!: string[];
}