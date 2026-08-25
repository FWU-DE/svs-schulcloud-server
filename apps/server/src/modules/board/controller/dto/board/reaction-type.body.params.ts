import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CardReactionType } from '../../../domain';

export class ReactionTypeBodyParams {
	@IsEnum(CardReactionType)
	@ApiProperty({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		description: "The reaction kind for every card on this board. 'none' turns reactions off.",
	})
	reactionType!: CardReactionType;
}
