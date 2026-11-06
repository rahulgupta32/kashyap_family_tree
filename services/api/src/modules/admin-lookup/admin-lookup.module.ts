import {Module} from '@nestjs/common';
import {GenealogyModule} from '../genealogy/genealogy.module';
import {ClaimsModule} from '../claims/claims.module';
import {ChangeRequestsModule} from '../change-requests/change-requests.module';
import {AdminLookupService} from './admin-lookup.service';
import {AdminLookupController} from './admin-lookup.controller';
@Module({imports:[GenealogyModule,ClaimsModule,ChangeRequestsModule],providers:[AdminLookupService],controllers:[AdminLookupController]})
export class AdminLookupModule {}
