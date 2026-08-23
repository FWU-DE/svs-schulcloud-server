import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One row of the collect list: a student of the task's course together with the state of their
 * submission, if they have one. Built for the shared-device case — a teacher walking through the
 * class with a single iPad needs the students who have *not* handed in yet, which the plain
 * submission status cannot show because it only knows about submissions that already exist.
 */
export class SubmissionCollectStudentResponse {
	@ApiProperty()
	studentId: string;

	@ApiProperty()
	firstName: string;

	@ApiProperty()
	lastName: string;

	@ApiPropertyOptional()
	submissionId?: string;

	@ApiProperty()
	isSubmitted: boolean;

	@ApiProperty()
	isGraded: boolean;

	constructor(props: SubmissionCollectStudentResponse) {
		this.studentId = props.studentId;
		this.firstName = props.firstName;
		this.lastName = props.lastName;
		this.submissionId = props.submissionId;
		this.isSubmitted = props.isSubmitted;
		this.isGraded = props.isGraded;
	}
}

export class SubmissionCollectListResponse {
	@ApiProperty({ type: [SubmissionCollectStudentResponse] })
	data: SubmissionCollectStudentResponse[];

	constructor(data: SubmissionCollectStudentResponse[]) {
		this.data = data;
	}
}
