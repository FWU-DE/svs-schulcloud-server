import { ApiProperty } from '@nestjs/swagger';
import { QuickSearchResult, QuickSearchResultType } from '../../../quick-search.service';

export class QuickSearchResultResponse implements QuickSearchResult {
	@ApiProperty()
	id: string;

	@ApiProperty({ enum: QuickSearchResultType, enumName: 'QuickSearchResultType' })
	type: QuickSearchResultType;

	@ApiProperty({ description: 'What is shown as the result line, e.g. the room name' })
	title: string;

	@ApiProperty({ description: 'A second line for context, empty when there is nothing to add' })
	subtitle: string;

	@ApiProperty({ description: 'Where the client navigates on Enter' })
	url: string;

	constructor(result: QuickSearchResult) {
		this.id = result.id;
		this.type = result.type;
		this.title = result.title;
		this.subtitle = result.subtitle;
		this.url = result.url;
	}
}
