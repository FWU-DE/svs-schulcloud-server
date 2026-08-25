import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_COMMENT_LENGTH, MAX_REPORT_REASON_LENGTH } from '../../domain';

export class AddCardCommentMessageParams {
	@IsMongoId()
	cardId!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(MAX_COMMENT_LENGTH)
	text!: string;
}

export class EditCardCommentMessageParams extends AddCardCommentMessageParams {
	@IsMongoId()
	commentId!: string;
}

export class RemoveCardCommentMessageParams {
	@IsMongoId()
	cardId!: string;

	@IsMongoId()
	commentId!: string;
}

export class ReportCardCommentMessageParams extends RemoveCardCommentMessageParams {
	@IsString()
	@IsOptional()
	@MaxLength(MAX_REPORT_REASON_LENGTH)
	reason?: string;
}
