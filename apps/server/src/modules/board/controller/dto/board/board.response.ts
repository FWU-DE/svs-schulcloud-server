import { BoardOperation, BoardOperationValues } from '@modules/board/authorisation/board-node.rule';
import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { DecodeHtmlEntities } from '@shared/controller/transformer';
import { BoardFeature, BoardLayout, CardReactionType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';
import { ColumnResponse } from './column.response';

export class BoardResponse {
	constructor({
		id,
		title,
		columns,
		timestamps,
		isVisible,
		readersCanEdit,
		reactionType,
		roomReactionType,
		commentsEnabled,
		roomCommentsEnabled,
		layout,
		features,
		allowedOperations,
	}: BoardResponse) {
		this.id = id;
		this.title = title;
		this.columns = columns;
		this.timestamps = timestamps;
		this.isVisible = isVisible;
		this.readersCanEdit = readersCanEdit;
		this.reactionType = reactionType;
		this.roomReactionType = roomReactionType;
		this.commentsEnabled = commentsEnabled;
		this.roomCommentsEnabled = roomCommentsEnabled;
		this.layout = layout;
		this.features = features;
		this.allowedOperations = allowedOperations;
	}

	@ApiProperty({
		pattern: bsonStringPattern,
	})
	id: string;

	@ApiProperty()
	@DecodeHtmlEntities()
	title?: string;

	@ApiProperty({
		type: [ColumnResponse],
	})
	columns: ColumnResponse[];

	@ApiProperty()
	timestamps: TimestampsResponse;

	@ApiProperty()
	isVisible: boolean;

	@ApiProperty()
	readersCanEdit: boolean;

	@ApiProperty({
		type: String,
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description: "This board's own feedback setting. null follows the room.",
	})
	reactionType: CardReactionType | null;

	@ApiProperty({ enum: CardReactionType, enumName: 'CardReactionType', description: 'What the room defaults to.' })
	roomReactionType: CardReactionType;

	@ApiProperty({
		type: Boolean,
		nullable: true,
		description: "This board's own comment setting. null follows the room.",
	})
	commentsEnabled: boolean | null;

	@ApiProperty({ description: 'What the room defaults to.' })
	roomCommentsEnabled: boolean;

	@ApiProperty({ enum: BoardLayout, enumName: 'BoardLayout' })
	layout: BoardLayout;

	@ApiProperty({ enum: BoardFeature, isArray: true, enumName: 'BoardFeature' })
	features: BoardFeature[];

	@ApiProperty({
		type: 'object',
		properties: BoardOperationValues.reduce((acc, op) => {
			acc[op] = { type: 'boolean' };
			return acc;
		}, {}),
		additionalProperties: false,
		required: [...BoardOperationValues],
	})
	allowedOperations: Record<BoardOperation, boolean>;
}
