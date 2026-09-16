import { Module, forwardRef } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MalwareScannerService } from './malware-scanner.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [ProfileController],
  providers: [ProfileService, MalwareScannerService],
  exports: [ProfileService, MalwareScannerService],
})
export class ProfileModule {}

