// ============================================================================
// Calendar & Event Contracts
// ============================================================================

import { EventAudienceScope } from './enums.js';

export interface CreateCalendarEventDto {
  title: string;
  description?: string;
  eventType: string;
  audienceScope: EventAudienceScope;
  branchId?: string;
  location?: string;
  isAllDay?: boolean;
  solarDate?: string;
  tithiYearBs?: number;
  tithiMonthBs?: number;
  tithiPaksha?: string;
  tithiNumber?: number;
  startTime?: string;
  endTime?: string;
  invitedUserIds?: string[];
}

export interface CalendarEventDetailDto {
  id: string;
  createdByUserId: string;
  title: string;
  description?: string;
  eventType: string;
  audienceScope: EventAudienceScope;
  branchId?: string | null;
  location?: string | null;
  isAllDay: boolean;
  solarDate?: string | null;
  tithiYearBs?: number | null;
  tithiMonthBs?: number | null;
  tithiPaksha?: string | null;
  tithiNumber?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  rsvpCounts?: { going: number; maybe: number; declined: number };
  myRsvp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventRsvpDto {
  response: 'GOING' | 'MAYBE' | 'DECLINED';
  note?: string;
}
