import bcrypt from 'bcrypt';
import { eq, isNull, and, or, ilike, SQL } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { NewUser, userTable } from '../drizzle/schema/user';
import { AppError } from '../utils/AppError';
import { FilterOptions, filterWithPaginate, PaginationOptions } from '../utils/filterWithPaginate';
import { generateToken } from '../utils/jwt';
import { roleTable } from '../drizzle/schema/role';
import { maintainsTable } from '../drizzle/schema/maintains';
import { getCurrentDate } from '../utils/timezone';

export class UserService {
  // Create a new user
  static async createUser(userData: NewUser) {
    // Hash the password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create the user with hashed password
    const newUser = {
      ...userData,
      password: hashedPassword,
    };



    // Insert the user into the database
    const [createdUser] = await db.insert(userTable).values(newUser).returning();

    if (!createdUser) {
      throw new AppError('Failed to create user', 500);
    }

    // Return the user without the password
    const { password, ...userWithoutPassword } = createdUser;
    return userWithoutPassword;
  }
  static async getUsers(pagination: PaginationOptions = {},
    filter: FilterOptions = {}, search?: string) {
    
    let whereCondition: SQL | undefined = isNull(userTable.deletedAt);

    if (search) {
      const searchCondition = or(
        ilike(userTable.username, `%${search}%`),
        ilike(userTable.email, `%${search}%`),
        ilike(userTable.fullName, `%${search}%`)
      );
      whereCondition = and(whereCondition, searchCondition);
    }

    return await filterWithPaginate(userTable, { 
      pagination, 
      filter,
      where: whereCondition,
      joins: [
        {
          table: roleTable,
          alias: 'role',
          condition: eq(userTable.roleId, roleTable.id),
          type: 'left'
        },
        {
          table: maintainsTable,
          alias: 'maintains',
          condition: eq(userTable.maintainsId, maintainsTable.id),
          type: 'left'
        }
      ],
      select: {
        id: userTable.id,
        username: userTable.username,
        email: userTable.email,
        fullName: userTable.fullName,
        role: {
          roleId: userTable.roleId,
          roleName: roleTable.name,
          defaultRoute: roleTable.defaultRoute
        },
        maintains: {
          maintainsId: userTable.maintainsId,
          name: maintainsTable.name,
          type: maintainsTable.type,
          description: maintainsTable.description,
          location: maintainsTable.location,
          phone: maintainsTable.phone,
        },
        createdAt: userTable.createdAt,
        updatedAt: userTable.updatedAt,
      }
    });
  }

  // Find user by username
  static async findByUsername(username: string) {
    const user = await db.select().from(userTable).where(and(eq(userTable.username, username), isNull(userTable.deletedAt))).limit(1);
    return user[0] || null;
  }

  // Find user by email
  static async findByEmail(email: string) {
    const user = await db.select().from(userTable).where(and(eq(userTable.email, email), isNull(userTable.deletedAt))).limit(1);
    return user[0] || null;
  }

  // Validate user password
  static async validatePassword(user: typeof userTable.$inferSelect, password: string) {
    return await bcrypt.compare(password, user.password);
  }

  // Sign in user
  static async signIn(username: string, password: string) {
    // Find user by username
    const user = await db.select({
      id: userTable.id,
      username: userTable.username,
      password: userTable.password,
      email: userTable.email,
      fullName: userTable.fullName,
      role: {
        roleId: userTable.roleId,
        roleName: roleTable.name,
        defaultRoute: roleTable.defaultRoute
      },
      maintains: {
        maintainsId: userTable.maintainsId,
        name: maintainsTable.name,
        type: maintainsTable.type,
        description: maintainsTable.description,
        location: maintainsTable.location,
        phone: maintainsTable.phone,
      },
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
      .from(userTable)
      .leftJoin(roleTable, eq(userTable.roleId, roleTable.id))
      .leftJoin(maintainsTable, eq(userTable.maintainsId, maintainsTable.id))
      .where(and(eq(userTable.username, username), isNull(userTable.deletedAt))).limit(1);
    if (!user || user.length === 0) {
      throw new AppError('Invalid username or password', 401);
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user[0].password);

    if (!isValidPassword) {
      throw new AppError('Invalid username or password', 401);
    }

    // Generate JWT token with role
    const token = generateToken({
      id: user[0].id,
      username: user[0].username,
      email: user[0].email,
      roleId: user[0].role.roleId,
    });

    // Return user data without password and token
    const { password: _, ...userWithoutPassword } = user[0];

    return {
      user: userWithoutPassword,
      token
    };
  }
 
  static async getUserByIdWithRoleMaintains(id: string) {
    const rows = await db.select({
      id: userTable.id,
      username: userTable.username,
      email: userTable.email,
      fullName: userTable.fullName,
      role: {
        roleId: userTable.roleId,
        roleName: roleTable.name,
        defaultRoute: roleTable.defaultRoute
      },
      maintains: {
        maintainsId: userTable.maintainsId,
        name: maintainsTable.name,
        type: maintainsTable.type,
        description: maintainsTable.description,
        location: maintainsTable.location,
        phone: maintainsTable.phone,
      },
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
      .from(userTable)
      .leftJoin(roleTable, eq(userTable.roleId, roleTable.id))
      .leftJoin(maintainsTable, eq(userTable.maintainsId, maintainsTable.id))
      .where(and(eq(userTable.id, id), isNull(userTable.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }
 
  static async updateUser(id: string, updates: Partial<NewUser>) {
    const existing = await db.select().from(userTable).where(and(eq(userTable.id, id), isNull(userTable.deletedAt))).limit(1);
    if (!existing || existing.length === 0) {
      throw new AppError('User not found', 404);
    }
    if (updates.username) {
      const u = await db.select().from(userTable).where(and(eq(userTable.username, updates.username), isNull(userTable.deletedAt))).limit(1);
      if (u[0] && u[0].id !== id) {
        throw new AppError('Username already exists', 409);
      }
    }
    if (updates.email) {
      const u = await db.select().from(userTable).where(and(eq(userTable.email, updates.email), isNull(userTable.deletedAt))).limit(1);
      if (u[0] && u[0].id !== id) {
        throw new AppError('Email already exists', 409);
      }
    }
    if (typeof updates.password === 'string' && updates.password.length > 0) {
      const hashedPassword = await bcrypt.hash(updates.password, 10);
      updates.password = hashedPassword;
    } else {
      delete (updates as any).password;
    }
    const updateData = {
      ...updates,
      updatedAt: getCurrentDate()
    } as Partial<NewUser> & { updatedAt: Date };
    const [updated] = await db.update(userTable).set(updateData).where(eq(userTable.id, id)).returning();
    const { password, ...userWithoutPassword } = updated as any;
    return userWithoutPassword;
  }

  static async deleteUser(id: string) {
    const existing = await db.select().from(userTable).where(eq(userTable.id, id)).limit(1);
    if (!existing || existing.length === 0) {
      return null;
    }
    const [deleted] = await db.update(userTable)
      .set({ deletedAt: getCurrentDate() })
      .where(eq(userTable.id, id))
      .returning();
    if (!deleted) {
      return null;
    }
    const { password, ...userWithoutPassword } = deleted as any;
    return userWithoutPassword;
  }
}
