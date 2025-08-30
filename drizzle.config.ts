    // drizzle.config.ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/api/v1/drizzle/schema',
    out: './src/api/v1/drizzle/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL as string,
    },
});