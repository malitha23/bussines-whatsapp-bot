import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Business } from './business.entity';
import { Order } from './order.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business, (business) => business.customers)
  business!: Business;

  @Column()
  name!: string;

  @Column()
  phone!: string; // ❗ remove unique — phone is only unique inside a business

  @Column({ nullable: true })
  email!: string;

  @Column({ nullable: true })
  address!: string; // ✅ new column for customer address

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @OneToMany(() => Order, (order) => order.customer)
  orders!: Order[];
}
