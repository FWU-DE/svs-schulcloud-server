import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { TimestampsResponse } from '../timestamps.response';

export class CardCommentResponse {
	constructor(props: CardCommentResponse) {
		this.id = props.id;
		this.text = props.text;
		this.authorId = props.authorId;
		this.authorName = props.authorName;
		this.isOwn = props.isOwn;
		this.isRemoved = props.isRemoved;
		this.removedByModerator = props.removedByModerator;
		this.isEdited = props.isEdited;
		this.ownReport = props.ownReport;
		this.reportCount = props.reportCount;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ description: 'Empty for a removed comment.' })
	text: string;

	@ApiProperty({ pattern: bsonStringPattern })
	authorId: string;

	@ApiProperty()
	authorName: string;

	@ApiProperty()
	isOwn: boolean;

	@ApiProperty()
	isRemoved: boolean;

	@ApiProperty({ description: 'Whether a moderator removed it rather than the author.' })
	removedByModerator: boolean;

	@ApiProperty()
	isEdited: boolean;

	@ApiProperty({ description: 'Whether the requesting user has reported this comment.' })
	ownReport: boolean;

	@ApiPropertyOptional({
		description: 'How often the comment was reported. Only present for users who may moderate.',
	})
	reportCount?: number;

	@ApiProperty()
	timestamps: TimestampsResponse;
}

export class CardCommentListResponse {
	constructor(props: CardCommentListResponse) {
		this.data = props.data;
	}

	@ApiProperty({ type: [CardCommentResponse] })
	data: CardCommentResponse[];
}
