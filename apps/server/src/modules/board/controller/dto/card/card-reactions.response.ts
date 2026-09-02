import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardReactionType } from '../../../domain';

export class CardReactionsResponse {
	constructor(props: CardReactionsResponse) {
		this.type = props.type;
		this.count = props.count;
		this.sum = props.sum;
		this.ownValue = props.ownValue;
	}

	@ApiProperty({ enum: CardReactionType, enumName: 'CardReactionType' })
	type: CardReactionType;

	@ApiProperty({ description: 'How many people reacted. One reaction per person.' })
	count: number;

	@ApiProperty({
		description: 'Sum of all reaction values: the like count, the total of the stars, or the net score of the votes.',
	})
	sum: number;

	@ApiPropertyOptional({ description: "The requesting user's own reaction, absent if they have not reacted." })
	ownValue?: number;
}
