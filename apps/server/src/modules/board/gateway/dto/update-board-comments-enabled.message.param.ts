import { IsMongoId } from 'class-validator';
import { CommentsEnabledBodyParams } from '../../controller/dto';

export class UpdateBoardCommentsEnabledMessageParams extends CommentsEnabledBodyParams {
	@IsMongoId()
	boardId!: string;
}
