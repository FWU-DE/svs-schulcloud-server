import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { ErrorResponse } from '@infra/error';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationError } from '@shared/common/error';
import { QuickSearchService } from '../quick-search.service';
import { QuickSearchListResponse, QuickSearchParams, QuickSearchResultResponse } from './dto';

@ApiTags('QuickSearch')
@JwtAuthentication()
@Controller('quick-search')
export class QuickSearchController {
	constructor(private readonly quickSearchService: QuickSearchService) {}

	@ApiOperation({
		summary: 'Search rooms, courses and people in one go',
		description:
			'Feeds the quick navigation palette. It only searches what the user is a member of anyway — people are found when they share a room with the searcher, so this is not a school directory. The kinds are interleaved so one large group cannot fill the whole palette.',
	})
	@ApiResponse({ status: 200, type: QuickSearchListResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: '5XX', type: ErrorResponse })
	@Get()
	public async search(
		@CurrentUser() currentUser: ICurrentUser,
		@Query() params: QuickSearchParams
	): Promise<QuickSearchListResponse> {
		const results = await this.quickSearchService.search(
			currentUser.userId,
			currentUser.schoolId,
			params.query,
			params.limit ?? 10
		);

		return new QuickSearchListResponse(
			results.map((result) => new QuickSearchResultResponse(result)),
			params.query
		);
	}
}
