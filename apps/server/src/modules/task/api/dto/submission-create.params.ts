import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { IsMongoId, IsOptional } from 'class-validator';

export class SubmissionCreateParams {
	@IsMongoId()
	@ApiProperty({
		description: 'The id of the task this submission belongs to.',
		pattern: bsonStringPattern,
		required: true,
		nullable: false,
	})
	taskId!: string;

	/**
	 * Hand in on behalf of this student instead of the caller. Only a teacher of the task may
	 * use it — the shared-device case, where one iPad collects the whole class.
	 */
	@IsMongoId()
	@IsOptional()
	@ApiPropertyOptional({
		description: "Collect for this student instead of the caller. Requires write access to the task.",
		pattern: bsonStringPattern,
	})
	studentId?: string;
}
