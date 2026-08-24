import { ConfigurationModule } from '@infra/configuration';
import { Module } from '@nestjs/common';
import { AI_SUGGESTION_CONFIG_TOKEN, AiSuggestionConfig } from './ai-suggestion.config';
import { AiSuggestionService } from './ai-suggestion.service';

@Module({
	imports: [ConfigurationModule.register(AI_SUGGESTION_CONFIG_TOKEN, AiSuggestionConfig)],
	providers: [AiSuggestionService],
	exports: [AiSuggestionService],
})
export class AiSuggestionModule {}
