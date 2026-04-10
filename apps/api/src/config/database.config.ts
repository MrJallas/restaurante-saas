import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/restaurant_saas',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
};
