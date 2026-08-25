import { IsMongoId } from 'class-validator';
import { PollVoteBodyParams } from '../../controller/dto';

export class VoteInPollMessageParams extends PollVoteBodyParams {
	@IsMongoId()
	elementId!: string;
}
