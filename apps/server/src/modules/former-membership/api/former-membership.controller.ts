import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FormerMembershipListItemResponse, FormerMembershipUrlParams, ReclaimFormerMembershipResponse } from './dto';
import { FormerMembershipUc } from './former-membership.uc';

@ApiTags('FormerMembership')
@JwtAuthentication()
@Controller('users/me/former-memberships')
export class FormerMembershipController {
	constructor(private readonly formerMembershipUc: FormerMembershipUc) {}

	@ApiOperation({
		summary: "List the current user's own former course/room memberships available to reclaim.",
	})
	@ApiResponse({ status: 200, type: [FormerMembershipListItemResponse] })
	@Get()
	public async list(@CurrentUser() currentUser: ICurrentUser): Promise<FormerMembershipListItemResponse[]> {
		const items = await this.formerMembershipUc.list(currentUser.userId);

		return items;
	}

	@ApiOperation({
		summary:
			'Reclaim a former course/room membership of the current user. Creates a copy of the course/room in the ' +
			"current user's current school - the original is left untouched for any members still at the old school.",
	})
	@ApiResponse({ status: 200, type: ReclaimFormerMembershipResponse })
	@Post(':type/:refId/reclaim')
	public async reclaim(
		@CurrentUser() currentUser: ICurrentUser,
		@Param() params: FormerMembershipUrlParams
	): Promise<ReclaimFormerMembershipResponse> {
		const reclaimed = await this.formerMembershipUc.reclaim(currentUser.userId, params.type, params.refId);

		return new ReclaimFormerMembershipResponse(reclaimed);
	}

	@ApiOperation({
		summary: 'Discard a former course/room membership of the current user without reclaiming it.',
	})
	@ApiResponse({ status: 204 })
	@Delete(':type/:refId')
	@HttpCode(204)
	public async discard(
		@CurrentUser() currentUser: ICurrentUser,
		@Param() params: FormerMembershipUrlParams
	): Promise<void> {
		await this.formerMembershipUc.discard(currentUser.userId, params.type, params.refId);
	}
}
