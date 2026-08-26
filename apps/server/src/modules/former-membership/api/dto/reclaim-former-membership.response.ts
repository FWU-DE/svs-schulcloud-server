import { ApiProperty } from '@nestjs/swagger';

export class ReclaimFormerMembershipResponse {
	@ApiProperty({ description: 'Whether the membership was restored. False if the target no longer exists.' })
	reclaimed: boolean;

	constructor(reclaimed: boolean) {
		this.reclaimed = reclaimed;
	}
}
