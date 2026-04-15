import { Module, Global } from '@nestjs/common';
import { AiServiceClient } from './ai-service.client';

@Global()
@Module({
  providers: [AiServiceClient],
  exports: [AiServiceClient],
})
export class AiModule {}
