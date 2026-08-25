import { IsMongoId } from 'class-validator';
import { ReactionTypeBodyParams } from '../../controller/dto';

export class UpdateBoardReactionTypeMessageParams extends ReactionTypeBodyParams {
	@IsMongoId()
	boardId!: string;
}
