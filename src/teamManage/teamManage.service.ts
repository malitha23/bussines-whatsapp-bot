import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like, Not } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as Papa from 'papaparse';

import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { RolePermission } from '../database/entities/role-permission.entity';
import { Business } from '../database/entities/business.entity';
import { Permission } from '../database/entities/permission.entity';
import { Role } from '../database/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { FilterUsersDto } from './dto/filter-users.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { BulkStatusDto, BulkDeleteDto, ActionStatus } from './dto/bulk-action.dto';
import { UserStatus, UserRole } from '../database/entities/user.entity';
import { TeamActivityService } from '../team-activity/team-activity.service';

@Injectable()
export class TeamManageService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Manager)
        private readonly managerRepo: Repository<Manager>,
        @InjectRepository(Staff)
        private readonly staffRepo: Repository<Staff>,
        @InjectRepository(RolePermission)
        private readonly rolePermissionRepo: Repository<RolePermission>,
        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,
        @InjectRepository(Permission)
        private readonly permissionRepo: Repository<Permission>,
        @InjectRepository(Role)
        private readonly roleRepo: Repository<Role>,
        private readonly activityService: TeamActivityService,
    ) { }

    // -------------------------------------------------------
    // Get Business by user
    // -------------------------------------------------------
    private async getBusinessByUser(email: string): Promise<{ businessId: number, businessName: string, business: Business }> {
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
        return {
            businessId: business.id,
            businessName: business.name,
            business: business
        };
    }

    // -------------------------------------------------------
    // Get all users for a business with permissions
    // -------------------------------------------------------
    async getTeamData(email: string) {
        const { businessId } = await this.getBusinessByUser(email);
        const business = await this.businessRepo.findOne({ where: { id: businessId } });
        if (!business) throw new NotFoundException('Business not found');

        // Fetch active managers
        const managers = await this.managerRepo.find({
            where: { business: { id: businessId } },
            relations: ['user', 'business'],
        });

        // Fetch active staff
        const staffMembers = await this.staffRepo.find({
            where: { business: { id: businessId } },
            relations: ['user', 'business'],
        });

        // Merge users with role_type
        const users = [
            ...managers.map((m) => ({
                ...m.user,
                role_type: 'manager',
                status: m.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE,
                business_id: businessId,
                created_at: m.created_at,
                manager_id: m.id,
            })),
            ...staffMembers.map((s) => ({
                ...s.user,
                role_type: 'staff',
                status: s.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE,
                business_id: businessId,
                created_at: s.created_at,
                staff_id: s.id,
            })),
        ];

        // Attach permissions for each user safely
        const usersWithPermissions = await Promise.all(
            users.map(async (user) => {
                const rolePermissions = await this.rolePermissionRepo
                    .createQueryBuilder('rp')
                    .leftJoinAndSelect('rp.permission', 'permission') // ensures permission is loaded
                    .leftJoin('rp.role', 'role')
                    .where('role.name = :role', { role: user.role_type })
                    .andWhere('rp.businessId = :businessId', { businessId })
                    .getMany();

                // Safely map permissions (ignore missing)
                const permissions = rolePermissions
                    .map((rp) => rp.permission?.name)
                    .filter(Boolean) as string[];

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone ?? undefined,
                    role_type: user.role_type,
                    business_id: user.business_id,
                    status: user.status,
                    created_at: user.created_at,
                    permissions,
                    custom_permissions: 'custom_permissions' in user ? user.custom_permissions : [],
                };
            }),
        );

        return usersWithPermissions;
    }


    // -------------------------------------------------------
    // Get single user with permissions
    // -------------------------------------------------------
    async getUserById(email: string, userId: number) {
        const { businessId } = await this.getBusinessByUser(email);

        // Check if user exists in this business
        const user = await this.userRepo.findOne({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Check if user is manager or staff in this business
        const manager = await this.managerRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
            relations: ['business'],
        });

        const staff = await this.staffRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
            relations: ['business'],
        });

        if (!manager && !staff) {
            throw new NotFoundException('User not found in this business');
        }

        const role_type = manager ? 'manager' : 'staff';
        const status = manager ? (manager.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE) :
            (staff!.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE);

        // Get permissions
        const rolePermissions = await this.rolePermissionRepo
            .createQueryBuilder('rp')
            .leftJoin('rp.role', 'role')
            .leftJoin('rp.permission', 'permission')
            .where('role.name = :role', { role: role_type })
            .andWhere('rp.businessId = :businessId', { businessId })
            .getMany();

        const permissions = rolePermissions.map((rp) => rp.permission.name);

        return {
            ...user,
            role_type,
            business_id: businessId,
            status,
            permissions,
            custom_permissions: 'custom_permissions' in user ? user.custom_permissions : [],
        };
    }

    async createUser(email: string, createUserDto: CreateUserDto) {
        const { businessId, business, businessName } = await this.getBusinessByUser(email);
        const addedBy = await this.userRepo.findOne({ where: { email } });

        // Check if user already exists
        const existingUser = await this.userRepo.findOne({
            where: { email: createUserDto.email },
        });

        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        // Create user entity
        const newUser = this.userRepo.create({
            name: createUserDto.name,
            email: createUserDto.email,
            phone: createUserDto.phone ?? undefined,
            password: hashedPassword,
            role_type: createUserDto.role_type,
        });

        const savedUser = await this.userRepo.save(newUser);

        // Assign to manager or staff table
        if (createUserDto.role_type === UserRole.MANAGER) {
            const manager = this.managerRepo.create({
                user: savedUser,
                business: { id: businessId },
                is_active: createUserDto.status === UserStatus.ACTIVE,
            });
            await this.managerRepo.save(manager);
        } else if (createUserDto.role_type === UserRole.STAFF) {
            const staff = this.staffRepo.create({
                user: savedUser,
                business: { id: businessId },
                is_active: createUserDto.status === UserStatus.ACTIVE,
            });
            await this.staffRepo.save(staff);
        }

        // Log activity
        await this.activityService.logActivity(
            addedBy!,
            business,
            `added user ${savedUser.name} (${savedUser.email}) to the business as ${createUserDto.role_type}`,
        );

        // Fetch permissions
        const rolePermissions = await this.rolePermissionRepo
            .createQueryBuilder('rp')
            .leftJoinAndSelect('rp.permission', 'permission')
            .leftJoin('rp.role', 'role')
            .where('role.name = :role', { role: createUserDto.role_type })
            .andWhere('rp.businessId = :businessId', { businessId })
            .getMany();

        const permissions = rolePermissions
            .map((rp) => rp.permission?.name)
            .filter(Boolean) as string[];

        // Return user with permissions, without password
        return {
            ...savedUser,
            password: undefined,
            role_type: createUserDto.role_type,
            business_id: businessId,
            status: createUserDto.status || UserStatus.ACTIVE,
            permissions,
        };
    }

    // -------------------------------------------------------
    // Update team member
    // -------------------------------------------------------
    async updateUser(email: string, userId: number, updateUserDto: UpdateUserDto) {
        // Get business info and current user performing the update
        const { businessId, business } = await this.getBusinessByUser(email);
        const updatedBy = await this.userRepo.findOne({ where: { email } });
        if (!updatedBy) throw new NotFoundException('User performing update not found');

        // Get user to update
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const oldRole = user.role_type;
        const oldStatus = await this.getUserStatus(userId, businessId);

        // Check if email is changing and already taken
        if (updateUserDto.email && updateUserDto.email !== user.email) {
            const existingUser = await this.userRepo.findOne({ where: { email: updateUserDto.email } });
            if (existingUser && existingUser.id !== userId) {
                throw new ConflictException('Email already in use');
            }
        }

        // Update user fields safely
        if (updateUserDto.name) user.name = updateUserDto.name;
        if (updateUserDto.email) user.email = updateUserDto.email;
        if (updateUserDto.phone !== undefined) user.phone = updateUserDto.phone;

        if (updateUserDto.password) {
            const hashedPassword = await bcrypt.hash(updateUserDto.password, 10);
            user.password = hashedPassword;
        }

        // Handle role changes
        if (updateUserDto.role_type) {
            user.role_type = updateUserDto.role_type as UserRole;

            // Find existing manager/staff records
            const manager = await this.managerRepo.findOne({
                where: { user: { id: userId }, business: { id: businessId } },
            });
            const staff = await this.staffRepo.findOne({
                where: { user: { id: userId }, business: { id: businessId } },
            });

            if (updateUserDto.role_type === 'manager') {
                // Remove staff if exists
                if (staff) await this.staffRepo.remove(staff);
                // Add manager if not exists
                if (!manager) {
                    const newManager = this.managerRepo.create({
                        user,
                        business: { id: businessId },
                        is_active: updateUserDto.status === UserStatus.ACTIVE,
                    });
                    await this.managerRepo.save(newManager);
                }
            } else if (updateUserDto.role_type === 'staff') {
                // Remove manager if exists
                if (manager) await this.managerRepo.remove(manager);
                // Add staff if not exists
                if (!staff) {
                    const newStaff = this.staffRepo.create({
                        user,
                        business: { id: businessId },
                        is_active: updateUserDto.status === UserStatus.ACTIVE,
                    });
                    await this.staffRepo.save(newStaff);
                }
            }
        }

        // Save updated user
        const updatedUser = await this.userRepo.save(user);

        // Update active status in manager/staff tables
        const manager = await this.managerRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });
        const staff = await this.staffRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });

        if (manager) {
            manager.is_active = updateUserDto.status === UserStatus.ACTIVE;
            await this.managerRepo.save(manager);
        } else if (staff) {
            staff.is_active = updateUserDto.status === UserStatus.ACTIVE;
            await this.staffRepo.save(staff);
        }

        // Log role change safely
        if (updateUserDto.role_type && updateUserDto.role_type !== oldRole) {
            await this.activityService.logActivity(
                updatedBy!,
                business,
                `changed role of ${user.name || 'Unknown'} from ${oldRole} to ${updateUserDto.role_type}`
            );
        }

        // Log status change safely
        if (updateUserDto.status && updateUserDto.status !== oldStatus) {
            await this.activityService.logActivity(
                updatedBy!,
                business,
                `changed status of ${user.name || 'Unknown'} from ${oldStatus} to ${updateUserDto.status}`
            );
        }

        // Get role permissions safely
        const rolePermissions = await this.rolePermissionRepo
            .createQueryBuilder('rp')
            .leftJoin('rp.role', 'role')
            .leftJoin('rp.permission', 'permission')
            .where('role.name = :role', { role: user.role_type })
            .andWhere('rp.businessId = :businessId', { businessId })
            .getMany();

        const permissions = rolePermissions
            .map((rp) => rp.permission?.name)
            .filter(Boolean); // remove undefined permissions

        return {
            ...updatedUser,
            password: undefined,
            role_type: user.role_type,
            business_id: businessId,
            permissions,
        };
    }


    private async getUserStatus(userId: number, businessId: number): Promise<UserStatus> {
        const manager = await this.managerRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });

        const staff = await this.staffRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });

        if (manager) {
            return manager.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE;
        } else if (staff) {
            return staff.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE;
        }

        return UserStatus.INACTIVE;
    }


    // -------------------------------------------------------
    // Delete team member
    // -------------------------------------------------------
    async deleteUser(email: string, userId: number) {
        const { businessId, business } = await this.getBusinessByUser(email);
        const deletedBy = await this.userRepo.findOne({ where: { email } });

        // Check if user is the owner
        const business2 = await this.businessRepo.findOne({
            where: { id: businessId, owner: { id: userId } },
        });

        if (business2) {
            throw new BadRequestException('Cannot delete business owner');
        }

        // Get user info before deletion for logging
        const userToDelete = await this.userRepo.findOne({ where: { id: userId } });

        // Remove from manager table
        const manager = await this.managerRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });

        if (manager) {
            await this.managerRepo.remove(manager);
        }

        // Remove from staff table
        const staff = await this.staffRepo.findOne({
            where: { user: { id: userId }, business: { id: businessId } },
        });

        if (staff) {
            await this.staffRepo.remove(staff);
        }

        // Check if user is associated with any other business
        const otherManager = await this.managerRepo.findOne({
            where: { user: { id: userId } },
        });

        const otherStaff = await this.staffRepo.findOne({
            where: { user: { id: userId } },
        });

        // Only delete user if not associated with any other business
        if (!otherManager && !otherStaff) {
            await this.userRepo.delete(userId);
        }

        // Log activity
        if (userToDelete) {
            await this.activityService.logActivity(
                deletedBy!,
                business,
                `removed user ${userToDelete.name} (${userToDelete.email}) from the business`,
            );
        }

        return { message: 'User removed from business successfully' };
    }

    // // -------------------------------------------------------
    // // Update user permissions
    // // -------------------------------------------------------
    // async updateUserPermissions(email: string, updatePermissionsDto: UpdatePermissionsDto) {
    //     const { businessId } = await this.getBusinessIdByUser(email);

    //     // Check if user exists in this business
    //     const manager = await this.managerRepo.findOne({
    //         where: { user: { id: updatePermissionsDto.userId }, business: { id: businessId } },
    //         relations: ['user'],
    //     });

    //     const staff = await this.staffRepo.findOne({
    //         where: { user: { id: updatePermissionsDto.userId }, business: { id: businessId } },
    //         relations: ['user'],
    //     });

    //     if (!manager && !staff) {
    //         throw new NotFoundException('User not found in this business');
    //     }

    //     const user = manager?.user || staff?.user;

    //     // Update custom permissions
    //     user.custom_permissions = updatePermissionsDto.permissions;
    //     await this.userRepo.save(user);

    //     return {
    //         ...user,
    //         password: undefined,
    //         permissions: updatePermissionsDto.permissions,
    //     };
    // }

    // // -------------------------------------------------------
    // // Update user status
    // // -------------------------------------------------------
    // async updateUserStatus(email: string, userId: number, status: UserStatus) {
    //     const { businessId } = await this.getBusinessIdByUser(email);

    //     // Update user status
    //     const user = await this.userRepo.findOne({ where: { id: userId } });
    //     if (user) {
    //         user.status = status;
    //         await this.userRepo.save(user);
    //     }

    //     // Update manager/staff active status
    //     const manager = await this.managerRepo.findOne({
    //         where: { user: { id: userId }, business: { id: businessId } },
    //     });

    //     const staff = await this.staffRepo.findOne({
    //         where: { user: { id: userId }, business: { id: businessId } },
    //     });

    //     if (manager) {
    //         manager.is_active = status === UserStatus.ACTIVE;
    //         await this.managerRepo.save(manager);
    //     } else if (staff) {
    //         staff.is_active = status === UserStatus.ACTIVE;
    //         await this.staffRepo.save(staff);
    //     }

    //     return { message: 'User status updated successfully' };
    // }

    // -------------------------------------------------------
    // Bulk update user status
    // -------------------------------------------------------
    async bulkUpdateStatus(email: string, bulkStatusDto: BulkStatusDto) {
        const { businessId, business } = await this.getBusinessByUser(email);
        const updatedBy = await this.userRepo.findOne({ where: { email } });

        const isActive = bulkStatusDto.status === UserStatus.ACTIVE;
        const statusText = isActive ? 'activated' : 'deactivated';

        // Get user names for logging
        const users = await this.userRepo.find({
            where: { id: In(bulkStatusDto.userIds) },
        });

        // MANAGERS
        await this.managerRepo
            .createQueryBuilder()
            .update(Manager)
            .set({ is_active: isActive })
            .where('user.id IN (:...userIds)', { userIds: bulkStatusDto.userIds })
            .andWhere('business.id = :businessId', { businessId })
            .execute();

        // STAFF
        await this.staffRepo
            .createQueryBuilder()
            .update(Staff)
            .set({ is_active: isActive })
            .where('user.id IN (:...userIds)', { userIds: bulkStatusDto.userIds })
            .andWhere('business.id = :businessId', { businessId })
            .execute();

        // Log activity
        const userNames = users.map(u => u.name).join(', ');
        await this.activityService.logActivity(
            updatedBy!,
            business,
            `${statusText} ${users.length} users: ${userNames}`,
        );

        return {
            message: `${bulkStatusDto.userIds.length} users updated successfully`,
        };
    }


    // -------------------------------------------------------
    // Bulk delete users
    // -------------------------------------------------------
    async bulkDeleteUsers(email: string, bulkDeleteDto: BulkDeleteDto) {
        const isDelete = bulkDeleteDto.status === ActionStatus.DELETE;
        if (!isDelete) return { message: `Wrong Action` };

        const { businessId, business } = await this.getBusinessByUser(email);
        const deletedBy = await this.userRepo.findOne({ where: { email } });

        // Prevent deleting business owner
        const business2 = await this.businessRepo.findOne({
            where: { id: businessId, owner: { id: In(bulkDeleteDto.userIds) } },
        });

        if (business2) {
            throw new BadRequestException('Cannot delete business owner');
        }

        // Get user info before deletion for logging
        const usersToDelete = await this.userRepo.find({
            where: { id: In(bulkDeleteDto.userIds) },
        });

        // Remove manager relations
        await this.managerRepo.delete({
            user: { id: In(bulkDeleteDto.userIds) },
            business: { id: businessId },
        });

        // Remove staff relations
        await this.staffRepo.delete({
            user: { id: In(bulkDeleteDto.userIds) },
            business: { id: businessId },
        });

        // Delete users not linked to ANY business anymore
        const usersToDeletePermanently = await this.userRepo
            .createQueryBuilder('user')
            .leftJoin('user.managedBusinesses', 'manager')
            .leftJoin('user.staffAssignments', 'staff')
            .where('user.id IN (:...userIds)', { userIds: bulkDeleteDto.userIds })
            .andWhere('manager.id IS NULL')
            .andWhere('staff.id IS NULL')
            .getMany();

        if (usersToDeletePermanently.length > 0) {
            await this.userRepo.delete(usersToDeletePermanently.map(u => u.id));
        }

        // Log activity
        const userNames = usersToDelete.map(u => u.name).join(', ');
        await this.activityService.logActivity(
            deletedBy!,
            business,
            `removed ${usersToDelete.length} users from business: ${userNames}`,
        );

        return { message: `${bulkDeleteDto.userIds.length} users removed successfully` };
    }

    // -------------------------------------------------------
    // Export users to CSV
    // -------------------------------------------------------
    async exportUsers(email: string) {
        const users = await this.getTeamData(email);

        const csvData = users.map(user => ({
            Name: user.name,
            Email: user.email,
            Phone: user.phone || '',
            Role: user.role_type,
            Status: user.status,
            'Joined Date': new Date(user.created_at).toLocaleDateString('en-US'),
            Permissions: user.permissions.join(', '),
        }));

        const csv = Papa.unparse(csvData);

        return csv;
    }

    // // -------------------------------------------------------
    // // Filter users with pagination
    // // -------------------------------------------------------
    // async filterUsers(email: string, filterDto: FilterUsersDto) {
    //     const { businessId } = await this.getBusinessIdByUser(email);
    //     const { search, role_type, status, page = 1, limit = 10 } = filterDto;
    //     const skip = (page - 1) * limit;

    //     // Get all users for the business
    //     let users = await this.getTeamData(email);

    //     // Apply filters
    //     if (search) {
    //         const searchTerm = search.toLowerCase();
    //         users = users.filter(user =>
    //             user.name.toLowerCase().includes(searchTerm) ||
    //             user.email.toLowerCase().includes(searchTerm) ||
    //             (user.phone && user.phone.toLowerCase().includes(searchTerm))
    //         );
    //     }

    //     if (role_type) {
    //         users = users.filter(user => user.role_type === role_type);
    //     }

    //     if (status) {
    //         users = users.filter(user => user.status === status);
    //     }

    //     // Apply pagination
    //     const total = users.length;
    //     const paginatedUsers = users.slice(skip, skip + limit);

    //     return {
    //         data: paginatedUsers,
    //         meta: {
    //             total,
    //             page,
    //             limit,
    //             totalPages: Math.ceil(total / limit),
    //         },
    //     };
    // }

    // -------------------------------------------------------
    // Get available permissions
    // -------------------------------------------------------
    async getAvailablePermissions() {
        const permissions = await this.permissionRepo.find({
            order: { name: 'ASC' },
        });

        return permissions.map(permission => ({
            id: permission.name,
            name: permission.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: permission.description,
            status: permission.status,
        }));
    }

    // -------------------------------------------------------
    // Get role definitions
    // -------------------------------------------------------
    async getRoleDefinitions(email: string) {
        const { businessId } = await this.getBusinessByUser(email);

        // Fetch all RolePermissions for the business with role and permission relations
        const rolePermissions = await this.rolePermissionRepo.find({
            where: { business: { id: businessId } },
            relations: ['role', 'permission'],
        });

        // Aggregate permissions by role
        const roleDefinitions: Record<
            string,
            { name: string; description?: string; permissions: { name: string; status: number }[] }
        > = {};

        rolePermissions.forEach(rp => {
            const roleName = rp.role.name; // e.g., 'owner', 'manager', 'staff'
            if (!roleDefinitions[roleName]) {
                roleDefinitions[roleName] = {
                    name: rp.role.name.charAt(0).toUpperCase() + rp.role.name.slice(1),
                    description: rp.role.description || '',
                    permissions: [],
                };
            }

            if (rp.permission) {
                roleDefinitions[roleName].permissions.push({
                    name: rp.permission.name,
                    status: rp.status, // 1 active, 0 inactive
                });
            }
        });

        return roleDefinitions;
    }

    // -------------------------------------------------------
    // Update a role's permission
    // -------------------------------------------------------
    async updateRolePermission(
        roleName: string,
        permissionName: string,
        status: number | null,
        email: string
    ): Promise<{ role: string; permission: string; status: number | null }> {
        const { businessId, business } = await this.getBusinessByUser(email);
        const updatedBy = await this.userRepo.findOne({ where: { email } });

        // 1. Find the role
        const role = await this.roleRepo.findOne({ where: { name: roleName } });
        if (!role) throw new NotFoundException(`Role "${roleName}" not found`);

        // 2. Find the permission
        const permission = await this.permissionRepo.findOne({ where: { name: permissionName } });
        if (!permission) throw new NotFoundException(`Permission "${permissionName}" not found`);

        // 3. Find existing RolePermission
        let rolePermission = await this.rolePermissionRepo.findOne({
            where: { role: { id: role.id }, permission: { id: permission.id }, business: { id: businessId } },
            relations: ['role', 'permission', 'business'],
        });

        const action = status === null ? 'removed' : (status === 1 ? 'enabled' : 'disabled');

        if (status === null) {
            // Remove RolePermission if exists
            if (rolePermission) {
                await this.rolePermissionRepo.remove(rolePermission);
            }
        } else {
            // Create or update RolePermission
            if (!rolePermission) {
                rolePermission = this.rolePermissionRepo.create({
                    role,
                    permission,
                    status,
                    business: { id: businessId }
                });
            } else {
                rolePermission.status = status;
            }
            await this.rolePermissionRepo.save(rolePermission);
        }

        // Log activity
        await this.activityService.logActivity(
            updatedBy!,
            business,
            `${action} permission "${permissionName}" for role "${roleName}"`,
        );

        return { role: role.name, permission: permission.name, status };
    }


    // private getDefaultPermissions(roleName: string): string[] {
    //     switch (roleName) {
    //         case 'owner':
    //             return ['all'];
    //         case 'manager':
    //             return ['view_orders', 'manage_inventory', 'manage_users', 'view_reports'];
    //         case 'staff':
    //             return ['view_orders', 'manage_inventory'];
    //         case 'viewer':
    //             return ['view_orders', 'view_reports'];
    //         default:
    //             return [];
    //     }
    // }
}