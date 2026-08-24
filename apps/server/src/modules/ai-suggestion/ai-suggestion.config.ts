import { ConfigProperty, Configuration } from '@infra/configuration';
import { StringToBoolean, StringToNumber } from '@shared/controller/transformer';
import { IsBoolean, IsIn, IsNumber, IsString, IsUrl } from 'class-validator';

export const AI_SUGGESTION_CONFIG_TOKEN = 'AI_SUGGESTION_CONFIG_TOKEN';

/**
 * One provider for every ai suggestion in the product. Whether a single feature is offered is
 * decided by its own feature flag, this class only says where to ask and how to authenticate.
 */
@Configuration()
export class AiSuggestionConfig {
	@ConfigProperty('AI_SUGGESTION_API_URL')
	@IsUrl()
	public apiUrl = 'https://api.openai.com/v1/chat/completions';

	/** without a key every ai feature stays unavailable, even with its flag turned on */
	@ConfigProperty('AI_SUGGESTION_API_KEY')
	@IsString()
	public apiKey = '';

	/** with azure this is the deployment name */
	@ConfigProperty('AI_SUGGESTION_MODEL')
	@IsString()
	public model = 'gpt-4o-mini';

	/** azure sends the key as `api-key`, everything openai compatible as a bearer token */
	@ConfigProperty('AI_SUGGESTION_API_STYLE')
	@IsIn(['openai', 'azure'])
	public apiStyle: 'openai' | 'azure' = 'openai';

	/** suggested links are probed once, so that a made up reference never reaches a card */
	@ConfigProperty('AI_SUGGESTION_CHECK_LINKS')
	@IsBoolean()
	@StringToBoolean()
	public checkLinks = true;

	@ConfigProperty('AI_SUGGESTION_LINK_CHECK_TIMEOUT_MS')
	@IsNumber()
	@StringToNumber()
	public linkCheckTimeoutMs = 3000;
}
