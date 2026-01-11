import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { User } from '../../database/entities/user.entity';
import { Business } from '../../database/entities/business.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { TeamActivityService } from '../../team-activity/team-activity.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,

    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    private readonly activityService: TeamActivityService
  ) {}

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

  // -------------------------------------------------------
  // CREATE CATEGORY
  // -------------------------------------------------------
  async createCategory(name: string, email: string) {
  try {
    const { businessId, business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const category = this.categoryRepo.create({
      name,
      business: { id: businessId },
    });
    
    const saved = await this.categoryRepo.save(category);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `created new category: "${saved.name}"`,
    );

    return { success: true, message: 'Category created successfully', data: saved };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to create category' };
  }
}
  // -------------------------------------------------------
  // GET ALL CATEGORIES
  // -------------------------------------------------------
  async getAllCategoriesByUser(email: string) {
    try {
      const { businessId } = await this.getBusinessByUser(email);
      const categories = await this.categoryRepo.find({
        where: { business: { id: businessId } },
        relations: ['subcategories', 'subcategories.subsubcategories'],
      });
      return { success: true, data: categories };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, message: error.message };
      }
      return { success: false, message: 'Failed to fetch categories' };
    }
  }

  // -------------------------------------------------------
  // GET CATEGORY
  // -------------------------------------------------------
  async getCategory(id: number) {
    try {
      const category = await this.categoryRepo.findOne({
        where: { id },
        relations: ['subcategories', 'subcategories.subsubcategories'],
      });
      if (!category) return { success: false, message: 'Category not found' };
      return { success: true, data: category };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, message: error.message };
      }
      return { success: false, message: 'Failed to fetch category' };
    }
  }

  // -------------------------------------------------------
  // UPDATE CATEGORY
  // -------------------------------------------------------
  async updateCategory(id: number, name: string, email: string) {
  try {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const category = await this.categoryRepo.findOne({ 
      where: { id },
      relations: ['business']
    });
    
    if (!category) return { success: false, message: 'Category not found' };

    // Check if category belongs to user's business
    if (category.business.id !== business.id) {
      return { 
        success: false, 
        message: 'You do not have permission to update this category' 
      };
    }

    const oldName = category.name;
    category.name = name;
    const updated = await this.categoryRepo.save(category);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `updated category from "${oldName}" to "${updated.name}"`,
    );

    return { success: true, message: 'Category updated successfully', data: updated };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to update category' };
  }
}

  // -------------------------------------------------------
  // DELETE CATEGORY
  // -------------------------------------------------------
  async deleteCategory(id: number, email: string) {
  try {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const category = await this.categoryRepo.findOne({ 
      where: { id },
      relations: ['business', 'subcategories', 'subcategories.subsubcategories']
    });
    
    if (!category) return { success: false, message: 'Category not found' };

    // Check if category belongs to user's business
    if (category.business.id !== business.id) {
      return { 
        success: false, 
        message: 'You do not have permission to delete this category' 
      };
    }

    // Count subcategories and subsubcategories for logging
    const subcategoryCount = category.subcategories?.length || 0;
    let subsubcategoryCount = 0;
    
    if (category.subcategories) {
      for (const subcat of category.subcategories) {
        subsubcategoryCount += subcat.subsubcategories?.length || 0;
      }
    }

    await this.categoryRepo.remove(category);

    // Log activity
    let details = '';
    if (subcategoryCount > 0 || subsubcategoryCount > 0) {
      details = ` (along with ${subcategoryCount} subcategories and ${subsubcategoryCount} sub-subcategories)`;
    }
    
    await this.activityService.logActivity(
      user!,
      business,
      `deleted category "${category.name}"${details}`,
    );

    return { success: true, message: 'Category deleted successfully' };
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Check for foreign key constraint error (if category has products)
      if (error.message.includes('foreign key constraint')) {
        return { 
          success: false, 
          message: 'Cannot delete category because it has associated products. Remove products first.' 
        };
      }
      return { success: false, message: error.message };
    }
    return { success: false, message: 'Failed to delete category' };
  }
}
}
