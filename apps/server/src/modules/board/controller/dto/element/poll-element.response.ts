import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType, PollResultVisibility } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class PollOptionResponse {
	constructor(props: PollOptionResponse) {
		this.id = props.id;
		this.text = props.text;
		this.count = props.count;
		this.voterIds = props.voterIds;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty()
	text: string;

	@ApiPropertyOptional({ description: 'Number of votes. Absent while the results are not visible to this user.' })
	count?: number;

	@ApiPropertyOptional({
		type: [String],
		description: 'Voters of this option. Only ever present for an open (non-anonymous) poll with visible results.',
	})
	voterIds?: string[];
}

export class PollElementContent {
	constructor(props: PollElementContent) {
		this.question = props.question;
		this.options = props.options;
		this.anonymous = props.anonymous;
		this.multipleChoice = props.multipleChoice;
		this.closed = props.closed;
		this.showResults = props.showResults;
		this.resultsReleased = props.resultsReleased;
		this.resultsVisible = props.resultsVisible;
		this.voterCount = props.voterCount;
		this.ownVote = props.ownVote;
	}

	@ApiProperty()
	question: string;

	@ApiProperty({ type: [PollOptionResponse] })
	options: PollOptionResponse[];

	@ApiProperty()
	anonymous: boolean;

	@ApiProperty()
	multipleChoice: boolean;

	@ApiProperty()
	closed: boolean;

	@ApiProperty({ enum: PollResultVisibility, enumName: 'PollResultVisibility' })
	showResults: PollResultVisibility;

	@ApiProperty({ description: 'Whether someone who may edit the poll has released the results.' })
	resultsReleased: boolean;

	@ApiProperty({ description: 'Whether the counts in the options are filled in for the requesting user.' })
	resultsVisible: boolean;

	@ApiPropertyOptional({ description: 'Number of participants. Absent while the results are not visible.' })
	voterCount?: number;

	@ApiProperty({ type: [String], description: 'Options the requesting user voted for.' })
	ownVote: string[];
}

export class PollElementResponse {
	constructor(props: PollElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.POLL;

	@ApiProperty()
	content: PollElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
