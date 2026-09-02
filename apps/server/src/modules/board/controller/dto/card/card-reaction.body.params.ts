import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CardReactionBodyParams {
	@IsInt()
	@Min(-1)
	@Max(5)
	@IsOptional()
	@ApiPropertyOptional({
		description:
			'1 for a like, 1..5 for stars, -1 or 1 for a vote. Omit to withdraw a reaction. ' +
			'The board decides which of these is meaningful; anything else is rejected.',
	})
	value?: number;
}
