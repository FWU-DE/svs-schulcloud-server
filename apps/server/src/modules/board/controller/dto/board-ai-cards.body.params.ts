import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '@shared/controller/transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BoardAiPreset } from '../../service/board-ai-cards.service';

export const BOARD_AI_PRESETS = ['differentiate', 'exercises', 'simplify', 'selfCheck', 'free'] as const;

export class BoardAiCardsBodyParams {
	@ApiProperty({
		description: 'Which kind of cards the ai should write for the given card or column',
		enum: BOARD_AI_PRESETS,
	})
	@IsIn(BOARD_AI_PRESETS)
	public preset!: BoardAiPreset;

	@ApiPropertyOptional({
		description: 'What the teacher asks for, used by the free preset',
		required: false,
	})
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	@SanitizeHtml()
	public prompt?: string;
}
