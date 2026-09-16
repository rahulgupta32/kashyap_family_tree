import { isValidBsDate } from '@kashyap/localization';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  CreateCalendarEventDto,
  CalendarEventDetailDto,
  CalendarEventRsvpDto,
  EventAudienceScope,
  ErrorCode,
  Role,
} from '@kashyap/contracts';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';

export interface CalendarEventRecord {
  id: string;
  host_user_id: string;
  title: string;
  description: string | null;
  event_type: string;
  audience_scope: EventAudienceScope;
  branch_id: string | null;
  location: string | null;
  date_bs: string | null;
  tithi_year_bs: number | null;
  tithi_month_bs: number | null;
  tithi_paksha: string | null;
  tithi_number: number | null;
  is_public: boolean;
  provenance: any;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly auditOutboxRepo: AuditOutboxRepository,
  ) {}

  /**
   * Validates BS year bounds and date format
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

  /**
   * Validates that an event has EITHER a valid solar date OR complete valid Tithi metadata.
   */
  private validateDateOrTithi(solarDate?: string, tithiYearBs?: number, tithiMonthBs?: number, tithiPaksha?: string, tithiNumber?: number) {
    if (solarDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(solarDate)) {
        throw new BadRequestException('Invalid solarDate format. Expected YYYY-MM-DD');
      }
      const parts = solarDate.split('-').map((s) => parseInt(s, 10));
      if (!isValidBsDate(parts[0], parts[1], parts[2])) {
        throw new BadRequestException(`Invalid Bikram Sambat date: ${solarDate}`);
      }
      this.validateBsYear(undefined, solarDate);
      return;
    }

    // Tithi-only event: MUST provide complete valid Tithi metadata
    if (!tithiYearBs || !tithiMonthBs || !tithiPaksha || !tithiNumber) {
      throw new BadRequestException(
        'Complete valid Tithi metadata (year BS 2000-2090, month 1-12, paksha SHUKLA/KRISHNA, tithi number 1-15) is mandatory when solarDate is not provided',
      );
    }

    this.validateBsYear(tithiYearBs);

    if (tithiMonthBs < 1 || tithiMonthBs > 12) {
      throw new BadRequestException(`Invalid tithiMonthBs: ${tithiMonthBs}. Must be between 1 and 12`);
    }

    const upperPaksha = tithiPaksha.toUpperCase();
    if (upperPaksha !== 'SHUKLA' && upperPaksha !== 'KRISHNA') {
      throw new BadRequestException(`Invalid tithiPaksha: ${tithiPaksha}. Must be SHUKLA or KRISHNA`);
    }

    if (tithiNumber < 1 || tithiNumber > 15) {
      throw new BadRequestException(`Invalid tithiNumber: ${tithiNumber}. Must be between 1 and 15`);
    }
  }

  async createEvent(
    userId: string,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventDetailDto> {
    this.validateDateOrTithi(dto.solarDate, dto.tithiYearBs, dto.tithiMonthBs, dto.tithiPaksha, dto.tithiNumber);

    return this.db.transaction(async (client) => {
      const isPublic = dto.audienceScope === EventAudienceScope.PUBLIC;
      
      let dateBs: string | null = dto.solarDate || null;
      let provenance: any = null;

      if (!dateBs && dto.tithiYearBs) {
        // Tithi provided without solar date conversion (Open Gate HG-004)
        provenance = {
          source: 'TITHI_ONLY',
          conversionStatus: 'UNAVAILABLE',
          reason: 'Panchanga Samiti solar conversion requires active authority module (HG-004)',
        };
      } else if (dateBs) {
        provenance = {
          source: 'SOLAR_BS',
          dateBs,
        };
      }

      const insertRes = await client.query<CalendarEventRecord>(
        `INSERT INTO calendar_events (
          host_user_id, title, description, event_type, audience_scope, branch_id, location,
          date_bs, tithi_year_bs, tithi_month_bs, tithi_paksha, tithi_number,
          is_public, provenance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          userId,
          dto.title,
          dto.description || null,
          dto.eventType,
          dto.audienceScope || EventAudienceScope.COMMUNITY,
          dto.branchId || null,
          dto.location || null,
          dateBs,
          dto.tithiYearBs || null,
          dto.tithiMonthBs || null,
          dto.tithiPaksha ? dto.tithiPaksha.toUpperCase() : null,
          dto.tithiNumber || null,
          isPublic,
          provenance ? JSON.stringify(provenance) : null,
        ],
      );
      const event = insertRes.rows[0];

      if (dto.invitedUserIds && dto.invitedUserIds.length > 0) {
        for (const invitedId of dto.invitedUserIds) {
          await client.query(
            `INSERT INTO event_invitations (event_id, invited_user_id, rsvp_status) VALUES ($1, $2, 'INVITED')
             ON CONFLICT (event_id, invited_user_id) DO NOTHING`,
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
          newValue: {
            title: event.title,
            eventType: event.event_type,
            audienceScope: event.audience_scope,
            dateBs: event.date_bs,
            tithiYearBs: event.tithi_year_bs,
          },
        },
        client,
      );

      return this.mapToDetailDto(event, userId);
    });
  }

  /**
   * Updates a calendar event. Enforces that audience visibility or RSVP eligibility
   * NEVER grants editing permission. Only host or authorized administrators may edit.
   */
  async updateEvent(
    eventId: string,
    actor: AuthenticatedUser,
    dto: Partial<CreateCalendarEventDto>,
  ): Promise<CalendarEventDetailDto> {
    return this.db.transaction(async (client) => {
      const eventRes = await client.query<CalendarEventRecord>(
        'SELECT * FROM calendar_events WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      const event = eventRes.rows[0];
      if (!event) {
        throw new NotFoundException('Calendar event not found');
      }

      // Authorization guard: audience visibility or RSVP NEVER grants editing rights
      const isHost = event.host_user_id === actor.id;
      const isSuperAdmin = actor.roles.includes(Role.SUPER_ADMIN);
      const isBranchAdmin =
        actor.roles.includes(Role.BRANCH_ADMIN) &&
        event.branch_id &&
        actor.roleAssignments.some((ra) => ra.branchId === event.branch_id && ra.role === Role.BRANCH_ADMIN);

      if (!isHost && !isSuperAdmin && !isBranchAdmin) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message:
            'Audience visibility or RSVP eligibility does not grant editing permission. Only the event host or branch/super administrator can edit this event.',
        });
      }

      const newSolarDate = dto.solarDate !== undefined ? dto.solarDate : event.date_bs;
      const newTithiYear = dto.tithiYearBs !== undefined ? dto.tithiYearBs : event.tithi_year_bs;
      const newTithiMonth = dto.tithiMonthBs !== undefined ? dto.tithiMonthBs : event.tithi_month_bs;
      const newTithiPaksha = dto.tithiPaksha !== undefined ? dto.tithiPaksha : event.tithi_paksha;
      const newTithiNumber = dto.tithiNumber !== undefined ? dto.tithiNumber : event.tithi_number;

      this.validateDateOrTithi(
        newSolarDate || undefined,
        newTithiYear || undefined,
        newTithiMonth || undefined,
        newTithiPaksha || undefined,
        newTithiNumber || undefined,
      );

      const updateRes = await client.query<CalendarEventRecord>(
        `UPDATE calendar_events 
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             location = COALESCE($3, location),
             date_bs = $4,
             tithi_year_bs = $5,
             tithi_month_bs = $6,
             tithi_paksha = $7,
             tithi_number = $8,
             audience_scope = COALESCE($9, audience_scope),
             updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [
          dto.title || null,
          dto.description || null,
          dto.location || null,
          newSolarDate || null,
          newTithiYear || null,
          newTithiMonth || null,
          newTithiPaksha ? newTithiPaksha.toUpperCase() : null,
          newTithiNumber || null,
          dto.audienceScope || null,
          eventId,
        ],
      );
      const updated = updateRes.rows[0];

      return this.mapToDetailDto(updated, actor.id);
    });
  }

  async listEvents(
    actor: AuthenticatedUser,
    options?: { yearBs?: number; monthBs?: number; branchId?: string; audienceScope?: EventAudienceScope },
  ): Promise<CalendarEventDetailDto[]> {
    this.validateBsYear(options?.yearBs);

    let query = `
      SELECT e.* FROM calendar_events e
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.yearBs) {
      params.push(options.yearBs);
      query += ` AND (e.date_bs LIKE '${options.yearBs}%' OR e.tithi_year_bs = $${params.length})`;
    }

    if (options?.branchId) {
      params.push(options.branchId);
      query += ` AND (e.branch_id = $${params.length} OR e.audience_scope IN ('PUBLIC', 'COMMUNITY'))`;
    }

    query += ' ORDER BY COALESCE(e.date_bs, e.created_at::text) ASC LIMIT 100';

    const res = await this.db.query<CalendarEventRecord>(query, params);
    
    // Filter events based on audience authorization
    const visibleEvents: CalendarEventDetailDto[] = [];
    for (const event of res.rows) {
      const canView = await this.canViewEvent(event, actor);
      if (canView) {
        visibleEvents.push(await this.mapToDetailDto(event, actor.id));
      }
    }

    return visibleEvents;
  }

  async getEventById(eventId: string, actor: AuthenticatedUser): Promise<CalendarEventDetailDto> {
    return this.getEvent(eventId, actor);
  }

  async getEvent(
    eventId: string,
    actor: AuthenticatedUser,
  ): Promise<CalendarEventDetailDto> {
    const res = await this.db.query<CalendarEventRecord>('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
    const event = res.rows[0];
    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    const canView = await this.canViewEvent(event, actor);
    if (!canView) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'You do not have access to view this calendar event',
      });
    }

    return this.mapToDetailDto(event, actor.id);
  }

  private async canViewEvent(event: CalendarEventRecord, actor: AuthenticatedUser): Promise<boolean> {
    if (actor.roles.includes(Role.SUPER_ADMIN)) return true;
    if (event.host_user_id === actor.id) return true;
    if (event.audience_scope === EventAudienceScope.PUBLIC) return true;
    if (event.audience_scope === EventAudienceScope.COMMUNITY) return true;

    if (event.audience_scope === EventAudienceScope.BRANCH) {
      const userBranches = (actor.roleAssignments || []).map((ra) => ra.branchId);
      return !!event.branch_id && userBranches.includes(event.branch_id);
    }

    if (event.audience_scope === EventAudienceScope.PRIVATE || event.audience_scope === EventAudienceScope.INVITED_ONLY) {
      const invRes = await this.db.query(
        'SELECT 1 FROM event_invitations WHERE event_id = $1 AND invited_user_id = $2',
        [event.id, actor.id],
      );
      return invRes.rows.length > 0;
    }

    if (event.audience_scope === EventAudienceScope.FAMILY || event.audience_scope === EventAudienceScope.IMMEDIATE_FAMILY) {
      const userRes = await this.db.query('SELECT person_id FROM user_accounts WHERE id = $1', [actor.id]);
      const hostUserRes = await this.db.query('SELECT person_id FROM user_accounts WHERE id = $1', [event.host_user_id]);
      const actorPersonId = userRes.rows[0]?.person_id;
      const hostPersonId = hostUserRes.rows[0]?.person_id;

      if (actorPersonId && hostPersonId) {
        const relRes = await this.db.query(
          `SELECT 1 FROM parent_links WHERE (parent_id = $1 AND child_id = $2) OR (parent_id = $2 AND child_id = $1)
           UNION
           SELECT 1 FROM spouse_links WHERE (person_id = $1 AND spouse_id = $2) OR (person_id = $2 AND spouse_id = $1)`,
          [actorPersonId, hostPersonId],
        );
        if (relRes.rows.length > 0) return true;
      }

      const invRes = await this.db.query(
        'SELECT 1 FROM event_invitations WHERE event_id = $1 AND invited_user_id = $2',
        [event.id, actor.id],
      );
      return invRes.rows.length > 0;
    }

    return false;
  }

  async rsvpEvent(
    eventId: string,
    userId: string,
    dto: CalendarEventRsvpDto,
  ): Promise<{ success: boolean; myRsvp: string }> {
    return this.db.transaction(async (client) => {
      const eventRes = await client.query<CalendarEventRecord>('SELECT * FROM calendar_events WHERE id = $1', [eventId]);
      const event = eventRes.rows[0];
      if (!event) {
        throw new NotFoundException('Event not found');
      }

      const isHost = event.host_user_id === userId;

      // Strictly enforce audience authorization for RSVP (forbids unrelated users from FAMILY/PRIVATE events)
      const userRes = await client.query('SELECT person_id FROM user_accounts WHERE id = $1', [userId]);
      const actorPersonId = userRes.rows[0]?.person_id;
      const rolesRes = await client.query('SELECT role, branch_id FROM user_roles WHERE user_id = $1', [userId]);
      const actorUser: AuthenticatedUser = {
        id: userId,
        phoneNumber: '',
        roles: rolesRes.rows.map((r: any) => r.role),
        branchIds: rolesRes.rows.map((r: any) => r.branch_id).filter(Boolean),
        roleAssignments: rolesRes.rows.map((r: any) => ({ role: r.role, branchId: r.branch_id })),
        sessionId: '',
        personId: actorPersonId,
      };

      const canAccess = await this.canViewEvent(event, actorUser);
      if (!canAccess) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message: 'Cannot RSVP to an event you do not have permission to view or attend',
        });
      }

      await client.query(
        `INSERT INTO event_invitations (event_id, invited_user_id, rsvp_status)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id, invited_user_id) DO UPDATE SET rsvp_status = $3, updated_at = NOW()`,
        [eventId, userId, dto.response],
      );

      return { success: true, myRsvp: dto.response };
    });
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
      solarDate: event.date_bs || undefined,
      tithiYearBs: event.tithi_year_bs || undefined,
      tithiMonthBs: event.tithi_month_bs || undefined,
      tithiPaksha: event.tithi_paksha || undefined,
      tithiNumber: event.tithi_number || undefined,
      myRsvp,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    };
  }
}
