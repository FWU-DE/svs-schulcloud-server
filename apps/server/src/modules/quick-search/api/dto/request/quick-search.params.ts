import { ApiProperty } from '@nestjs/swagger';
import { StringToNumber } from '@shared/controller/transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class QuickSearchParams {
	@ApiProperty({ description: 'What the user typed into the palette' })
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	query!: string;

	@ApiProperty({ description: 'How many results to return', required: false, minimum: 1, maximum: 20 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@StringToNumber()
	limit?: number;
}
