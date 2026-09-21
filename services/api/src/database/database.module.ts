import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationService } from './migration.service';
import { PersonRepository } from './repositories/person.repository';
import { GenealogyLinkRepository } from './repositories/genealogy-link.repository';
import { DuplicateRepository } from './repositories/duplicate.repository';
import { ClaimRepository } from './repositories/claim.repository';
import { AuditRepository } from './repositories/audit.repository';
import { CulturalArticleRepository } from './repositories/cultural-article.repository';
import { CalendarEventRepository } from './repositories/calendar-event.repository';
import { UserRepository } from './repositories/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { BranchRepository } from './repositories/branch.repository';
import { AuditOutboxRepository } from './repositories/audit-outbox.repository';
import { BootstrapService } from './bootstrap.service';

@Global()
@Module({
  providers: [
    DatabaseService,
    MigrationService,
    PersonRepository,
    GenealogyLinkRepository,
    DuplicateRepository,
    ClaimRepository,
    AuditRepository,
    AuditOutboxRepository,
    CulturalArticleRepository,
    CalendarEventRepository,
    UserRepository,
    SessionRepository,
    BranchRepository,
    BootstrapService,
  ],
  exports: [
    DatabaseService,
    MigrationService,
    PersonRepository,
    GenealogyLinkRepository,
    DuplicateRepository,
    ClaimRepository,
    AuditRepository,
    AuditOutboxRepository,
    CulturalArticleRepository,
    CalendarEventRepository,
    UserRepository,
    SessionRepository,
    BranchRepository,
    BootstrapService,
  ],
})
export class DatabaseModule {}
