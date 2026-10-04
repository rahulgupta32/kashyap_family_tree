import { OrphanCleanupService } from './orphan-cleanup.service';
import { MediaInventoryService } from './media-inventory.service';
import { MediaInventoryController } from './media-inventory.controller';
import { ImageProcessorService } from './image-processor.service';
import { ImageDerivativesService } from './image-derivatives.service';
import { Global, Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
@Global()
@Module({ controllers:[MediaInventoryController], providers: [OrphanCleanupService,MediaInventoryService,MediaStorageService,ImageProcessorService,ImageDerivativesService], exports: [OrphanCleanupService,MediaInventoryService,MediaStorageService,ImageProcessorService,ImageDerivativesService] })
export class MediaStorageModule {}
