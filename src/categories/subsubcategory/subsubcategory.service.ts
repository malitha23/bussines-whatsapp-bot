import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductSubSubCategory } from '../../database/entities/product-subsub-category.entity';
import { ProductSubCategory } from '../../database/entities/product-subcategory.entity';
import { Business } from '../../database/entities/business.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { User } from '../../database/entities/user.entity';
import { TeamActivityService } from '../../team-activity/team-activity.service';

@Injectable()
export class SubSubCategoryService {
  constructor(
    @InjectRepository(ProductSubSubCategory)
    private readonly subSubCategoryRepo: Repository<ProductSubSubCategory>,

    @InjectRepository(ProductSubCategory)
    private readonly subcategoryRepo: Repository<ProductSubCategory>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,

    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,

    private readonly activityService: TeamActivityService
  ) { }

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

  // Create a sub-subcategory under a subcategory
  async createSubSubCategory(name: string, subcategoryId: number, email: string) {
    // Get business for the user
    const { business } = await this.getBusinessByUser(email);

    // Get the user
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    // Get subcategory with its parent category
    const subcategory = await this.subcategoryRepo.findOne({
      where: { id: subcategoryId },
      relations: ['category'], // Ensure category relation is loaded
    });
    if (!subcategory) throw new NotFoundException('SubCategory not found');

    // Create the new sub-subcategory
    const subSubCategory = this.subSubCategoryRepo.create({ name, subcategory });

    // Safely get category name for logging
    const categoryName = subcategory.category?.name || 'Unknown Category';

    // Log activity
    await this.activityService.logActivity(
      user,
      business,
      `created new sub-subcategory "${subSubCategory.name}" under subcategory "${subcategory.name}" (category: "${categoryName}")`,
    );

    // Save and return
    return this.subSubCategoryRepo.save(subSubCategory);
  }


  // Get all sub-subcategories with their subcategory
  async getAllSubSubCategories() {
    return this.subSubCategoryRepo.find({ relations: ['subcategory'] });
  }

  // Get single sub-subcategory by ID
  async getSubSubCategory(id: number) {
    const subSubCategory = await this.subSubCategoryRepo.findOne({
      where: { id },
      relations: ['subcategory', 'products'],
    });
    if (!subSubCategory) throw new NotFoundException('SubSubCategory not found');
    return subSubCategory;
  }

  // Update sub-subcategory name
  async updateSubSubCategory(id: number, name: string, email: string) {
    // Get business
    const { business } = await this.getBusinessByUser(email);

    // Get user
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    // Get sub-subcategory with relations
    const subSubCategory = await this.subSubCategoryRepo.findOne({
      where: { id },
      relations: ['subcategory', 'subcategory.category'], // Load subcategory and category
    });
    if (!subSubCategory) throw new NotFoundException('SubSubCategory not found');

    // Update name
    const oldName = subSubCategory.name;
    subSubCategory.name = name;
    const updatedSubSubCategory = await this.subSubCategoryRepo.save(subSubCategory);

    // Safe logging
    const subcategoryName = subSubCategory.subcategory?.name || 'Unknown Subcategory';
    const categoryName = subSubCategory.subcategory?.category?.name || 'Unknown Category';

    await this.activityService.logActivity(
      user,
      business,
      `updated sub-subcategory from "${oldName}" to "${updatedSubSubCategory.name}" in subcategory "${subcategoryName}" (category: "${categoryName}")`,
    );

    return {
      success: true,
      message: 'Sub-subcategory updated successfully',
      data: updatedSubSubCategory,
    };
  }


  // Delete sub-subcategory
  async deleteSubSubCategory(id: number, email: string) {
    try {
      const { business } = await this.getBusinessByUser(email);
      const user = await this.userRepo.findOne({ where: { email } });

      const subSubCategory = await this.subSubCategoryRepo.findOne({
        where: { id },
        relations: ['subcategory', 'subcategory.category', 'subcategory.category.business', 'products'],
      });

      if (!subSubCategory) {
        return {
          success: false,
          message: 'Sub-subcategory not found'
        };
      }

      // Check if sub-subcategory belongs to user's business
      if (subSubCategory.subcategory.category.business.id !== business.id) {
        return {
          success: false,
          message: 'You do not have permission to delete this sub-subcategory'
        };
      }

      // Count products for logging
      const productCount = subSubCategory.products?.length || 0;

      await this.subSubCategoryRepo.remove(subSubCategory);

      // Log activity
      let details = '';
      if (productCount > 0) {
        details = ` (Note: ${productCount} products were associated with this sub-subcategory)`;
      }

      await this.activityService.logActivity(
        user!,
        business,
        `deleted sub-subcategory "${subSubCategory.name}" from subcategory "${subSubCategory.subcategory.name}" (category: "${subSubCategory.subcategory.category.name}")${details}`,
      );

      return {
        success: true,
        message: 'Sub-subcategory deleted successfully'
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Check for foreign key constraint error
        if (error.message.includes('foreign key constraint')) {
          return {
            success: false,
            message: 'Cannot delete sub-subcategory because it has associated products. Remove or reassign products first.'
          };
        }
        return {
          success: false,
          message: error.message
        };
      }
      return {
        success: false,
        message: 'Failed to delete sub-subcategory'
      };
    }
  }
}
