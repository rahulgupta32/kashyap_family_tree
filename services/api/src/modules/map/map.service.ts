import { Injectable } from '@nestjs/common';

export interface HouseholdMarker {
  id: string;
  householdNameNepali: string;
  householdNameEnglish: string;
  district: string;
  municipality: string;
  wardNumber: number;
  latitude: number;
  longitude: number;
  membersCount: number;
  branchId: string;
  headPersonId: string;
}

export interface MapClusterDto {
  district: string;
  approxLatitude: number;
  approxLongitude: number;
  totalHouseholds: number;
  totalMembers: number;
}

@Injectable()
export class MapService {
  private households: HouseholdMarker[] = [
    {
      id: 'hh_001',
      householdNameNepali: 'धादिङ मूल थलो घर',
      householdNameEnglish: 'Dhading Ancestral Household',
      district: 'Dhading',
      municipality: 'Nilkantha',
      wardNumber: 3,
      latitude: 27.8667,
      longitude: 84.9000,
      membersCount: 8,
      branchId: 'branch_dhading',
      headPersonId: 'p-101',
    },
    {
      id: 'hh_002',
      householdNameNepali: 'काठमाडौं सामाखुसी निवास',
      householdNameEnglish: 'Kathmandu Samakhusi Residence',
      district: 'Kathmandu',
      municipality: 'Kathmandu Metropolitan',
      wardNumber: 26,
      latitude: 27.7312,
      longitude: 85.3168,
      membersCount: 4,
      branchId: 'branch_dhading',
      headPersonId: 'p-301',
    },
    {
      id: 'hh_003',
      householdNameNepali: 'पोखरा विन्ध्यवासिनी निवास',
      householdNameEnglish: 'Pokhara Bindhyabasini Residence',
      district: 'Kaski',
      municipality: 'Pokhara Metropolitan',
      wardNumber: 2,
      latitude: 28.2380,
      longitude: 83.9785,
      membersCount: 5,
      branchId: 'branch_pokhara',
      headPersonId: 'p-202',
    },
  ];

  /**
   * Returns precise household markers for verified users within a bounding box
   */
  async getHouseholds(params: {
    isVerifiedUser: boolean;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
  }) {
    // Privacy protection: Unverified users receive district-level obfuscated centroid clusters
    if (!params.isVerifiedUser) {
      return this.getDistrictClusters();
    }

    let results = this.households;
    if (params.minLat !== undefined && params.maxLat !== undefined) {
      results = results.filter((h) => h.latitude >= params.minLat! && h.latitude <= params.maxLat!);
    }
    if (params.minLng !== undefined && params.maxLng !== undefined) {
      results = results.filter((h) => h.longitude >= params.minLng! && h.longitude <= params.maxLng!);
    }

    return results;
  }

  /**
   * District-level centroid clusters for unverified/privacy-protected views
   */
  async getDistrictClusters(): Promise<MapClusterDto[]> {
    const districtMap = new Map<string, { count: number; members: number; lats: number[]; lngs: number[] }>();

    for (const h of this.households) {
      if (!districtMap.has(h.district)) {
        districtMap.set(h.district, { count: 0, members: 0, lats: [], lngs: [] });
      }
      const entry = districtMap.get(h.district)!;
      entry.count += 1;
      entry.members += h.membersCount;
      entry.lats.push(h.latitude);
      entry.lngs.push(h.longitude);
    }

    return Array.from(districtMap.entries()).map(([district, data]) => ({
      district,
      approxLatitude: data.lats.reduce((a, b) => a + b, 0) / data.lats.length,
      approxLongitude: data.lngs.reduce((a, b) => a + b, 0) / data.lngs.length,
      totalHouseholds: data.count,
      totalMembers: data.members,
    }));
  }
}
