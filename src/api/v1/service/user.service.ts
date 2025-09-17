import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { NewUser, userTable } from '../drizzle/schema/user';
import { AppError } from '../utils/AppError';
import { FilterOptions, filterWithPaginate, PaginationOptions } from '../utils/filterWithPaginate';
import { generateToken } from '../utils/jwt';
import { roleTable } from '../drizzle/schema/role';
import { maintainsTable } from '../drizzle/schema/maintains';

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
    filter: FilterOptions = {}) {
    return await filterWithPaginate(userTable, { pagination, filter });
  }

  // Find user by username
  static async findByUsername(username: string) {
    const user = await db.select().from(userTable).where(eq(userTable.username, username)).limit(1);
    return user[0] || null;
  }

  // Find user by email
  static async findByEmail(email: string) {
    const user = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
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
        type: maintainsTable.type
      },
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
      .from(userTable)
      .leftJoin(roleTable, eq(userTable.roleId, roleTable.id))
      .leftJoin(maintainsTable, eq(userTable.maintainsId, maintainsTable.id))
      .where(eq(userTable.username, username)).limit(1);
    console.log("user", user)
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

}