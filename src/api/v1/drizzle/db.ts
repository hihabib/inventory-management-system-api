import { drizzle } from "drizzle-orm/node-postgres";
import { DATABASE_URL } from "../config/env.js";

export const db = drizzle(DATABASE_URL as string);
