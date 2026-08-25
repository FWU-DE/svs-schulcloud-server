import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class ChecklistItemResponse {
	constructor(props: ChecklistItemResponse) {
		this.id = props.id;
		this.text = props.text;
		this.checked = props.checked;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty()
	text: string;

	@ApiProperty()
	checked: boolean;
}

export class ChecklistElementContent {
	constructor(props: ChecklistElementContent) {
		this.title = props.title;
		this.items = props.items;
	}

	@ApiProperty()
	title: string;

	@ApiProperty({ type: [ChecklistItemResponse] })
	items: ChecklistItemResponse[];
}

export class ChecklistElementResponse {
	constructor(props: ChecklistElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.CHECKLIST;

	@ApiProperty()
	content: ChecklistElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
