import { ApiProperty } from '@nestjs/swagger';
import type { ContentSearchResult } from '../../../content-search.service';

export class ContentSearchResultResponse implements ContentSearchResult {
	@ApiProperty()
	title: string;

	@ApiProperty()
	description: string;

	@ApiProperty()
	url: string;

	@ApiProperty({ description: 'Who published the material' })
	provider: string;

	@ApiProperty({ description: 'Short licence name, e.g. CC BY-SA' })
	license: string;

	@ApiProperty({ description: 'Kind of material, e.g. Video or Worksheet' })
	resourceType: string;

	@ApiProperty()
	educationalLevel: string;

	@ApiProperty({ type: [String] })
	subjects: string[];

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
