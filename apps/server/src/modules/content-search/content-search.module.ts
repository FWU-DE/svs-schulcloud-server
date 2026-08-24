import { ConfigurationModule } from '@infra/configuration';
import { Module } from '@nestjs/common';
import { CONTENT_SEARCH_CONFIG_TOKEN, ContentSearchConfig } from './content-search.config';
import { ContentSearchService } from './content-search.service';
import { McpClientService } from './mcp-client.service';

@Module({
	imports: [ConfigurationModule.register(CONTENT_SEARCH_CONFIG_TOKEN, ContentSearchConfig)],
	providers: [ContentSearchService, McpClientService],
	exports: [ContentSearchService],
})
export class ContentSearchModule {}
