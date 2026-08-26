import { StringToNumber } from '@shared/controller/transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ContentSearchParams {
	@ApiProperty({ description: 'What the material should be about' })
	@IsString()
	@MinLength(2)
	@MaxLength(200)
	query!: string;

	@ApiProperty({ description: 'How many results to return', required: false, minimum: 1, maximum: 10 })
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(10)
	@StringToNumber()
	limit?: number;
}
