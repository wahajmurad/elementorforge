import { execSync } from 'child_process';

/** Push the Prisma schema to a dedicated test database before the suite. */
export default function setup() {
  execSync('bun run db:push', {
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/test.db' },
    stdio: 'inherit',
  });
}
