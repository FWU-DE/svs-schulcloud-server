import { IsMongoId } from 'class-validator';
import { CardReactionBodyParams } from '../../controller/dto';

export class ReactToCardMessageParams extends CardReactionBodyParams {
	@IsMongoId()
	cardId!: string;
}
