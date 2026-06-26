import { ConfigProperty, Configuration } from '@infra/configuration';
import { StringToNumber } from '@shared/controller/transformer';
import { IsNumber } from 'class-validator';

export const MCP_SERVER_CONFIG_TOKEN = 'MCP_SERVER_CONFIG_TOKEN';

@Configuration()
export class McpServerConfig {
	@ConfigProperty('MCP_SERVER__PORT')
	@StringToNumber()
	@IsNumber()
	public port = 4040;
}
