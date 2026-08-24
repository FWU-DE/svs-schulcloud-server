import { TimeoutConfig } from '@core/interceptor';
import { ConfigProperty, Configuration } from '@infra/configuration';
import { StringToNumber } from '@shared/controller/transformer';
import { IsNumber } from 'class-validator';

export const BOARD_TIMEOUT_CONFIG_TOKEN = 'BOARD_TIMEOUT_CONFIG_TOKEN';
export const BOARD_INCOMING_REQUEST_TIMEOUT_COPY_API_KEY = 'boardIncomingRequestTimeoutCopyApi';
export const BOARD_INCOMING_REQUEST_TIMEOUT_AI_CARDS_KEY = 'boardIncomingRequestTimeoutAiCards';

@Configuration()
export class BoardTimeoutConfig extends TimeoutConfig {
	@ConfigProperty('INCOMING_REQUEST_TIMEOUT_COPY_API')
	@IsNumber()
	@StringToNumber()
	public [BOARD_INCOMING_REQUEST_TIMEOUT_COPY_API_KEY] = 60000;

	/** the ai writes card by card, the request lives as long as it writes */
	@ConfigProperty('INCOMING_REQUEST_TIMEOUT_AI_CARDS')
	@IsNumber()
	@StringToNumber()
	public [BOARD_INCOMING_REQUEST_TIMEOUT_AI_CARDS_KEY] = 120000;
}
