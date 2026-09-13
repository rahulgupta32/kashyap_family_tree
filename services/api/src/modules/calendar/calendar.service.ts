import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CreateCalendarEventDto,
  CalendarEventDetailDto,
  CalendarEventRsvpDto,
  EventAudienceScope,
  Role,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';

export interface CalendarEventRecord {
  id: string;
  host_user_id: string;
  title: string;
  description?: string | null;
  event_type: string;
  audience_scope: EventAudienceScope;
  branch_id?: string | null;
  location?: string | null;
  date_bs: string;
  date_ad?: string | null;
  tithi?: string | null;
  is_public: boolean;
  provenance?: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auditOutboxRepo: AuditOutboxRepository,
  ) {}

  /**
   * Validates Bikram Sambat year range BS 2000 through BS 2090
   */
  private validateBsYear(year?: number | null, dateBs?: string | null) {
    let bsYear = year;
    if (bsYear === undefined && dateBs) {
      const parsedYear = parseInt(dateBs.substring(0, 4), 10);
      if (!isNaN(parsedYear)) {
        bsYear = parsedYear;
      }
    }

    if (bsYear !== undefined && bsYear !== null) {
      if (bsYear < 2000 || bsYear > 2090) {
        throw new BadRequestException(`Bikram Sambat year ${bsYear} is outside supported range (BS 2000 - BS 2090)`);
      }
    }
  }

  async createEvent(
    userId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventDetailDto> {
    this.validateBsYear(dto.tithiYearBs, dto.solarDate);

    return this.db.transaction(async (client) => {
      const isPublic = dto.audienceScope === 'PUBLIC';
      const dateBs = dto.solarDate || (dto.tithiYearBs ? `${dto.tithiYearBs}-${String(dto.tithiMonthBs || 1).padStart(2, '0')}-01` : '2081-01-01');

      const insertRes = await client.query<CalendarEventRecord>(
        `INSERT INTO calendar_events (
          host_user_id, title, description, event_type, audience_scope, branch_id, location,
          date_bs, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          userId,
          dto.title,
          dto.description || null,
          dto.eventType,
          dto.audienceScope || 'COMMUNITY',
          dto.branchId || null,
          dto.location || null,
          dateBs,
          isPublic,
        ],
      );
      const event = insertRes.rows[0];

      if (dto.invitedUserIds && dto.invitedUserIds.length > 0) {
        for (const invitedId of dto.invitedUserIds) {
          await client.query(
            `INSERT INTO event_invitations (event_id, invited_user_id, rsvp_status) VALUES ($1, $2, 'INVITED')`,
            [event.id, invitedId],
          );
        }
      }

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CALENDAR_EVENT_CREATED',
          entityType: 'CALENDAR_EVENT',
          entityId: event.id,
          actorId: userId,
          actorRole: 'MEMBER',
          oldValue: null,
          newValue: { title: event.title, audienceScope: event.audience_scope },
        },
        client,
      );

      return this.mapToDetailDto(event, userId);
    });
  }

  async listEvents(
    actor: AuthenticatedUser,
    options?: { branchId?: string; audienceScope?: EventAudienceScope },
  ): Promise<CalendarEventDetailDto[]> {
    let sql = `
      SELECT DISTINCT e.*
      FROM calendar_events e
      LEFT JOIN event_invitations inv ON e.id = inv.event_id AND inv.invited_user_id = $1
      WHERE (
        e.audience_scope IN ('PUBLIC', 'COMMUNITY')
        OR e.host_user_id = $1
        OR inv.invited_user_id = $1
        OR (e.audience_scope = 'BRANCH' AND e.branch_id = $2)
      )
    `;
    const userBranchId = actor.roleAssignments?.[0]?.branchId || 'b-001';
    const params: any[] = [actor.id, userBranchId];
    let pIdx = 3;

    if (options?.branchId) {
      sql += ` AND e.branch_id = $${pIdx++}`;
      params.push(options.branchId);
    }
    if (options?.audienceScope) {
      sql += ` AND e.audience_scope = $${pIdx++}`;
      params.push(options.audienceScope);
    }

    sql += ' ORDER BY e.created_at DESC';
    const res = await this.db.query<CalendarEventRecord>(sql, params);
    return Promise.all(res.rows.map((r) => this.mapToDetailDto(r, actor.id)));
  }

  async getEventById(eventId: string, actor: AuthenticatedUser): Promise<CalendarEventDetailDto> {
    const res = await this.db.query<CalendarEventRecord>('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
    const event = res.rows[0];
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.mapToDetailDto(event, actor.id);
  }

  async rsvpEvent(
    eventId: string,
    userId: string,
    dto: CalendarEventRsvpDto,
  ): Promise<{ success: boolean; myRsvp: string }> {
    await this.db.query(
      `INSERT INTO event_invitations (event_id, invited_user_id, rsvp_status)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, invited_user_id) DO UPDATE SET rsvp_status = $3, updated_at = NOW()`,
      [eventId, userId, dto.response],
    );

    return { success: true, myRsvp: dto.response };
  }

  private async mapToDetailDto(
    event: CalendarEventRecord,
    userId: string,
  ): Promise<CalendarEventDetailDto> {
    const invRes = await this.db.query('SELECT rsvp_status FROM event_invitations WHERE event_id = $1 AND invited_user_id = $2', [
      event.id,
      userId,
    ]);
    const myRsvp = invRes.rows[0]?.rsvp_status;

    return {
      id: event.id,
      createdByUserId: event.host_user_id,
      title: event.title,
      description: event.description || undefined,
      eventType: event.event_type as any,
      audienceScope: event.audience_scope,
      branchId: event.branch_id || undefined,
      location: event.location || undefined,
      isAllDay: true,
      solarDate: event.date_bs,
      myRsvp,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    };
  }
}
