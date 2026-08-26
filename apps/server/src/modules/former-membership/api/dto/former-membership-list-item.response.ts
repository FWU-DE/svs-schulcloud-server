import { ApiProperty } from '@nestjs/swagger';
import { FormerMembershipType } from '@modules/user';

export class FormerMembershipListItemResponse {
	@ApiProperty({ enum: ['course', 'room'], enumName: 'FormerMembershipType' })
	type: FormerMembershipType;

	@ApiProperty()
	refId: string;

	@ApiProperty()
	name: string;

	@ApiProperty()
	schoolId: string;

	@ApiProperty()
	removedAt: Date;

	constructor(props: FormerMembershipListItemResponse) {
		this.type = props.type;
		this.refId = props.refId;
		this.name = props.name;
		this.schoolId = props.schoolId;
		this.removedAt = props.removedAt;
	}
}

export class FormerMembershipListResponse {
	@ApiProperty({ type: [FormerMembershipListItemResponse] })
	data: FormerMembershipListItemResponse[];

	constructor(data: FormerMembershipListItemResponse[]) {
		this.data = data;
	}
}
