import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { MalwareScannerService } from './malware-scanner.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, MalwareScannerService],
  exports: [ProfileService, MalwareScannerService],
})
export class ProfileModule {}
