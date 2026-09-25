import { Module } from '@nestjs/common';
import { QuickSearchController } from './api/quick-search.controller';
import { QuickSearchModule } from './quick-search.module';

@Module({
	imports: [QuickSearchModule],
	controllers: [QuickSearchController],
})
export class QuickSearchApiModule {}
