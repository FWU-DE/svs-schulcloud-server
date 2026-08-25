import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '@shared/controller/transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RoomAiTemplateBodyParams {
	@ApiProperty({
		description: 'Description of the room the teacher wants to create, in their own words',
		required: true,
	})
	@IsString()
	@MinLength(3)
	@MaxLength(1000)
	@SanitizeHtml()
	prompt!: string;

	@ApiPropertyOptional({
		description: 'Upper bound for the number of columns the suggestion may contain',
		required: false,
		minimum: 1,
		maximum: 12,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(12)
	maxColumns?: number;
}
