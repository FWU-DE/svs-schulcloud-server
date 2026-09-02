import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { CardReactionType } from '../../../domain';

export class ReactionTypeBodyParams {
	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsEnum(CardReactionType)
	@ApiProperty({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description:
			"The reaction kind for the cards of this board. 'none' turns reactions off here; null " +
			'follows whatever the room is set to.',
	})
	reactionType!: CardReactionType | null;
}
