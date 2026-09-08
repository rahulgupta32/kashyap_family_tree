import { Injectable, NotFoundException } from '@nestjs/common';
import { SubmitChangeRequestDto, ChangeRequestDetailDto, ReviewChangeRequestDto, ChangeRequestStatus } from '@kashyap/contracts';

@Injectable()
export class ChangeRequestsService {
  private requests = new Map<string, ChangeRequestDetailDto>();

  async submitRequest(requesterUserId: string, dto: SubmitChangeRequestDto): Promise<ChangeRequestDetailDto> {
    const id = `chg_${Date.now()}`;
    const req: ChangeRequestDetailDto = {
      id,
      type: dto.type,
      status: ChangeRequestStatus.PENDING,
      targetPersonId: dto.targetPersonId,
      requesterUserId,
      proposedChanges: dto.proposedChanges,
      reason: dto.reason,
      createdAt: new Date().toISOString(),
    };

    this.requests.set(id, req);
    return req;
  }

  async listRequests(): Promise<ChangeRequestDetailDto[]> {
    return Array.from(this.requests.values());
  }

  async reviewRequest(id: string, reviewerUserId: string, dto: ReviewChangeRequestDto): Promise<ChangeRequestDetailDto> {
    const req = this.requests.get(id);
    if (!req) {
      throw new NotFoundException('Change request not found');
    }

    req.status = dto.status;
    req.reviewNotes = dto.reviewNotes;
    req.reviewedByUserId = reviewerUserId;
    req.reviewedAt = new Date().toISOString();

    return req;
  }
}
