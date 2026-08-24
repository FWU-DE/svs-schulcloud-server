import { ConfigProperty, Configuration } from '@infra/configuration';
import { StringToBoolean } from '@shared/controller/transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export const ROOM_PUBLIC_API_CONFIG_TOKEN = 'ROOM_PUBLIC_API_CONFIG_TOKEN';
export const ROOM_CONFIG_TOKEN = 'ROOM_CONFIG_TOKEN';

@Configuration()
export class RoomPublicApiConfig {
	@ConfigProperty('FEATURE_ADMINISTRATE_ROOMS_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureAdministrateRoomsEnabled = false;

	@ConfigProperty('FEATURE_ROOM_COPY_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureRoomCopyEnabled = true;

	@ConfigProperty('FEATURE_ROOM_LINK_INVITATION_EXTERNAL_PERSONS_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureRoomLinkInvitationExternalPersonsEnabled = false;

	@ConfigProperty('ROOM_MEMBER_ADD_EXTERNAL_PERSON_REQUIREMENTS_URL')
	@IsOptional()
	@IsUrl({ require_tld: false })
	public roomMemberAddExternalPersonRequirementsUrl: string | null = null;

	@ConfigProperty('FEATURE_ROOM_ADD_EXTERNAL_PERSONS_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureRoomAddExternalPersonsEnabled = false;

	@ConfigProperty('FEATURE_ROOM_REGISTER_EXTERNAL_PERSONS_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureRoomRegisterExternalPersonsEnabled = false;

	@ConfigProperty('FEATURE_ROOM_AI_TEMPLATE_ENABLED')
	@IsBoolean()
	@StringToBoolean()
	public featureRoomAiTemplateEnabled = false;

	@ConfigProperty('ROOM_MEMBER_INFO_URL')
	@IsUrl({ require_tld: false })
	public roomMemberInfoUrl!: string;
}

export class RoomConfig extends RoomPublicApiConfig {
	@IsUrl({ require_tld: false })
	@ConfigProperty('HOST')
	public hostUrl!: string;

	@ConfigProperty('SMTP_SENDER')
	@IsEmail()
	public fromEmailAddress = 'noreply@dbildungscloud.de';

	@ConfigProperty('SC_TITLE')
	@IsString()
	public productName = 'dBildungscloud';

	@ConfigProperty('ROOM_AI_API_URL')
	@IsUrl()
	public aiApiUrl = 'https://api.openai.com/v1/chat/completions';

	/** without a key the ai mode stays unavailable, even when the feature flag is on */
	@ConfigProperty('ROOM_AI_API_KEY')
	@IsString()
	public aiApiKey = '';

	@ConfigProperty('ROOM_AI_MODEL')
	@IsString()
	public aiModel = 'gpt-4o-mini';

	/** azure sends the key as `api-key`, everything openai compatible as a bearer token */
	@ConfigProperty('ROOM_AI_API_STYLE')
	@IsIn(['openai', 'azure'])
	public aiApiStyle: 'openai' | 'azure' = 'openai';
}
