import { JwtAuthentication } from '@infra/auth-guard';
import { ErrorResponse } from '@infra/error';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContentSearchService } from '../content-search.service';
import { ContentSearchListResponse, ContentSearchParams, ContentSearchResultResponse } from './dto';

@ApiTags('ContentSearch')
@JwtAuthentication()
@Controller('content-search')
export class ContentSearchController {
	constructor(private readonly contentSearchService: ContentSearchService) {}

	@ApiOperation({
		summary: 'Search open educational resources',
		description:
			'Asks the public amb relay through its mcp server. The amb, oersi and sodix relays are all searched, because oersi and sodix are extra corpora the remote server would otherwise leave out. A question of several words is reduced to its topic before it is sent and the answers are sorted against the whole question, because the remote full text search does not cope with a sentence.',
	})
	@ApiResponse({ status: 200, type: ContentSearchListResponse })
	@ApiResponse({ status: 400, type: ErrorResponse })
	@ApiResponse({ status: 500, type: ErrorResponse })
	@Get()
	public async search(@Query() params: ContentSearchParams): Promise<ContentSearchListResponse> {
		const answer = await this.contentSearchService.search(params.query, params.limit);

		return new ContentSearchListResponse(
			answer.results.map((result) => new ContentSearchResultResponse(result)),
			this.contentSearchService.relays(),
			answer.query
		);
	}
}
