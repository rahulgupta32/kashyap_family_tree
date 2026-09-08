import { Controller, Get, Query } from '@nestjs/common';
import { MapService } from './map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('households')
  async getHouseholds(
    @Query('isVerified') isVerified?: string,
    @Query('minLat') minLat?: string,
    @Query('maxLat') maxLat?: string,
    @Query('minLng') minLng?: string,
    @Query('maxLng') maxLng?: string,
  ) {
    const isVerifiedUser = isVerified === 'true';
    const data = await this.mapService.getHouseholds({
      isVerifiedUser,
      minLat: minLat ? parseFloat(minLat) : undefined,
      maxLat: maxLat ? parseFloat(maxLat) : undefined,
      minLng: minLng ? parseFloat(minLng) : undefined,
      maxLng: maxLng ? parseFloat(maxLng) : undefined,
    });
    return { success: true, data };
  }

  @Get('clusters')
  async getClusters() {
    const clusters = await this.mapService.getDistrictClusters();
    return { success: true, data: clusters };
  }
}
