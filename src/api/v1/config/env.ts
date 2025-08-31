import "dotenv/config";

export const DATABASE_URL = process.env.DATABASE_URL as string;
export const PORT = process.env.PORT as string;
export const JWT_SECRET = process.env.JWT_SECRET as string
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN as string;