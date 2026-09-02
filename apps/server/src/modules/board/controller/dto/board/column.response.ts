import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { DecodeHtmlEntities } from '@shared/controller/transformer';
import { TimestampsResponse } from '../timestamps.response';
import { CardReactionType } from '../../../domain';
import { CardSkeletonResponse } from './card-skeleton.response';

export class ColumnResponse {
	constructor({ id, title, cards, timestamps, commentsEnabled, reactionType }: ColumnResponse) {
		this.id = id;
		this.title = title;
		this.cards = cards;
		this.timestamps = timestamps;
		this.commentsEnabled = commentsEnabled;
		this.reactionType = reactionType;
	}

	@ApiProperty({
		pattern: bsonStringPattern,
	})
	id: string;

	@ApiProperty()
	@DecodeHtmlEntities()
	title: string;

	@ApiProperty({
		type: [CardSkeletonResponse],
	})
	cards: CardSkeletonResponse[];

	@ApiProperty()
	timestamps: TimestampsResponse;

	@ApiProperty({
		type: Boolean,
		nullable: true,
		description: "This column's own comment setting. null follows the board.",
	})
	commentsEnabled: boolean | null;

	@ApiProperty({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description: "This column's own feedback setting. null follows the board.",
	})
	reactionType: CardReactionType | null;
}
