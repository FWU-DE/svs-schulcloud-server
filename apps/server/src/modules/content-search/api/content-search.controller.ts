import { ErrorResponse } from '@core/error/dto';
import { JwtAuthentication } from '@infra/auth-guard';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { StringToNumber } from '@shared/controller/transformer';
import { ContentSearchResult, ContentSearchService } from '../content-search.service';

export class ContentSearchParams {
	@ApiProperty({ description: 'What the material should be about' })
	@IsString()
	@MinLength(2)
	@MaxLength(200)
	public query!: string;

	@ApiProperty({ description: 'How many results to return', required: false, minimum: 1, maximum: 10 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(10)
	@StringToNumber()
	public limit?: number;
}

export class ContentSearchResultResponse implements ContentSearchResult {
	@ApiProperty()
	public title: string;

	@ApiProperty()
	public description: string;

	@ApiProperty()
	public url: string;

	@ApiProperty({ description: 'Who published the material' })
	public provider: string;

	@ApiProperty({ description: 'Short licence name, e.g. CC BY-SA' })
	public license: string;

	@ApiProperty({ description: 'Kind of material, e.g. Video or Worksheet' })
	public resourceType: string;

	@ApiProperty()
	public educationalLevel: string;

	@ApiProperty({ type: [String] })
	public subjects: string[];

	constructor(result: ContentSearchResult) {
		this.title = result.title;
		this.description = result.description;
		this.url = result.url;
		this.provider = result.provider;
		this.license = result.license;
		this.resourceType = result.resourceType;
		this.educationalLevel = result.educationalLevel;
		this.subjects = result.subjects;
	}
}

export class ContentSearchListResponse {
	@ApiProperty({ type: [ContentSearchResultResponse] })
	public data: ContentSearchResultResponse[];

	@ApiProperty({ type: [String], description: 'The relays that were searched, oersi and sodix among them' })
	public relays: string[];

	@ApiProperty({ description: 'The term the relays were asked for, which is the topic of the question' })
	public query: string;

	constructor(data: ContentSearchResultResponse[], relays: string[], query: string) {
		this.data = data;
		this.relays = relays;
		this.query = query;
	}
}

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
