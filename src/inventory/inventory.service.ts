import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { ProductVariant } from '../database/entities/product-variant.entity';
import { InventoryStock } from '../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../database/entities/inventory-transaction.entity';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { Business } from '../database/entities/business.entity';
import { ProductSubSubCategory } from '../database/entities/product-subsub-category.entity';
import { writeFileSync } from 'fs';
import { VariantImage } from '../database/entities/variant-image.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { User } from '../database/entities/user.entity';
import { CreateVariantDto } from './dto/variant.dto';
import { ProductSubCategory } from '../database/entities/product-subcategory.entity';
import { SearchFilterDto, SortField } from './dto/search-filter.dto';
import { TeamActivityService } from '../team-activity/team-activity.service';

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
    @InjectRepository(ProductSubCategory)
    private readonly subCategoryRepo: Repository<ProductSubCategory>,
    @InjectRepository(ProductSubSubCategory)
    private readonly subsubCategoryRepo: Repository<ProductSubSubCategory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    private readonly activityService: TeamActivityService

  ) { }

  // -------------------------------------------------------
  // Get Business by user
  // -------------------------------------------------------
  private async getBusinessByUser(email: string): Promise<{ businessId: number, business: Business }> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    let business;

    if (user.role_type === 'owner') {
      business = await this.businessRepo.findOne({
        where: { owner: { id: user.id } },
        relations: ['owner'],
      });
    } else if (user.role_type === 'manager') {
      const manager = await this.managerRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['business'],
      });
      business = manager?.business;
    } else if (user.role_type === 'staff') {
      const staff = await this.staffRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['business'],
      });
      business = staff?.business;
    }

    if (!business) throw new NotFoundException('Business not found for this user');
    return { businessId: business.id, business };
  }



  // 🟩 PRODUCT CRUD ----------------------------

  async createProduct(dto: any) {
    // Get business and user info
    const { businessId, business } = await this.getBusinessByUser(dto.email);
    const user = await this.userRepo.findOne({ where: { email: dto.email } });

    // 🟩 Fetch sub-sub-category
    const subsubCategory = await this.subsubCategoryRepo.findOne({
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
      subCategory: dto.subCategoryId ? dto.subCategoryId : null,
      subsubCategory: dto.subsubCategoryId ? dto.subsubCategoryId : null,
    });

    const savedProduct = await this.productRepo.save(product);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `created new product: ${savedProduct.name} (Price: Rs ${savedProduct.base_price})`,
    );

    return savedProduct;
  }
  async getAllProducts(filters: SearchFilterDto, email: string) {
    const { businessId } = await this.getBusinessByUser(email);

    const query = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.images', 'variantImages')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.subsubCategory', 'subsubCategory') // lowercase s!
      .leftJoin('product.business', 'business')
      .where('business.id = :businessId', { businessId });


    // Search
    if (filters.search) {
      const search = `%${filters.search.toLowerCase()}%`;
      query.andWhere(
        '(LOWER(product.name) LIKE :search OR LOWER(product.description) LIKE :search)',
        { search },
      );
    }

    // Price
    if (filters.minPrice !== undefined) query.andWhere('product.base_price >= :minPrice', { minPrice: filters.minPrice });
    if (filters.maxPrice !== undefined) query.andWhere('product.base_price <= :maxPrice', { maxPrice: filters.maxPrice });

    // Category
    if (filters.subCategoryId) query.andWhere('product.subCategoryId = :subCategoryId', { subCategoryId: filters.subCategoryId });
    if (filters.subSubCategoryId) query.andWhere('product.subSubCategoryId = :subSubCategoryId', { subSubCategoryId: filters.subSubCategoryId });

    // In Stock
    if (filters.inStockOnly) query.andWhere('variants.stock > 0');
    if (filters.activeOnly) {
      query.andWhere('product.is_active = :isActive', { isActive: 0 });
    } else {
      query.andWhere('product.is_active = :isActive', { isActive: 1 });
    }


    // Sort
    const validSortFields = ['product.name', 'product.base_price', 'product.created_at', 'variants.stock'] as const;
    const sortBy = validSortFields.includes(filters.sortBy as any) ? filters.sortBy! : 'product.created_at';
    const sortOrder = filters.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    query.orderBy(sortBy, sortOrder as 'ASC' | 'DESC');


    query.orderBy(sortBy, sortOrder);


    const [data, total] = await query.getManyAndCount();
    return { data, meta: { total } };
  }

  async getInventoryStats(email: string) {
    const { businessId } = await this.getBusinessByUser(email);

    // --- CURRENT DATA ---
    const totalProducts = await this.productRepo.count({ where: { business: { id: businessId } } });
    const totalVariants = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .getCount();
    const inStockVariants = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .andWhere('variant.stock > 0')
      .getCount();
    const totalValueResult = await this.variantRepo
      .createQueryBuilder('variant')
      .select('SUM(variant.price * variant.stock)', 'total')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .getRawOne();
    const totalValue = Number(totalValueResult.total) || 0;

    // --- PREVIOUS DATA (example: previous day) ---
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const prevTotalProducts = await this.productRepo.count({
      where: { business: { id: businessId }, created_at: LessThan(yesterday) },
    });

    const prevTotalVariantsResult = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .andWhere('variant.created_at < :yesterday', { yesterday })
      .getCount();

    const prevInStockVariantsResult = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .andWhere('variant.created_at < :yesterday', { yesterday })
      .andWhere('variant.stock > 0')
      .getCount();

    const prevTotalValueResult = await this.variantRepo
      .createQueryBuilder('variant')
      .select('SUM(variant.price * variant.stock)', 'total')
      .innerJoin('variant.product', 'product')
      .where('product.businessId = :businessId', { businessId })
      .andWhere('variant.created_at < :yesterday', { yesterday })
      .getRawOne();
    const prevTotalValue = Number(prevTotalValueResult.total) || 0;

    // --- CALCULATE PERCENT CHANGE ---
    const calcChange = (current: number, previous: number) =>
      previous === 0 ? '+100%' : `${(((current - previous) / previous) * 100).toFixed(1)}%`;

    // --- LOW STOCK ITEMS ---
    const lowStockVariants = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .leftJoin(qb =>
        qb.from(InventoryTransaction, 'it')
          .select('it.variantId', 'variantId')
          .addSelect('SUM(it.quantity)', 'outQuantity')
          .where("it.type = 'OUT'")
          .groupBy('it.variantId'),
        'outTrans',
        'outTrans.variantId = variant.id'
      )
      .where('product.businessId = :businessId', { businessId })
      .andWhere('(variant.stock - IFNULL(outTrans.outQuantity, 0)) <= :threshold', { threshold: 5 })
      .select([
        'variant.id AS variantId',
        'variant.variant_name AS variantName',
        'product.id AS productId',
        'product.name AS productName',
        'variant.stock AS stock',
        'IFNULL(outTrans.outQuantity, 0) AS outQuantity',
        '(variant.stock - IFNULL(outTrans.outQuantity, 0)) AS availableStock'
      ])
      .getRawMany();

    // Map to include main image
    const lowStockItems = await Promise.all(
      lowStockVariants.map(async v => {
        const mainImage = await this.variantImageRepo.findOne({
          where: { variant: { id: v.variantId }, is_main: true },
        });

        return {
          ...v,
          variantImage: mainImage ? mainImage.image_url : null,
          stock: Number(v.stock),
          outQuantity: Number(v.outQuantity),
          availableStock: Number(v.availableStock),
        };
      })
    );


    return {
      stats: [
        {
          title: "Total Products",
          value: totalProducts,
          icon: "Package",
          color: "from-blue-500 to-cyan-500",
          change: calcChange(totalProducts, prevTotalProducts),
          trend: totalProducts >= prevTotalProducts ? "up" : "down"
        },
        {
          title: "Total Variants",
          value: totalVariants,
          icon: "BarChart3",
          color: "from-purple-500 to-pink-500",
          change: calcChange(totalVariants, prevTotalVariantsResult),
          trend: totalVariants >= prevTotalVariantsResult ? "up" : "down"
        },
        {
          title: "In Stock Items",
          value: inStockVariants,
          icon: "ShoppingCart",
          color: "from-green-500 to-emerald-500",
          change: calcChange(inStockVariants, prevInStockVariantsResult),
          trend: inStockVariants >= prevInStockVariantsResult ? "up" : "down"
        },
        {
          title: "Total Value",
          value: `Rs ${totalValue.toLocaleString()}`,
          icon: "DollarSign",
          color: "from-amber-500 to-orange-500",
          change: calcChange(totalValue, prevTotalValue),
          trend: totalValue >= prevTotalValue ? "up" : "down"
        }
      ],
      lowStockItems: lowStockItems
    };
  }


  async getAvailableFiltersByUser(email: string) {
    const { businessId } = await this.getBusinessByUser(email);
    const categories = await this.subCategoryRepo.createQueryBuilder('subCategory')
      .innerJoin('subCategory.products', 'products')
      .innerJoin('products.business', 'business')
      .where('business.id = :businessId', { businessId })
      .select(['subCategory.id', 'subCategory.name'])
      .getMany();

    return { categories };
  }



  async getProduct(id: number) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['variants', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(id: number, dto: any, email: string) {
    if (!email) throw new NotFoundException('User email required');

    const { business } = await this.getBusinessByUser(email);

    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['subCategory', 'subsubCategory', 'business'],
    });
    if (!product) throw new NotFoundException('Product not found');

    const changes: string[] = [];

    if (dto.name && dto.name !== product.name) {
      changes.push(`name from "${product.name}" to "${dto.name}"`);
      product.name = dto.name;
    }

    if (dto.base_price && dto.base_price !== product.base_price) {
      changes.push(`price from Rs ${product.base_price} to Rs ${dto.base_price}`);
      product.base_price = dto.base_price;
    }

    if (dto.description !== undefined && dto.description !== product.description) {
      changes.push(`description updated`);
      product.description = dto.description;
    }

    if (dto.is_active !== undefined && dto.is_active !== product.is_active) {
      const status = dto.is_active ? 'active' : 'inactive';
      changes.push(`status to ${status}`);
      product.is_active = dto.is_active;
    }

    // Update subCategory relation
    if (dto.subCategoryId && dto.subCategoryId !== product.subCategory?.id) {
      const subCategory = await this.subCategoryRepo.findOne({ where: { id: dto.subCategoryId } });
      if (!subCategory) throw new NotFoundException('Sub-category not found');
      const oldCategory = product.subCategory?.name || 'None';
      changes.push(`sub-category from "${oldCategory}" to "${subCategory.name}"`);
      product.subCategory = subCategory;
    }

    // Update subsubCategory relation
    if (dto.subsubCategoryId && dto.subsubCategoryId !== product.subsubCategory?.id) {
      const subsubCategory = await this.subsubCategoryRepo.findOne({ where: { id: dto.subsubCategoryId } });
      if (!subsubCategory) throw new NotFoundException('Sub-sub-category not found');
      const oldSubSub = product.subsubCategory?.name || 'None';
      changes.push(`sub-sub-category from "${oldSubSub}" to "${subsubCategory.name}"`);
      product.subsubCategory = subsubCategory;
    }

    const updatedProduct = await this.productRepo.save(product);

    if (changes.length > 0) {
      await this.activityService.logActivity(
        user,
        business,
        `updated product "${product.name}": ${changes.join(', ')}`,
      );
    }

    return updatedProduct;
  }


  async deleteProduct(productId: number, email: string) {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['variants', 'variants.images', 'business'],
    });

    if (!product) throw new NotFoundException('Product not found');

    // Count variants for logging
    const variantCount = product.variants?.length || 0;

    // Count images for logging
    let imageCount = 0;
    for (const variant of product.variants) {
      imageCount += variant.images?.length || 0;
    }

    // Delete process (same as before)
    for (const variant of product.variants) {
      for (const img of variant.images) {
        if (img.image_url && existsSync(img.image_url)) unlinkSync(img.image_url);
        await this.variantImageRepo.delete({ id: img.id });
      }

      await this.stockRepo.delete({ variant: { id: variant.id } });
      await this.txRepo.delete({ variant: { id: variant.id } });
      await this.txRepo.delete({ product: { id: productId } });
    }

    await this.variantRepo.delete({ product: { id: productId } });
    await this.productRepo.delete(productId);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `deleted product "${product.name}" (with ${variantCount} variants and ${imageCount} images)`,
    );

    return { message: 'Product, variants, images, and transactions deleted successfully' };
  }



  // 🟦 VARIANTS ----------------------------
  async addVariant(productId: number, dto: CreateVariantDto, email: string) {

    if (!email) throw new NotFoundException('User email required');

    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const variant = this.variantRepo.create({
      variant_name: dto.variant_name,
      price: dto.price,
      sku: dto.sku,
      unit: dto.unit,
      is_active: dto.is_active,
      product: { id: productId },
    });

    const savedVariant = await this.variantRepo.save(variant);

    let totalQuantity = 0;

    for (const inv of dto.inventory) {
      const stockRecord = this.stockRepo.create({
        variant: savedVariant,
        quantity: inv.quantity,
        location: inv.location ?? 'warehouse',
      });

      await this.stockRepo.save(stockRecord);
      totalQuantity += Number(inv.quantity);

      const trx = this.txRepo.create({
        product: { id: productId },
        variant: savedVariant,
        quantity: inv.quantity,
        type: 'IN',
        note: `Initial stock added (${inv.location})`,
      });

      await this.txRepo.save(trx);
    }

    savedVariant.stock = totalQuantity;
    await this.variantRepo.save(savedVariant);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `added variant "${dto.variant_name}" to product "${product.name}" with ${totalQuantity} units in stock`,
    );

    return {
      message: 'Variant created successfully',
      variant: savedVariant,
    };
  }


  // 🟦 VARIANT IMAGES ----------------------------
  async addVariantImage(variantId: number, file: Express.Multer.File, email: string) {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: ['product', 'product.business', 'images'], // include existing images
    });
    if (!variant) throw new Error('Variant not found');
    if (!variant.product) throw new Error('Variant has no associated product');

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

    // ✅ Check if there is already a main image
    const hasMain = variant.images.some(img => img.is_main);

    const newImage = this.variantImageRepo.create({
      variant: variant,
      image_url: newFilePath,
      is_main: !hasMain, // true only if no main exists
    });

    await this.variantImageRepo.save(newImage);
    await this.activityService.logActivity(
      user!,
      business,
      `added image to variant "${variant.variant_name}" of product "${variant.product?.name}"`,
    );

    return {
      success: true,
      message: 'Variant image uploaded successfully',
      image: newImage,
    };
  }

  async addMultipleVariantImages(variantId: number, files: Express.Multer.File[], email: string) {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: ['product', 'product.business', 'images'], // include existing images
    });
    if (!variant) throw new Error('Variant not found');

    const businessId = variant.product?.business.id || (await this.getBusinessIdByProduct(variant.product.id));
    const uploadPath = join(
      'uploads',
      `business_${businessId}`,
      'products',
      `product_${variant.product.id}`,
      'variants'
    );

    if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });

    const savedImages = [];

    // ✅ Check if a main image already exists
    const hasMain = variant.images.some(img => img.is_main);
    let mainSet = hasMain; // track if we already set a main image during this upload

    for (const file of files) {
      const newFileName = `variant_${variantId}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}${extname(file.originalname)}`;

      const newFilePath = join(uploadPath, newFileName);
      writeFileSync(newFilePath, file.buffer);

      const image = this.variantImageRepo.create({
        variant: { id: variantId } as any,
        image_url: newFilePath,
        // ✅ First uploaded image becomes main if no main exists
        is_main: !mainSet,
      });

      if (!mainSet) mainSet = true; // set flag after first main

      await this.variantImageRepo.save(image);
      savedImages.push(image);
    }

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `added ${savedImages.length} images to variant "${variant.variant_name}" of product "${variant.product?.name}"`,
    );

    return {
      success: true,
      message: `${savedImages.length} variant image(s) uploaded successfully`,
      images: savedImages,
    };
  }


  async deleteVariantImage(variantId: number, imageId: number, email: string) {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    // 1️⃣ Find the image
    const image = await this.variantImageRepo.findOne({
      where: { id: imageId, variant: { id: variantId } },
      relations: ['variant', 'variant.product', 'variant.product.business'],
    });

    if (!image) throw new Error('Variant image not found');

    const variantName = image.variant?.variant_name || 'Unknown Variant';
    const productName = image.variant?.product?.name || 'Unknown Product';

    // 2️⃣ Delete file from disk
    if (image.image_url && existsSync(image.image_url)) {
      try {
        unlinkSync(image.image_url);
      } catch (err) {
        console.error('Failed to delete file from disk:', err);
      }
    }

    // 3️⃣ Remove from database
    await this.variantImageRepo.remove(image);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `deleted image from variant "${variantName}" of product "${productName}"`,
    );

    return {
      success: true,
      message: 'Variant image deleted successfully',
    };
  }

  async setMainVariantImage(variantId: number, imageId: number, email: string) {

    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    // 1️⃣ Fetch all images for the variant
    const images = await this.variantImageRepo.find({
      where: { variant: { id: variantId } },
    });

    if (!images.length) throw new Error('No images found for this variant');

    const variantName = images[0].variant?.variant_name || 'Unknown Variant';
    const productName = images[0].variant?.product?.name || 'Unknown Product';

    // 2️⃣ Update all images: set is_main = false
    for (const img of images) {
      img.is_main = img.id === imageId; // true only for selected
    }

    await this.variantImageRepo.save(images);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `set main image for variant "${variantName}" of product "${productName}"`,
    );

    return {
      success: true,
      message: 'Main image updated successfully',
    };
  }


  async updateVariant(variantId: number, dto: CreateVariantDto, email: string) {

    if (!email) throw new NotFoundException('User email required');

    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: ['product'],
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    // Track changes
    const changes: string[] = [];
    const oldVariantName = variant.variant_name;
    const oldPrice = variant.price;
    const oldSku = variant.sku;
    const oldStock = variant.stock;

    // 1️⃣ Update Variant fields
    if (dto.variant_name && dto.variant_name !== variant.variant_name) {
      changes.push(`name from "${variant.variant_name}" to "${dto.variant_name}"`);
      variant.variant_name = dto.variant_name;
    }

    if (dto.price && dto.price !== variant.price) {
      changes.push(`price from Rs ${variant.price} to Rs ${dto.price}`);
      variant.price = dto.price;
    }

    if (dto.sku && dto.sku !== variant.sku) {
      changes.push(`SKU from "${variant.sku}" to "${dto.sku}"`);
      variant.sku = dto.sku;
    }

    if (dto.unit && dto.unit !== variant.unit) {
      changes.push(`unit from "${variant.unit}" to "${dto.unit}"`);
      variant.unit = dto.unit;
    }

    if (dto.is_active !== undefined && dto.is_active !== variant.is_active) {
      const status = dto.is_active ? 'active' : 'inactive';
      changes.push(`status to ${status}`);
      variant.is_active = dto.is_active;
    }

    await this.variantRepo.save(variant);

    // 2️⃣ Remove old inventory rows
    await this.stockRepo.delete({ variant: { id: variantId } });

    // 3️⃣ Insert new inventory stock
    let totalQuantity = 0;
    const locations: string[] = [];

    for (const inv of dto.inventory) {
      const stockRecord = this.stockRepo.create({
        variant,
        quantity: inv.quantity,
        location: inv.location ?? 'warehouse',
      });

      await this.stockRepo.save(stockRecord);
      totalQuantity += Number(inv.quantity);
      locations.push(`${inv.quantity} units at ${inv.location ?? 'warehouse'}`);

      // 4️⃣ Create transaction
      await this.txRepo.save({
        product: variant.product,
        variant,
        quantity: inv.quantity,
        type: 'IN',
        note: `Stock updated (${inv.location})`,
      });
    }

    // 5️⃣ Update stock in variant table
    if (totalQuantity !== oldStock) {
      changes.push(`stock from ${oldStock} to ${totalQuantity} units`);
    }

    variant.stock = totalQuantity;
    await this.variantRepo.save(variant);

    // Log activity
    if (changes.length > 0) {
      await this.activityService.logActivity(
        user!,
        business,
        `updated variant "${oldVariantName}" of product "${variant.product.name}": ${changes.join(', ')}. Stock locations: ${locations.join('; ')}`,
      );
    }

    return {
      message: 'Variant updated successfully',
      variant,
    };
  }

  async deleteVariant(variantId: number, email: string) {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });

    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
      relations: ['product', 'images'],
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const variantName = variant.variant_name;
    const productName = variant.product?.name || 'Unknown Product';
    const imageCount = variant.images?.length || 0;

    // ---------------------------------------------
    // 1️⃣ DELETE INVENTORY TRANSACTIONS
    // ---------------------------------------------
    await this.txRepo.delete({ variant: { id: variantId } });

    // ---------------------------------------------
    // 2️⃣ DELETE INVENTORY STOCK
    // ---------------------------------------------
    const inventoryRows = await this.stockRepo.find({
      where: { variant: { id: variantId } },
    });

    let removedQty = 0;
    for (const row of inventoryRows) {
      removedQty += Number(row.quantity);
    }

    await this.stockRepo.delete({ variant: { id: variantId } });

    // ---------------------------------------------
    // 3️⃣ DELETE IMAGES (FILES + DB RECORDS)
    // ---------------------------------------------
    if (variant.images && variant.images.length > 0) {
      for (const img of variant.images) {
        try {
          if (existsSync(img.image_url)) {
            unlinkSync(img.image_url);
          }
        } catch (error) {
          console.error('Failed deleting image:', img.image_url, error);
        }

        await this.variantImageRepo.delete({ id: img.id });
      }
    }

    // ---------------------------------------------
    // 4️⃣ DELETE VARIANT ITSELF (HARD DELETE)
    // ---------------------------------------------
    await this.variantRepo.delete(variantId);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `deleted variant "${variantName}" from product "${productName}" (${removedQty} units, ${imageCount} images removed)`,
    );

    return {
      message: 'Variant & images deleted successfully (hard delete)',
      removed_stock: removedQty,
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
