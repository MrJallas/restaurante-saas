import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AssistantController } from './assistant.controller';
import type { AssistantService } from './assistant.service';
import type { CallerResolverService } from '../../common/services/caller-resolver.service';

const AUTHENTICATED_MANAGER = '11111111-1111-4111-8111-111111111111';
const SPOOFED_OWNER = '22222222-2222-4222-8222-222222222222';

describe('AssistantController.staffToCustomer — autoria canônica', () => {
  it('ignora fromStaffId do body e assina com o token autenticado', async () => {
    const sendStaffToCustomer = jest.fn(async (input) => input);
    const resolver = {
      requireActiveStaffIdentity: jest.fn(async () => ({
        staffId: AUTHENTICATED_MANAGER,
        role: 'manager',
      })),
    };
    const controller = new AssistantController(
      { sendStaffToCustomer } as unknown as AssistantService,
      resolver as unknown as CallerResolverService,
    );
    const req = {
      headers: {},
      staffAuth: { staffId: AUTHENTICATED_MANAGER },
    } as unknown as Request;

    await controller.staffToCustomer(
      {
        tableSessionId: '33333333-3333-4333-8333-333333333333',
        toCustomerId: '44444444-4444-4444-8444-444444444444',
        message: 'Olá',
        fromStaffId: SPOOFED_OWNER,
      },
      'restaurant_demo',
      req,
    );

    expect(sendStaffToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ fromStaffId: AUTHENTICATED_MANAGER }),
    );
    expect(sendStaffToCustomer).not.toHaveBeenCalledWith(
      expect.objectContaining({ fromStaffId: SPOOFED_OWNER }),
    );
  });

  it('não aceita fallback legado sem token individual', async () => {
    const sendStaffToCustomer = jest.fn();
    const controller = new AssistantController(
      { sendStaffToCustomer } as unknown as AssistantService,
      {} as CallerResolverService,
    );
    try {
      await controller.staffToCustomer(
        {
          tableSessionId: '33333333-3333-4333-8333-333333333333',
          toCustomerId: '44444444-4444-4444-8444-444444444444',
          message: 'Olá',
        },
        'restaurant_demo',
        { headers: { 'x-staff-id': AUTHENTICATED_MANAGER } } as unknown as Request,
      );
      throw new Error('esperava 401');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
    expect(sendStaffToCustomer).not.toHaveBeenCalled();
  });
});
