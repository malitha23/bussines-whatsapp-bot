import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { ProductCategory } from './product-category.entity';
import { Customer } from './customer.entity';
import { Subscription } from './subscription.entity';
import { Order } from './order.entity';
import { BusinessPaymentOption } from './business-payment-options.entity';
import { BusinessDeliveryFee } from './business-delivery-fee.entity';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column()
  phone!: string;

  @Column()
  address!: string;

  @Column({ default: true })
  is_active!: boolean;

  @ManyToOne(() => User, (user) => user.businesses)
  owner!: User;

  @OneToMany(() => ProductCategory, (category) => category.business)
  categories!: ProductCategory[];

  @OneToMany(() => Customer, (customer) => customer.business)
  customers!: Customer[];

  @OneToMany(() => Subscription, (subscription) => subscription.business)
  subscriptions!: Subscription[];

  @OneToMany(() => Order, (order) => order.business)
  orders!: Order[];

  @OneToMany(() => BusinessPaymentOption, (option) => option.business)
  paymentOptions!: BusinessPaymentOption[];

  @OneToMany(() => BusinessDeliveryFee, (fee) => fee.business)
  deliveryFees!: BusinessDeliveryFee[];


}
