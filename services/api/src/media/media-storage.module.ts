import { ImageProcessorService } from './image-processor.service';
import { ImageDerivativesService } from './image-derivatives.service';
import { Global, Module } from '@nestjs/common';
import { MediaStorageService } from './media-storage.service';
@Global()
@Module({ providers: [MediaStorageService,ImageProcessorService,ImageDerivativesService], exports: [MediaStorageService,ImageProcessorService,ImageDerivativesService] })
export class MediaStorageModule {}
