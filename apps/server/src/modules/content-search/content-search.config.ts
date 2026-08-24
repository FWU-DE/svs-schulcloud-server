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
	 * The relays the search runs against, separated by commas. The relay of the amb metadata is
	 * searched by default, oersi is an extra corpus the server only reads when it is asked to -
	 * so it has to be named here or its material never shows up.
	 */
	@ConfigProperty('CONTENT_SEARCH_RELAYS')
	@IsString()
	public relays = 'wss://amb-relay.edufeed.org,wss://oersi.edufeed.org';

	@ConfigProperty('CONTENT_SEARCH_TIMEOUT_MS')
	@IsNumber()
	@StringToNumber()
	public timeoutMs = 15000;
}
