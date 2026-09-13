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
    const result = await this.personRepo.searchPersons(filter, viewer);

    // Apply explicit search projection with privacy masking
    const projectedItems = result.items.map((item) =>
      this.privacyEngine.filterSearchItem(item, viewer),
    );

    return {
      items: projectedItems,
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: (result.page - 1) * result.limit + projectedItems.length < result.total,
    };
  }
}
