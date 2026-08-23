import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { IsMongoId } from 'class-validator';

export class SubmissionCreateParams {
	@IsMongoId()
	@ApiProperty({
		description: 'The id of the task this submission belongs to.',
		pattern: bsonStringPattern,
		required: true,
		nullable: false,
	})
	taskId!: string;
}
