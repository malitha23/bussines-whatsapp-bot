import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ProductSubCategory } from '../../database/entities/product-subcategory.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { TeamActivityService } from '../../team-activity/team-activity.service';
import { Business } from '../../database/entities/business.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class SubcategoryService {
  constructor(
    @InjectRepository(ProductSubCategory)
    private readonly subcategoryRepo: Repository<ProductSubCategory>,

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

  // Create a subcategory under a category
 async createSubcategory(name: string, categoryId: number, email: string) {
  try {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const category = await this.categoryRepo.findOne({ 
      where: { id: categoryId },
      relations: ['business']
    });
    
    if (!category) throw new NotFoundException('Category not found');

    // Check if category belongs to user's business
    if (category.business.id !== business.id) {
      throw new NotFoundException('Category not found in your business');
    }

    // Check if subcategory with same name already exists in this category
    const existingSubcategory = await this.subcategoryRepo.findOne({
      where: { 
        name, 
        category: { id: categoryId }
      }
    });
    
    if (existingSubcategory) {
      throw new NotFoundException(`Subcategory "${name}" already exists in this category`);
    }

    const subcategory = this.subcategoryRepo.create({ name, category });
    const savedSubcategory = await this.subcategoryRepo.save(subcategory);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `created new subcategory "${savedSubcategory.name}" under category "${category.name}"`,
    );

    return {
      success: true,
      message: 'Subcategory created successfully',
      data: savedSubcategory
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { 
        success: false, 
        message: error.message 
      };
    }
    return { 
      success: false, 
      message: 'Failed to create subcategory' 
    };
  }
}

  // Get all subcategories with their category
  async getAllSubcategories() {
    return this.subcategoryRepo.find({ relations: ['category'] });
  }

  // Get a single subcategory by ID
  async getSubcategory(id: number) {
    const subcategory = await this.subcategoryRepo.findOne({
      where: { id },
      relations: ['category', 'subsubcategories'],
    });
    if (!subcategory) throw new NotFoundException('Subcategory not found');
    return subcategory;
  }

  // Update subcategory name
  async updateSubcategory(id: number, name: string, email: string) {
  try {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const subcategory = await this.subcategoryRepo.findOne({
      where: { id },
      relations: ['category', 'category.business'],
    });
    
    if (!subcategory) {
      return { 
        success: false, 
        message: 'Subcategory not found' 
      };
    }

    // Check if subcategory belongs to user's business
    if (subcategory.category.business.id !== business.id) {
      return { 
        success: false, 
        message: 'You do not have permission to update this subcategory' 
      };
    }

    // Check if new name already exists in the same category
    const existingSubcategory = await this.subcategoryRepo.findOne({
      where: { 
        name, 
        category: { id: subcategory.category.id },
        id: Not(id) // Exclude current subcategory
      }
    });
    
    if (existingSubcategory) {
      return { 
        success: false, 
        message: `Subcategory "${name}" already exists in this category` 
      };
    }

    const oldName = subcategory.name;
    subcategory.name = name;
    const updatedSubcategory = await this.subcategoryRepo.save(subcategory);

    // Log activity
    await this.activityService.logActivity(
      user!,
      business,
      `updated subcategory from "${oldName}" to "${updatedSubcategory.name}" in category "${subcategory.category.name}"`,
    );

    return {
      success: true,
      message: 'Subcategory updated successfully',
      data: updatedSubcategory
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { 
        success: false, 
        message: error.message 
      };
    }
    return { 
      success: false, 
      message: 'Failed to update subcategory' 
    };
  }
}

  // Delete subcategory
  async deleteSubcategory(id: number, email: string) {
  try {
    const { business } = await this.getBusinessByUser(email);
    const user = await this.userRepo.findOne({ where: { email } });
    
    const subcategory = await this.subcategoryRepo.findOne({
      where: { id },
      relations: ['category', 'category.business', 'subsubcategories'],
    });
    
    if (!subcategory) {
      return { 
        success: false, 
        message: 'Subcategory not found' 
      };
    }

    // Check if subcategory belongs to user's business
    if (subcategory.category.business.id !== business.id) {
      return { 
        success: false, 
        message: 'You do not have permission to delete this subcategory' 
      };
    }

    // Count subsubcategories for logging
    const subsubcategoryCount = subcategory.subsubcategories?.length || 0;

    await this.subcategoryRepo.remove(subcategory);

    // Log activity
    let details = '';
    if (subsubcategoryCount > 0) {
      details = ` (along with ${subsubcategoryCount} sub-subcategories)`;
    }
    
    await this.activityService.logActivity(
      user!,
      business,
      `deleted subcategory "${subcategory.name}" from category "${subcategory.category.name}"${details}`,
    );

    return {
      success: true,
      message: 'Subcategory deleted successfully'
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Check for foreign key constraint error (if subcategory has products)
      if (error.message.includes('foreign key constraint')) {
        return { 
          success: false, 
          message: 'Cannot delete subcategory because it has associated products. Remove products first.' 
        };
      }
      return { 
        success: false, 
        message: error.message 
      };
    }
    return { 
      success: false, 
      message: 'Failed to delete subcategory' 
    };
  }
}
}
