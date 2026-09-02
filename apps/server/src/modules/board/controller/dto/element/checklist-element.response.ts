import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ChecklistProgressMode, ContentElementType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class ChecklistItemResponse {
	constructor(props: ChecklistItemResponse) {
		this.id = props.id;
		this.text = props.text;
		this.checked = props.checked;
		this.checkedCount = props.checkedCount;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty()
	text: string;

	@ApiProperty({
		description: "In a shared list the group's tick, in a personal list the requesting user's own tick.",
	})
	checked: boolean;

	@ApiPropertyOptional({
		description:
			'How many people ticked this item. Only present for a personal list and only for ' +
			'someone who may edit the element — and it is a count, never a list of names.',
	})
	checkedCount?: number;
}

export class ChecklistElementContent {
	constructor(props: ChecklistElementContent) {
		this.title = props.title;
		this.items = props.items;
		this.progressMode = props.progressMode;
		this.completedCount = props.completedCount;
		this.participantCount = props.participantCount;
	}

	@ApiProperty()
	title: string;

	@ApiProperty({ type: [ChecklistItemResponse] })
	items: ChecklistItemResponse[];

	@ApiProperty({ enum: ChecklistProgressMode, enumName: 'ChecklistProgressMode' })
	progressMode: ChecklistProgressMode;

	@ApiProperty({ description: 'Items the requesting user sees as done, out of items.length.' })
	completedCount: number;

	@ApiPropertyOptional({
		description:
			'How many people ticked at least one item. Only present for a personal list and only ' +
			'for someone who may edit the element.',
	})
	participantCount?: number;
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
