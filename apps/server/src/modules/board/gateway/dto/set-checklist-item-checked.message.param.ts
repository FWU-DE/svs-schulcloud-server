import { IsMongoId } from 'class-validator';
import { ChecklistItemCheckedBodyParams } from '../../controller/dto';

export class SetChecklistItemCheckedMessageParams extends ChecklistItemCheckedBodyParams {
	@IsMongoId()
	elementId!: string;

	@IsMongoId()
	itemId!: string;
}
