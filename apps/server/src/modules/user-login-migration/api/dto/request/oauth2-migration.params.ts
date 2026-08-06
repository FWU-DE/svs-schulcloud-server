import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class Oauth2MigrationParams {
	@IsString()
	@IsNotEmpty()
	@ApiProperty()
	redirectUri!: string;

	@IsString()
	@IsNotEmpty()
	@ApiProperty()
	code!: string;

	@IsMongoId()
	@ApiProperty()
	systemId!: string;

	/**
	 * PKCE (RFC 7636) code verifier. Required only for systems whose IdP
	 * enforces PKCE on the authorization request; optional otherwise for
	 * backwards compatibility with systems that don't require it.
	 */
	@IsString()
	@IsOptional()
	@ApiPropertyOptional()
	codeVerifier?: string;
}
