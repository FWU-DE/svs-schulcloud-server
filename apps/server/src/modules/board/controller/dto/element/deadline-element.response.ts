import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class DeadlineElementContent {
	constructor(props: DeadlineElementContent) {
		this.title = props.title;
		this.dueDate = props.dueDate;
		this.showInCalendar = props.showInCalendar;
	}

	@ApiProperty()
	title: string;

	@ApiProperty({ type: String, format: 'date-time', required: true, nullable: true })
	dueDate: string | null;

	@ApiProperty({ description: 'Whether the deadline is listed in the calendar of everyone who sees the board.' })
	showInCalendar: boolean;
}

export class DeadlineElementResponse {
	constructor(props: DeadlineElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.DEADLINE;

	@ApiProperty()
	content: DeadlineElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
