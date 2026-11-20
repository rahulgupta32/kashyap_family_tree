export interface BranchAdministrationDto {
  id: string;
  code: string;
  nameNepali: string;
  nameEnglish: string;
  moolGhar: string | null;
  kuldevata: string | null;
  description: string | null;
  version: number;
}
export interface BranchGenerationDto {
  generation: number;
  nameNepali: string;
  nameEnglish: string;
  description: string | null;
  version: number;
}
export interface BranchAdministrationRevisionDto {
  version: number;
  oldValue: BranchAdministrationDto | BranchGenerationDto | null;
  newValue: BranchAdministrationDto | BranchGenerationDto;
  actorId: string | null;
  reason: string;
  changedAt: string;
}
export interface BranchAdministrationHistoryDto {
  items: BranchAdministrationRevisionDto[];
  nextBefore: number | null;
}
export interface BranchAdministrationPageDto {
  items: BranchAdministrationDto[];
  nextAfter: string | null;
}
