import { type OAuthGrantType } from '../types';

export class AuthenticationCodeGrantTokenRequest {
	public client_id: string;

	public client_secret: string;

	public redirect_uri: string;

	public grant_type: OAuthGrantType.AUTHORIZATION_CODE_GRANT;

	public code: string;

	// PKCE (RFC 7636) code verifier, required by IdPs that enforced a
	// code_challenge on the authorization request; undefined/omitted for
	// IdPs that don't use PKCE.
	public code_verifier?: string;

	constructor(props: AuthenticationCodeGrantTokenRequest) {
		this.client_id = props.client_id;
		this.client_secret = props.client_secret;
		this.redirect_uri = props.redirect_uri;
		this.grant_type = props.grant_type;
		this.code = props.code;
		this.code_verifier = props.code_verifier;
	}
}
