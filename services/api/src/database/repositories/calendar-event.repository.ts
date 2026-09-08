import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { EventType, RsvpStatus } from '@kashyap/contracts';

export interface CalendarEventRecord {
  id: string;
  title: string;
  event_type: EventType;
  description?: string;
  date_bs: string;
  date_ad?: string;
  tithi?: string;
  location?: string;
  host_user_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventInvitationRecord {
  id: string;
  event_id: string;
  invited_user_id: string;
  rsvp_status: RsvpStatus;
  notes?: string;
  updated_at: string;
}

@Injectable()
export class CalendarEventRepository {
  constructor(private readonly db: DatabaseService) {}

  async createEvent(data: Omit<CalendarEventRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CalendarEventRecord> {
    const res = await this.db.query<CalendarEventRecord>(
      `INSERT INTO calendar_events (
        title, event_type, description, date_bs, date_ad, tithi, location, host_user_id, is_public
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        data.title,
        data.event_type,
        data.description || null,
        data.date_bs,
        data.date_ad || null,
        data.tithi || null,
        data.location || null,
        data.host_user_id,
        data.is_public,
      ],
    );
    return res.rows[0];
  }

  async listUpcomingEvents(userId?: string): Promise<CalendarEventRecord[]> {
    const res = await this.db.query<CalendarEventRecord>(
      'SELECT * FROM calendar_events WHERE is_public = TRUE ORDER BY date_bs ASC LIMIT 20',
    );
    return res.rows;
  }

  async updateRsvp(eventId: string, userId: string, rsvpStatus: RsvpStatus, notes?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO event_invitations (event_id, invited_user_id, rsvp_status, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, invited_user_id) 
       DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP`,
      [eventId, userId, rsvpStatus, notes || null],
    );
  }
}
