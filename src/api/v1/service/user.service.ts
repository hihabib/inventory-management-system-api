import { users } from '../drizzle/schema/user';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError';
import { generateToken } from '../utils/jwt';
import { db } from '../drizzle/db';
import { UserRole } from '../middleware/role';

export class UserService {
  // Create a new user
  static async createUser(userData: Omit<typeof users.$inferInsert, 'id'>) {
    // Hash the password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create the user with hashed password
    const newUser: Omit<typeof users.$inferInsert, 'id'> = {
      ...userData,
      password: hashedPassword,
    };

    // Insert the user into the database
    const [createdUser] = await db.insert(users).values(newUser).returning();

    if (!createdUser) {
      throw new AppError('Failed to create user', 500);
    }

    // Return the user without the password
    const { password, ...userWithoutPassword } = createdUser;
    return userWithoutPassword;
  }

  // Find user by username
  static async findByUsername(username: string) {
    const user = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user[0] || null;
  }

  // Find user by email
  static async findByEmail(email: string) {
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user[0] || null;
  }

  // Validate user password
  static async validatePassword(user: typeof users.$inferSelect, password: string) {
    return await bcrypt.compare(password, user.password);
  }

  // Sign in user
  static async signIn(username: string, password: string) {
    // Find user by username
    const user = await db.select().from(users).where(eq(users.username, username)).limit(1);

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
      role: user[0].role as UserRole
    });

    // Return user data without password and token
    const { password: _, ...userWithoutPassword } = user[0];

    return {
      user: userWithoutPassword,
      token
    };
  }

}