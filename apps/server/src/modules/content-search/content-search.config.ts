import { ConfigProperty, Configuration } from '@infra/configuration';
import { StringToNumber } from '@shared/controller/transformer';
import { IsNumber, IsString, IsUrl } from 'class-validator';

export const CONTENT_SEARCH_CONFIG_TOKEN = 'CONTENT_SEARCH_CONFIG_TOKEN';

@Configuration()
export class ContentSearchConfig {
	@ConfigProperty('CONTENT_SEARCH_MCP_URL')
	@IsUrl()
	public mcpUrl = 'https://mcp.amb.edufeed.org/mcp';

	/**
	 * The relays the search runs against, separated by commas. Only the amb relay is searched by
	 * default; oersi and sodix are extra corpora the remote server reads solely when it is asked
	 * to - so they have to be named here or their material never shows up. Both carry most of the
	 * school material: for subjects like photosynthesis or fractions the amb relay alone answers
	 * with nothing.
	 */
	@ConfigProperty('CONTENT_SEARCH_RELAYS')
	@IsString()
	public relays = 'wss://amb-relay.edufeed.org,wss://oersi.edufeed.org,wss://sodix.edufeed.org';

	@ConfigProperty('CONTENT_SEARCH_TIMEOUT_MS')
	@IsNumber()
	@StringToNumber()
	public timeoutMs = 15000;
}
