import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { DecodeHtmlEntities } from '@shared/controller/transformer';
import { TimestampsResponse } from '../timestamps.response';
import { CardReactionType } from '../../../domain';
import { CardResponse } from '../card';

export class ColumnFullResponse {
	constructor({ id, title, cards, timestamps, commentsEnabled, reactionType }: ColumnFullResponse) {
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
		type: [CardResponse],
	})
	cards: CardResponse[];

	@ApiProperty()
	timestamps: TimestampsResponse;

	@ApiProperty({ type: Boolean, nullable: true, description: "The column's own comment setting." })
	commentsEnabled: boolean | null;

	@ApiProperty({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description: "The column's own feedback setting.",
	})
	reactionType: CardReactionType | null;
}
