import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_COMMENT_LENGTH, MAX_REPORT_REASON_LENGTH } from '../../../domain';

export class CardCommentBodyParams {
	@IsString()
	@MinLength(1)
	@MaxLength(MAX_COMMENT_LENGTH)
	@ApiProperty({ maxLength: MAX_COMMENT_LENGTH })
	text!: string;
}

export class CardCommentReportBodyParams {
	@IsString()
	@IsOptional()
	@MaxLength(MAX_REPORT_REASON_LENGTH)
	@ApiPropertyOptional({ maxLength: MAX_REPORT_REASON_LENGTH })
	reason?: string;
}

export class CardCommentUrlParams {
	@IsMongoId()
	@ApiProperty({ nullable: false, required: true })
	cardId!: string;

	@IsMongoId()
	@ApiProperty({ nullable: false, required: true })
	commentId!: string;
}
