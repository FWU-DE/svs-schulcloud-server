import { IsMongoId } from 'class-validator';
import { CardSettingsBodyParams } from '../../controller/dto';

export class UpdateCardSettingsMessageParams extends CardSettingsBodyParams {
	@IsMongoId()
	cardId!: string;
}
