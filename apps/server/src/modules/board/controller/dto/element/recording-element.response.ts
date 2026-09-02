import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType, RecordingMediaType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class RecordingElementContent {
	constructor(props: RecordingElementContent) {
		this.mediaType = props.mediaType;
		this.caption = props.caption;
	}

	@ApiProperty({ enum: RecordingMediaType, enumName: 'RecordingMediaType' })
	mediaType: RecordingMediaType;

	@ApiProperty()
	caption: string;
}

export class RecordingElementResponse {
	constructor(props: RecordingElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.RECORDING;

	@ApiProperty()
	content: RecordingElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
