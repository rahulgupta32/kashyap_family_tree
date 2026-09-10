import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationService } from './migration.service';
import { PersonRepository } from './repositories/person.repository';
import { GenealogyLinkRepository } from './repositories/genealogy-link.repository';
import { ClaimRepository } from './repositories/claim.repository';
import { AuditRepository } from './repositories/audit.repository';
import { CulturalArticleRepository } from './repositories/cultural-article.repository';
import { CalendarEventRepository } from './repositories/calendar-event.repository';

@Global()
@Module({
  providers: [
    DatabaseService,
    MigrationService,
    PersonRepository,
    GenealogyLinkRepository,
    ClaimRepository,
    AuditRepository,
    CulturalArticleRepository,
    CalendarEventRepository,
  ],
  exports: [
    DatabaseService,
    MigrationService,
    PersonRepository,
    GenealogyLinkRepository,
    ClaimRepository,
    AuditRepository,
    CulturalArticleRepository,
    CalendarEventRepository,
  ],
})
export class DatabaseModule {}

