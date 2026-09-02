import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator';

export class PollVoteBodyParams {
	@IsArray()
	@ArrayMaxSize(20)
	@IsMongoId({ each: true })
	@ApiProperty({
		type: [String],
		description: 'The options to vote for. An empty list withdraws a previously cast vote.',
	})
	optionIds!: string[];
}
