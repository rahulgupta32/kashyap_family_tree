export type ApplicationSettingKey = 'calendar.max_invitees' | 'calendar.max_audience_persons' | 'calendar.max_audience_edges' | 'calendar.preview_ttl_minutes';
export interface ApplicationSettingDto {
 key: ApplicationSettingKey;
 type: 'INTEGER';
 labelEnglish: string;
 labelNepali: string;
 descriptionEnglish: string;
 descriptionNepali: string;
 minimum: number;
 maximum: number;
 value: number;
 version: number;
 updatedAt: string;
}
export interface UpdateApplicationSettingDto { value: number; version: number; reason: string; }
export interface ApplicationSettingRevisionDto { version: number; oldValue: number|null; newValue: number; actorId: string|null; reason: string; changedAt: string; }
export interface ApplicationSettingHistoryDto { items: ApplicationSettingRevisionDto[]; nextBefore: number|null; }
