import type { FormerMembershipType } from '@modules/user';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';

// Validated as a plain string union (not a class-validator enum) so it lines up exactly with
// UserDo's FormerMembershipType - no separate param enum to keep in sync with it.
export class FormerMembershipUrlParams {
	@IsIn(['course', 'room'])
	@ApiProperty({ enum: ['course', 'room'], enumName: 'FormerMembershipType', required: true })
	type!: FormerMembershipType;

	@IsMongoId()
	@ApiProperty({ description: 'The id snapshotted at removal time (a course id, or a room-access group id).' })
	refId!: string;
}
