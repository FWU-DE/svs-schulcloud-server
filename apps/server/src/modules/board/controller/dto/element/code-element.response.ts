import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class CodeElementContent {
	constructor(props: CodeElementContent) {
		this.code = props.code;
		this.language = props.language;
	}

	@ApiProperty()
	code: string;

	@ApiProperty({ description: 'A language label. It is shown next to the block, nothing is executed.' })
	language: string;
}

export class CodeElementResponse {
	constructor(props: CodeElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.CODE;

	@ApiProperty()
	content: CodeElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
