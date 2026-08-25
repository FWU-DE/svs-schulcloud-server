import { ApiProperty } from '@nestjs/swagger';
import { ContentSearchResultResponse } from './content-search-result.response';

export class ContentSearchListResponse {
	@ApiProperty({ type: [ContentSearchResultResponse] })
	data: ContentSearchResultResponse[];

	@ApiProperty({ type: [String], description: 'The relays that were searched, oersi and sodix among them' })
	relays: string[];

	@ApiProperty({ description: 'The term the relays were asked for, which is the topic of the question' })
	query: string;

	constructor(data: ContentSearchResultResponse[], relays: string[], query: string) {
		this.data = data;
		this.relays = relays;
		this.query = query;
	}
}
