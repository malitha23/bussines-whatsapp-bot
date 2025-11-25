import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ProductVariant } from './product-variant.entity';

@Entity('variant_images')
export class VariantImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductVariant, (variant) => variant.images, {
    onDelete: 'CASCADE',
  })
  variant!: ProductVariant;

  @Column()
  image_url!: string;

  @Column({ default: false })
  is_main!: boolean;
}
