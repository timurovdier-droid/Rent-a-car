import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const defaultFile = process.env.VERCEL === '1' ? 'file:/tmp/qween.db' : 'file:qween.db';

export const config = {
  port: process.env.PORT || 3000,
  tursoUrl: process.env.TURSO_DATABASE_URL || defaultFile,
  tursoToken: process.env.TURSO_AUTH_TOKEN || undefined,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'qween-dev-secret-change-me',
  },
};
