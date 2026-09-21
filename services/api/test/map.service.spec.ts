import { MapService } from '../src/modules/map/map.service';

describe('MapService (Spatial Clustering & Privacy Protection)', () => {
  let mapService: MapService;

  beforeEach(() => {
    mapService = new MapService();
  });

  it('should return district-level obfuscated centroid clusters for unverified users', async () => {
    const results = await mapService.getHouseholds({ isVerifiedUser: false });
    expect(results.length).toBeGreaterThan(0);
    // Should have district, approx coordinates, count
    expect((results[0] as any).district).toBeDefined();
    expect((results[0] as any).approxLatitude).toBeDefined();
    expect((results[0] as any).householdNameNepali).toBeUndefined(); // Obfuscated
  });

  it('should return precise household markers for verified clan members', async () => {
    const results = await mapService.getHouseholds({ isVerifiedUser: true });
    expect(results.length).toBeGreaterThan(0);
    expect((results[0] as any).householdNameNepali).toBeDefined();
    expect((results[0] as any).wardNumber).toBeDefined();
  });

  it('should filter households within bounding box coordinates', async () => {
    const results = await mapService.getHouseholds({
      isVerifiedUser: true,
      minLat: 27.5,
      maxLat: 28.0,
      minLng: 84.5,
      maxLng: 85.5,
    });

    expect(results.length).toBeGreaterThan(0);
    results.forEach((h: any) => {
      expect(h.latitude).toBeGreaterThanOrEqual(27.5);
      expect(h.latitude).toBeLessThanOrEqual(28.0);
    });
  });
});
