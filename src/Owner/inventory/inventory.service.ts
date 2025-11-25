import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Business } from '../../database/entities/business.entity';
import { ProductSubSubCategory } from '../../database/entities/product-subsub-category.entity';
import { writeFileSync } from 'fs';
import { VariantImage } from '../../database/entities/variant-image.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(VariantImage)
    private readonly variantImageRepo: Repository<VariantImage>,
    @InjectRepository(InventoryStock)
    private readonly stockRepo: Repository<InventoryStock>,
    @InjectRepository(InventoryTransaction)
    private readonly txRepo: Repository<InventoryTransaction>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(ProductSubSubCategory)
    private readonly subsubCategoryRepo: Repository<ProductSubSubCategory>,
  ) {}

  // 🟩 PRODUCT CRUD ----------------------------

  async createProduct(dto: any) {
    // 🟩 Fetch related business
    const business = await this.businessRepo.findOne({
      where: { id: dto.business.id },
    });
    if (!business) throw new NotFoundException('Business not found');

    // 🟩 Fetch sub-sub-category
    const subsubCategory = await this.subsubCategoryRepo.findOne({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      where: { id: dto.subsubCategoryId },
    });
    if (!subsubCategory)
      throw new NotFoundException('Sub-sub-category not found');

    // 🟩 Create and save product
    const product = this.productRepo.create({
      name: dto.name,
      base_price: dto.base_price,
      description: dto.description,
      is_active: dto.is_active ?? true,
      business,
      subsubCategory,
    });

    return await this.productRepo.save(product);
  }

  async getAllProducts() {
    return this.productRepo.find({
      relations: ['variants', 'images'],
      order: { id: 'DESC' },
    });
  }

  async getProduct(id: number) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['variants', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(id: number, dto: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await this.productRepo.update(id, dto);
    return this.getProduct(id);
  }

  async deleteProduct(id: number) {
    return this.productRepo.delete(id);
  }

  // 🟦 VARIANTS ----------------------------
  async addVariant(productId: number, dto: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const variant = this.variantRepo.create({ ...dto, productId });
    return this.variantRepo.save(variant);
  }

 // 🟦 VARIANT IMAGES ----------------------------
async addVariantImage(variantId: number, file: Express.Multer.File) {
  const variant = await this.variantRepo.findOne({
    where: { id: variantId },
    relations: ['product', 'product.business'], // load the product
  });
  if (!variant) throw new Error('Variant not found');
  if (!variant.product) throw new Error('Variant has no associated product');

  // Use product.businessId directly (avoid loading relation)
  const businessId = variant.product.business.id;

  const uploadPath = join(
    'uploads',
    `business_${businessId}`,
    'products',
    `product_${variant.product.id}`,
    'variants'
  );

  if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });

  const newFileName = `variant_${variantId}_${Date.now()}${extname(file.originalname)}`;
  const newFilePath = join(uploadPath, newFileName);

  if (!file.buffer) throw new Error('File buffer missing');

  writeFileSync(newFilePath, file.buffer);

  const newImage = this.variantImageRepo.create({
    variant: variant, // assign the full variant entity
    image_url: newFilePath,
    is_main: true,
  });

  await this.variantImageRepo.save(newImage);

  return {
    success: true,
    message: 'Variant image uploaded successfully',
    image: newImage,
  };
}



async addMultipleVariantImages(variantId: number, files: Express.Multer.File[]) {
  const variant = await this.variantRepo.findOne({
    where: { id: variantId },
    relations: ['product', 'product.business'],
  });
  if (!variant) throw new Error('Variant not found');

  const businessId =
    variant.product?.business.id ||
    (await this.getBusinessIdByProduct(variant.product.id));

  const uploadPath = join(
    'uploads',
    `business_${businessId}`,
    'products',
    `product_${variant.product.id}`,
    'variants'
  );

  if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });

  const savedImages = [];

  for (const file of files) {
    const newFileName = `variant_${variantId}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}${extname(file.originalname)}`;

    const newFilePath = join(uploadPath, newFileName);
    writeFileSync(newFilePath, file.buffer);

    const image = this.variantImageRepo.create({
      variant: { id: variantId } as any,
      image_url: newFilePath,
      is_main: false,
    });

    await this.variantImageRepo.save(image);
    savedImages.push(image);
  }

  return {
    success: true,
    message: `${savedImages.length} variant image(s) uploaded successfully`,
    images: savedImages,
  };
}




  // 🟧 STOCK ----------------------------
  async updateStock(variantId: number, quantity: number, location?: string) {
    let stock = await this.stockRepo.findOne({
      where: { variant: { id: variantId } },
      relations: ['variant'],
    });

    if (!stock) {
      stock = this.stockRepo.create({
        variant: { id: variantId }, // ✅ Correct relation
        quantity,
        location,
      });
    } else {
      stock.quantity = quantity;
      if (location) stock.location = location;
    }

    await this.stockRepo.save(stock);
    return stock;
  }

  // 🟥 TRANSACTIONS ----------------------------
  async recordTransaction(
    productId: number,
    type: 'IN' | 'OUT',
    quantity: number,
    note?: string,
  ) {
    const tx = this.txRepo.create({
      product: { id: productId }, // ✅ Correct relation
      type,
      quantity,
      note,
    });
    await this.txRepo.save(tx);
    return tx;
  }

  // 🔹 Get businessId from productId
  async getBusinessIdByProduct(productId: number): Promise<number> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['business'],
    });
    if (!product) throw new Error('Product not found');
    return product.business.id;
  }
}
