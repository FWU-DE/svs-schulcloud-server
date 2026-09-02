import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';

export class CommentsEnabledBodyParams {
	@IsOptional()
	@ValidateIf((_object, value) => value !== null)
	@IsBoolean()
	@ApiProperty({
		type: Boolean,
		nullable: true,
		description:
			'Whether participants may comment on the cards of this board. null follows whatever the ' + 'room is set to.',
	})
	commentsEnabled!: boolean | null;
}
