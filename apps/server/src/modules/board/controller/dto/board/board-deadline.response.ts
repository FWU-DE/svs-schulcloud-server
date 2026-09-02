import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { BoardExternalReferenceType } from '../../../domain';

export class BoardDeadlineResponse {
	constructor(props: BoardDeadlineResponse) {
		this.elementId = props.elementId;
		this.cardId = props.cardId;
		this.boardId = props.boardId;
		this.boardTitle = props.boardTitle;
		this.title = props.title;
		this.dueDate = props.dueDate;
		this.contextType = props.contextType;
		this.contextId = props.contextId;
		this.contextName = props.contextName;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	elementId: string;

	@ApiProperty({ pattern: bsonStringPattern })
	cardId: string;

	@ApiProperty({ pattern: bsonStringPattern })
	boardId: string;

	@ApiProperty()
	boardTitle: string;

	@ApiProperty()
	title: string;

	@ApiProperty({ type: String, format: 'date-time' })
	dueDate: string;

	@ApiProperty({ enum: BoardExternalReferenceType, enumName: 'BoardExternalReferenceType' })
	contextType: BoardExternalReferenceType;

	@ApiProperty({ pattern: bsonStringPattern })
	contextId: string;

	@ApiPropertyOptional({ description: 'Name of the room or course the board belongs to.' })
	contextName?: string;
}

export class BoardDeadlineListResponse {
	constructor(props: BoardDeadlineListResponse) {
		this.data = props.data;
	}

	@ApiProperty({ type: [BoardDeadlineResponse] })
	data: BoardDeadlineResponse[];
}
