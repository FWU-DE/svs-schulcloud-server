import { ApiProperty } from '@nestjs/swagger';
import { QuickSearchResultResponse } from './quick-search-result.response';

export class QuickSearchListResponse {
	@ApiProperty({ type: [QuickSearchResultResponse] })
	data: QuickSearchResultResponse[];

	@ApiProperty({ description: 'The query the results belong to, so a late answer can be discarded' })
	query: string;

	constructor(data: QuickSearchResultResponse[], query: string) {
		this.data = data;
		this.query = query;
	}
}
