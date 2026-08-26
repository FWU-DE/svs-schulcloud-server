import { IsMongoId } from 'class-validator';
import { ColumnSettingsBodyParams } from '../../controller/dto';

export class UpdateColumnSettingsMessageParams extends ColumnSettingsBodyParams {
	@IsMongoId()
	columnId!: string;
}
