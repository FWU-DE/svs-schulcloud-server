import { ApiProperty } from '@nestjs/swagger';
import { StringToBoolean } from '@shared/controller/transformer';
import { IsBoolean, IsMongoId } from 'class-validator';

export class ChecklistItemUrlParams {
	@IsMongoId()
	@ApiProperty({ nullable: false, required: true })
	contentElementId!: string;

	@IsMongoId()
	@ApiProperty({ nullable: false, required: true })
	itemId!: string;
}

export class ChecklistItemCheckedBodyParams {
	@IsBoolean()
	@StringToBoolean()
	@ApiProperty()
	checked!: boolean;
}
