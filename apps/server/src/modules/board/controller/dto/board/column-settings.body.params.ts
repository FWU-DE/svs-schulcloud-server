import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { CardReactionType } from '../../../domain';

/**
 * Per-column overrides of the board's settings. Leaving a field out changes nothing, sending
 * `null` clears the override and puts the column back under the board.
 */
export class ColumnSettingsBodyParams {
	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsBoolean()
	@ApiPropertyOptional({ type: Boolean, nullable: true, description: 'null follows the board setting.' })
	commentsEnabled?: boolean | null;

	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsEnum(CardReactionType)
	@ApiPropertyOptional({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description: 'null follows the board setting.',
	})
	reactionType?: CardReactionType | null;
}
