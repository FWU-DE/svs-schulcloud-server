import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';

/**
 * Per-card overrides of the board-wide settings. `null` puts the card back under the board's
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
}
