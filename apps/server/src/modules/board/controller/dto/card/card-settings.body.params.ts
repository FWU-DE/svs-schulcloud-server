import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { CardReactionType } from '../../../domain';

/**
 * Per-card overrides of the settings above it. `null` puts the card back under the board's
 * setting, which is why these are nullable rather than merely optional: leaving a field out
 * changes nothing, sending `null` clears the override.
 */
export class CardSettingsBodyParams {
	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsBoolean()
	@ApiPropertyOptional({ type: Boolean, nullable: true, description: 'null follows the board setting.' })
	commentsEnabled?: boolean | null;

	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsBoolean()
	@ApiPropertyOptional({ type: Boolean, nullable: true, description: 'null follows the board setting.' })
	readersCanEdit?: boolean | null;

	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsEnum(CardReactionType)
	@ApiPropertyOptional({
		enum: CardReactionType,
		enumName: 'CardReactionType',
		nullable: true,
		description: 'null follows the column, and through it the board.',
	})
	reactionType?: CardReactionType | null;
}
