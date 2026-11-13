import {Module,Global} from '@nestjs/common';
import {DatabaseModule} from '../../database/database.module';
import {ApplicationSettingsService} from './application-settings.service';
import {ApplicationSettingsController} from './application-settings.controller';
@Global()
@Module({imports:[DatabaseModule],providers:[ApplicationSettingsService],controllers:[ApplicationSettingsController],exports:[ApplicationSettingsService]})
export class ApplicationSettingsModule {}
