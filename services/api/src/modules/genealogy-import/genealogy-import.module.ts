import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { GenealogyImportService } from './genealogy-import.service';
import { GenealogyImportController } from './genealogy-import.controller';
@Module({imports:[DatabaseModule],providers:[GenealogyImportService],controllers:[GenealogyImportController]})
export class GenealogyImportModule{}
