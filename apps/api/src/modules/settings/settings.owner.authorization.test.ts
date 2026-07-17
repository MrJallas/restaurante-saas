import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { issueStaffSessionToken } from '../../common/auth/staff-session-token';
import { OwnerOnlyGuard } from '../../common/guards/owner-only.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { RedisService } from '../../infra/redis/redis.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const SLUG = 'restaurant_demo';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MANAGER_ID = '22222222-2222-4222-8222-222222222222';
const SETTINGS_VERSION = '2026-07-11T12:00:00.000Z';

function redisFake() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
  };
}

describe('GET/PATCH /settings/establishment authorization', () => {
  let app: INestApplication;
  const getOwnerEstablishmentSettings = jest.fn(async () => ({
    restaurantName: 'Casa',
    updatedAt: SETTINGS_VERSION,
  }));
  const updateOwnerEstablishmentSettings = jest.fn(async () => ({ restaurantName: 'Casa Nova' }));
  const redis = redisFake();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        StaffOnlyGuard,
        OwnerOnlyGuard,
        {
          provide: RedisService,
          useValue: redis,
        },
        {
          provide: TenantConnectionProvider,
          useValue: {
            getTenantSlug: () => SLUG,
            query: jest.fn(async (_sql: string, params?: unknown[]) => {
              if (params?.[0] === OWNER_ID) return [{ role: 'owner' }];
              if (params?.[0] === MANAGER_ID) return [{ role: 'manager' }];
              return [];
            }),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getOwnerEstablishmentSettings,
            updateOwnerEstablishmentSettings,
          },
        },
        {
          provide: CallerResolverService,
          useValue: { requireActiveStaffId: jest.fn(async () => OWNER_ID) },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('manager recebe 403 tanto no GET quanto no PATCH', async () => {
    const token = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: MANAGER_ID,
      role: 'manager',
      slug: SLUG,
    });

    await request(app.getHttpServer())
      .get(`/${SLUG}/settings/establishment`)
      .set('x-staff-token', token.token)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/${SLUG}/settings/establishment`)
      .set('x-staff-token', token.token)
      .send({ restaurantName: 'Tentativa' })
      .expect(403);
  });

  it('owner lê e persiste via os dois endpoints', async () => {
    const token = await issueStaffSessionToken(redis as unknown as RedisService, {
      staffId: OWNER_ID,
      role: 'owner',
      slug: SLUG,
    });

    await request(app.getHttpServer())
      .get(`/${SLUG}/settings/establishment`)
      .set('x-staff-token', token.token)
      .expect(200)
      .expect(({ body }) => expect(body.restaurantName).toBe('Casa'));
    await request(app.getHttpServer())
      .patch(`/${SLUG}/settings/establishment`)
      .set('x-staff-token', token.token)
      .send({ restaurantName: 'Casa Nova', expectedUpdatedAt: SETTINGS_VERSION })
      .expect(200)
      .expect(({ body }) => expect(body.restaurantName).toBe('Casa Nova'));
  });
});
