import { Global, Module } from '@nestjs/common';
import { MongoModule } from '../../infra/mongo/mongo.module';
import { SecurityAuditService } from './security-audit.service';

@Global()
@Module({
  imports: [MongoModule],
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
