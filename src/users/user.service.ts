import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Business } from '../database/entities/business.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>
  ) { }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user: User = this.usersRepository.create(data); // explicit type
    return this.usersRepository.save(user);
  }

  async createBusiness(data: Partial<Business>): Promise<Business> {
    const business = this.businessRepo.create(data);
    return this.businessRepo.save(business);
  }
}
