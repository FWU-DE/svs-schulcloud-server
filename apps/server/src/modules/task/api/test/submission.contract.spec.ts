import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CourseEntity, CourseGroupEntity } from '@modules/course/repo';
import { courseGroupEntityFactory } from '@modules/course/testing';
import { userFactory } from '@modules/user/testing';
import { LessonEntity, Material } from '@modules/lesson/repo';
import { User } from '@modules/user/repo';
import { setupEntities } from '@testing/database';
import { Submission, Task } from '../../repo';
import { submissionFactory } from '../../testing';
import { SubmissionCreateParams, SubmissionUpdateParams } from '../dto';
import { SubmissionMapper } from '../mapper';

const CONTRACTS_DIR = join(__dirname, '../../../../../../../contracts/submission');

const readContract = (name: string): unknown => JSON.parse(readFileSync(join(CONTRACTS_DIR, name), 'utf-8'));

/**
 * The shape of a payload: every key path paired with its JSON type, sorted. Values are ignored —
 * ids and grades differ per run, key names and types are what a client breaks on.
 */
const shapeOf = (value: unknown, path = ''): string[] => {
	if (Array.isArray(value)) {
		// One entry describes the element shape: a list of two identical objects adds nothing.
		return value.length === 0 ? [`${path}[]: empty`] : shapeOf(value[0], `${path}[]`);
	}
	if (value !== null && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>)
			.flatMap(([key, entry]) => shapeOf(entry, path === '' ? key : `${path}.${key}`))
			.sort();
	}
	return [`${path}: ${value === null ? 'null' : typeof value}`];
};

/**
 * Guards the wire format the native clients decode. `ios-client` keeps a copy of these same
 * files and decodes them into its Codable models, so a rename caught here is a rename the app
 * would otherwise only notice as an empty screen at runtime.
 */
describe('Submission API contract', () => {
	beforeAll(async () => {
		await setupEntities([User, Task, Submission, CourseEntity, CourseGroupEntity, LessonEntity, Material]);
	});

	describe('SubmissionStatusResponse', () => {
		it('should match the contract fixture with every optional field populated', () => {
			const submission = submissionFactory
				.studentWithId()
				.submitted()
				.graded()
				.buildWithId({
					grade: 87,
					gradeComment: 'Sauber hergeleitet, Einheit fehlt.',
					attachments: [
						{
							id: '6a8a8f058131326c109b2882',
							name: 'Lesetagebuch.pdf',
							url: '/api/v3/file/download/6a8a8f058131326c109b2882/Lesetagebuch.pdf',
							mimeType: 'application/pdf',
							size: 398,
						},
					],
					annotations: [
						{ id: 'annotation-1', page: 1, kind: 'correction', text: 'Rechenweg fehlt.', quote: 'x = 4' },
					],
				});
			submission.courseGroup = courseGroupEntityFactory.buildWithId({
				name: 'Gruppe Nord',
				students: [userFactory.buildWithId()],
			});

			const response = SubmissionMapper.mapToStatusResponse(submission);

			expect(shapeOf(JSON.parse(JSON.stringify(response)))).toEqual(
				shapeOf(readContract('submission-status.response.json'))
			);
		});

		it('should match the list fixture for a plain, ungraded submission', () => {
			const submission = submissionFactory.studentWithId().submitted().buildWithId();

			const listResponse = { data: [SubmissionMapper.mapToStatusResponse(submission)] };

			expect(shapeOf(JSON.parse(JSON.stringify(listResponse)))).toEqual(
				shapeOf(readContract('submission-status-list.response.json'))
			);
		});
	});

	describe('SubmissionCollectListResponse', () => {
		it('should match the collect fixture', () => {
			const student = userFactory.buildWithId();
			const submission = submissionFactory.submitted().buildWithId({ student });
			const students = [
				{ id: student.id, schoolId: student.school.id, firstName: 'Marla', lastName: 'Mathe' },
			];

			const listResponse = { data: SubmissionMapper.mapToCollectResponse(students, [submission]) };

			expect(shapeOf(JSON.parse(JSON.stringify(listResponse)))).toEqual(
				shapeOf(readContract('submission-collect-list.response.json'))
			);
		});
	});

	describe('request params', () => {
		it('should accept the create fixture into SubmissionCreateParams', () => {
			const fixture = readContract('submission-create.request.json') as SubmissionCreateParams;

			const params = new SubmissionCreateParams();
			params.taskId = fixture.taskId;

			params.studentId = fixture.studentId;

			expect(Object.keys(fixture).sort()).toEqual(['studentId', 'taskId']);
			expect(params.taskId).toEqual(fixture.taskId);
			expect(params.studentId).toEqual(fixture.studentId);
		});

		it('should accept the update fixture into SubmissionUpdateParams', () => {
			const fixture = readContract('submission-update.request.json') as SubmissionUpdateParams;

			const params = new SubmissionUpdateParams();
			params.submitted = fixture.submitted;
			params.comment = fixture.comment;

			// Grading fields must never appear in the fixture: they would suggest a client may send them.
			expect(Object.keys(fixture).sort()).toEqual(['comment', 'submitted']);
			expect(params.submitted).toBe(true);
		});
	});
});
