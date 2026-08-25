import { ApiProperty } from '@nestjs/swagger';
import { StringToBoolean } from '@shared/controller/transformer';
import { IsBoolean } from 'class-validator';

export class CommentsEnabledBodyParams {
	@IsBoolean()
	@StringToBoolean()
	@ApiProperty({ description: 'Whether participants may comment on the cards of this board.' })
	commentsEnabled!: boolean;
}
