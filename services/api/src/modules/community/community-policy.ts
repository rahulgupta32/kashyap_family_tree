import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

export function member(user: AuthenticatedUser): void {
  if (!user || !user.roles.some(role => role !== Role.REGISTERED_USER && role !== Role.GUEST)) {
    throw new ForbiddenException('Verified community membership is required');
  }
}
export function globalAdmin(user: AuthenticatedUser): boolean {
  return user.roles.some(r => r === Role.SUPER_ADMIN || r === Role.CENTRAL_ADMIN);
}
export function canModerate(user: AuthenticatedUser, branchId?: string): boolean {
  return globalAdmin(user) || user.roleAssignments.some(a =>
    (a.role === Role.COMMUNITY_MODERATOR && (!a.branchId || a.branchId === branchId)) ||
    (a.role === Role.BRANCH_ADMIN && !!branchId && a.branchId === branchId));
}
export function branchAccess(user: AuthenticatedUser, branchId?: string): void {
  member(user);
  if (branchId && !globalAdmin(user) && !user.branchIds.includes(branchId) && !canModerate(user, branchId)) {
    throw new ForbiddenException('This branch is outside your current membership');
  }
}
export function textField(value: unknown, label: string, max: number, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new BadRequestException(`${label} must contain ${min}–${max} characters`);
  }
  return value.trim();
}
export function uuid(value: unknown, label = 'ID'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return value;
}
export function allowedFields(body: any, keys: string[]): void {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) {
    throw new BadRequestException('Unexpected request fields');
  }
}
