import { Injectable, Logger } from '@nestjs/common';
import { PersonRepository } from '../../database/repositories/person.repository';
import { PrivacyEngineService, ViewerContext } from './privacy/privacy-engine.service';
import { PersonSearchQueryDto, PersonSearchResponseDto } from '@kashyap/contracts';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly personRepo: PersonRepository,
    private readonly privacyEngine: PrivacyEngineService,
  ) {}

  async searchPersons(filter: PersonSearchQueryDto, viewer?: ViewerContext): Promise<PersonSearchResponseDto> {
    const result = await this.personRepo.searchPersons(filter);

    // Apply viewer-specific privacy filtering to each item
    const filteredItems = result.items.map((item) => {
      const summary = this.privacyEngine.filterPersonSummary(
        {
          id: item.id,
          primaryNameNepali: item.primaryNameNepali,
          primaryNameEnglish: item.primaryNameEnglish,
          gender: item.gender,
          livingStatus: item.livingStatus,
          generation: item.generation,
          branchId: item.branchId,
          branchName: item.branchName,
          birthYearBs: item.birthYearBs,
          deathYearBs: item.deathYearBs,
          isClaimed: item.isClaimed,
          version: item.version,
        },
        viewer,
      );

      return {
        ...item,
        primaryNameNepali: summary.primaryNameNepali,
        primaryNameEnglish: summary.primaryNameEnglish,
        birthYearBs: summary.birthYearBs,
        deathYearBs: summary.deathYearBs,
        version: summary.version || item.version,
      };
    });

    return {
      items: filteredItems,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }
}
