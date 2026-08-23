import { UsersList } from '@modules/course/repo';
import { type Submission } from '../../repo';
import { SubmissionCollectStudentResponse, SubmissionStatusResponse } from '../dto';

export class SubmissionMapper {
	public static mapToStatusResponse(submission: Submission): SubmissionStatusResponse {
		const dto = new SubmissionStatusResponse({
			id: submission.id,
			submitters: submission.getSubmitterIds(),
			isSubmitted: submission.isSubmitted(),
			grade: submission.grade,
			isGraded: submission.isGraded(),
			submittingCourseGroupName: submission.courseGroup?.name,
		});

		return dto;
	}

	/**
	 * Pairs every student of the course with their submission, if any. A student without one is
	 * still a row — that is the whole point of the collect list.
	 */
	static mapToCollectResponse(students: UsersList[], submissions: Submission[]): SubmissionCollectStudentResponse[] {
		const submissionByStudentId = new Map<string, Submission>();
		for (const submission of submissions) {
			for (const submitterId of submission.getSubmitterIds()) {
				submissionByStudentId.set(submitterId, submission);
			}
		}

		return students.map((student) => {
			const submission = submissionByStudentId.get(student.id);

			return new SubmissionCollectStudentResponse({
				studentId: student.id,
				firstName: student.firstName,
				lastName: student.lastName,
				submissionId: submission?.id,
				isSubmitted: submission?.isSubmitted() ?? false,
				isGraded: submission?.isGraded() ?? false,
			});
		});
	}
}
