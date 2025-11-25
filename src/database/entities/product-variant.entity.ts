import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Product } from './product.entity';
import { VariantImage } from './variant-image.entity';

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  product!: Product;

  @OneToMany(() => VariantImage, (image) => image.variant)
  images!: VariantImage[];

  @Column()
  variant_name!: string; // e.g. "25kg", "Red XL"

  @Column('decimal', { precision: 10, scale: 2 })
  price!: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  stock!: number;


  @Column({ nullable: true })
  sku?: string;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'pcs' })
  unit!: string;
}
