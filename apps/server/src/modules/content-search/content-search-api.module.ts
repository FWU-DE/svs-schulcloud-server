import { Module } from '@nestjs/common';
import { ContentSearchController } from './api/content-search.controller';
import { ContentSearchModule } from './content-search.module';

@Module({
	imports: [ContentSearchModule],
	controllers: [ContentSearchController],
})
export class ContentSearchApiModule {}
