import { ApiPropertyOptional } from '@nestjs/swagger';
import { SanitizeHtml } from '@shared/controller/transformer';
import { InputFormat } from '@shared/domain/types';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubmissionUpdateParams {
	@IsBoolean()
	@IsOptional()
	@ApiPropertyOptional({
		description: 'Whether the submission is handed in. Files are attached through the files-storage API.',
	})
	submitted?: boolean;

	@IsString()
	@IsOptional()
	@SanitizeHtml(InputFormat.RICH_TEXT_CK5)
	@ApiPropertyOptional({
		description: 'The text the submitter added to the submission.',
	})
	comment?: string;
}
