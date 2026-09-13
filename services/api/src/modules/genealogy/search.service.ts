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

    // 1. Filter out records not visible to this viewer
    const visibleRawItems = result.items.filter((item) =>
      this.privacyEngine.isRecordVisible(item, viewer),
    );

    // 2. Apply explicit search projection with privacy masking
    const projectedItems = visibleRawItems.map((item) =>
      this.privacyEngine.filterSearchItem(item, viewer),
    );

    const totalVisible = result.total - (result.items.length - visibleRawItems.length);

    return {
      items: projectedItems,
      total: Math.max(0, totalVisible),
      page: result.page,
      limit: result.limit,
      hasMore: (result.page - 1) * result.limit + projectedItems.length < totalVisible,
    };
  }
}
