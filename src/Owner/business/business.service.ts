import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../database/entities/business.entity';
import { CreateBusinessDto } from '../dto/business/create-business.dto';
import { UpdateBusinessDto } from '../dto/business/update-business.dto';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  async create(dto: CreateBusinessDto, owner: User): Promise<Business> {
    const business = this.businessRepository.create({ ...dto, owner });
    return this.businessRepository.save(business);
  }

  async findAll(ownerId: number): Promise<Business[]> {
    return this.businessRepository.find({ where: { owner: { id: ownerId } } });
  }

  async findOne(id: number, ownerId: number): Promise<Business> {
    const business = await this.businessRepository.findOne({
      where: { id, owner: { id: ownerId } },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async update(
    id: number,
    ownerId: number,
    dto: UpdateBusinessDto,
  ): Promise<Business> {
    const business = await this.findOne(id, ownerId);
    Object.assign(business, dto);
    return this.businessRepository.save(business);
  }

  async remove(id: number, ownerId: number): Promise<void> {
    const business = await this.findOne(id, ownerId);
    await this.businessRepository.remove(business);
  }
}
