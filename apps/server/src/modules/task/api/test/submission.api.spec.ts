import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { FilesStorageClientAdapterService } from '@infra/files-storage-amqp-client';
import { EntityManager, ObjectId } from '@mikro-orm/mongodb';
import { courseEntityFactory, courseGroupEntityFactory } from '@modules/course/testing';
import { ServerTestModule } from '@modules/server/server.app.module';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type ApiValidationError } from '@shared/common/error';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { Submission } from '../../repo';
import { submissionFactory, taskFactory } from '../../testing';
import { type SubmissionStatusListResponse, type SubmissionStatusResponse } from '../dto';

describe('Submission Controller (API)', () => {
	describe('find statuses by task', () => {
		let app: INestApplication;
		let em: EntityManager;
		let apiClient: TestApiClient;

		beforeAll(async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [ServerTestModule],
			}).compile();

			app = module.createNestApplication();
			await app.init();
			em = module.get(EntityManager);
			apiClient = new TestApiClient(app, '/submissions');
		});

		beforeEach(async () => {
			await cleanupCollections(em);
		});

		afterAll(async () => {
			await app.close();
		});

		describe('WHEN user is not authenticated', () => {
			it('should return 401', async () => {
				const taskId = 'id';

				const { status } = await apiClient.get(`status/task/${taskId}`);

				expect(status).toEqual(401);
			});
		});

		describe('WHEN user is authenticated and has permission', () => {
			const setup = async () => {
				const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
				const task = taskFactory.buildWithId();
				const courseGroup = courseGroupEntityFactory.buildWithId();
				const submission = submissionFactory.buildWithId({ task, student: teacherUser, grade: 97, courseGroup });

				await em.persist([submission, teacherAccount, teacherUser]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(teacherAccount);

				return { loggedInClient, task, submission };
			};

			it('should return status', async () => {
				const { task, submission, loggedInClient } = await setup();

				const response = await loggedInClient.get(`status/task/${task.id}`);
				const statuses = response.body as SubmissionStatusListResponse;

				const expectedSubmissionStatuses = {
					data: [
						{
							id: submission.id,
							submitters: submission.getSubmitterIds(),
							isSubmitted: submission.isSubmitted(),
							isGraded: submission.isGraded(),
							grade: submission.grade,
							submittingCourseGroupName: submission.courseGroup?.name,
						},
					],
				};

				expect(statuses).toEqual(expectedSubmissionStatuses);
			});
		});

		describe('with bad request data', () => {
			const setup = async () => {
				const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
				const task = taskFactory.buildWithId();
				const courseGroup = courseGroupEntityFactory.buildWithId();
				const submission = submissionFactory.buildWithId({ task, student: teacherUser, grade: 97, courseGroup });

				await em.persist([submission, teacherAccount, teacherUser]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(teacherAccount);

				return { loggedInClient, task, submission };
			};

			it('should return status 400 for invalid taskId', async () => {
				const { loggedInClient } = await setup();

				const response = await loggedInClient.get(`status/task/123`);
				const result = response.body as ApiValidationError;

				expect(response.status).toEqual(400);
				expect(result.validationErrors).toEqual([
					{
						errors: ['taskId must be a mongodb id'],
						field: ['taskId'],
					},
				]);
			});
		});

		describe('WHEN user is authenticated and has no permission', () => {
			const setup = async () => {
				const task = taskFactory.buildWithId();
				const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
				const submission = submissionFactory.buildWithId({ task });

				await em.persist([submission, teacherUser, teacherAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(teacherAccount);

				return { task, loggedInClient };
			};

			it('should return 200', async () => {
				const { task, loggedInClient } = await setup();

				const response = await loggedInClient.get(`status/task/${task.id}`);

				const expectedResult = { data: [] };

				expect(response.status).toEqual(200);
				expect(response.body).toEqual(expectedResult);
			});
		});
	});

	describe('delete submission', () => {
		let app: INestApplication;
		let em: EntityManager;
		let filesStorageClientAdapterService: DeepMocked<FilesStorageClientAdapterService>;
		let apiClient: TestApiClient;

		beforeAll(async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [ServerTestModule],
			})
				.overrideProvider(FilesStorageClientAdapterService)
				.useValue(createMock<FilesStorageClientAdapterService>())
				.compile();

			app = module.createNestApplication();
			await app.init();
			em = module.get(EntityManager);
			filesStorageClientAdapterService = app.get(FilesStorageClientAdapterService);
			apiClient = new TestApiClient(app, '/submissions');
		});

		beforeEach(async () => {
			await cleanupCollections(em);
		});

		afterAll(async () => {
			await app.close();
		});

		describe('WHEN user is not authenticated', () => {
			it('should return 401', async () => {
				const submissionId = 'id';

				const { status } = await apiClient.delete(submissionId);

				expect(status).toEqual(401);
			});
		});

		describe('WHEN user is authenticated and has permission', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const task = taskFactory.buildWithId();
				const submission = submissionFactory.buildWithId({ task, student: studentUser, grade: 97 });

				await em.persist([submission, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { submission, loggedInClient };
			};

			it('should return status', async () => {
				const { submission, loggedInClient } = await setup();

				const result = await loggedInClient.delete(submission.id);

				expect(filesStorageClientAdapterService.deleteFilesOfParent).toHaveBeenCalled();
				expect(result.text).toBe('true');

				const expectedSubmissionResult = await em.findOne(Submission, { id: submission.id });
				expect(expectedSubmissionResult).toEqual(null);
			});
		});

		describe('with bad request data', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const task = taskFactory.buildWithId();
				const submission = submissionFactory.buildWithId({ task, student: studentUser, grade: 97 });

				await em.persist([submission, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { submission, loggedInClient };
			};

			it('should return status 400 for invalid taskId', async () => {
				const { loggedInClient } = await setup();
				const response = await loggedInClient.delete('123');
				const result = response.body as ApiValidationError;

				expect(response.status).toEqual(400);
				expect(result.validationErrors).toEqual([
					{
						errors: ['submissionId must be a mongodb id'],
						field: ['submissionId'],
					},
				]);
			});
		});

		describe('WHEN user is authenticated and has no permission', () => {
			const setup = async () => {
				const course = courseEntityFactory.buildWithId();
				const task = taskFactory.buildWithId({ course });
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const submission = submissionFactory.buildWithId({ task });

				await em.persist([submission, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { submission, loggedInClient };
			};

			it('should return 403', async () => {
				const { submission, loggedInClient } = await setup();

				const { status } = await loggedInClient.delete(submission.id);

				expect(status).toEqual(403);
			});
		});

		describe('WHEN user is authenticated, has no permission and task has no parent', () => {
			const setup = async () => {
				const task = taskFactory.buildWithId();
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const submission = submissionFactory.buildWithId({ task });

				await em.persist([submission, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { submission, loggedInClient };
			};

			it('should return 403', async () => {
				const { submission, loggedInClient } = await setup();

				const { status } = await loggedInClient.delete(submission.id);

				expect(status).toEqual(403);
			});
		});
	});
	describe('create submission', () => {
		let app: INestApplication;
		let em: EntityManager;
		let apiClient: TestApiClient;

		beforeAll(async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [ServerTestModule],
			}).compile();

			app = module.createNestApplication();
			await app.init();
			em = module.get(EntityManager);
			apiClient = new TestApiClient(app, '/submissions');
		});

		beforeEach(async () => {
			await cleanupCollections(em);
		});

		afterAll(async () => {
			await app.close();
		});

		describe('WHEN user is not authenticated', () => {
			it('should return 401', async () => {
				const { status } = await apiClient.post('', { taskId: new ObjectId().toHexString() });

				expect(status).toEqual(401);
			});
		});

		describe('WHEN taskId is not a mongo id', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();

				await em.persist([studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { loggedInClient };
			};

			it('should return 400', async () => {
				const { loggedInClient } = await setup();

				const { status } = await loggedInClient.post('', { taskId: 'not-an-id' });

				expect(status).toEqual(400);
			});
		});

		describe('WHEN the student is a member of the task course', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const course = courseEntityFactory.buildWithId({ students: [studentUser] });
				const task = taskFactory.isPublished().buildWithId({ course });

				await em.persist([task, course, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { loggedInClient, task, studentUser };
			};

			it('should create an unsubmitted submission for the student', async () => {
				const { loggedInClient, task, studentUser } = await setup();

				const response = await loggedInClient.post('', { taskId: task.id });
				const body = response.body as SubmissionStatusResponse;

				expect(response.status).toEqual(201);
				expect(body.isSubmitted).toBe(false);
				expect(body.submitters).toEqual([studentUser.id]);

				const persisted = await em.findOneOrFail(Submission, { id: body.id });
				expect(persisted.submitted).toBe(false);
			});

			it('should return the same submission when called twice', async () => {
				const { loggedInClient, task } = await setup();

				const first = await loggedInClient.post('', { taskId: task.id });
				const second = await loggedInClient.post('', { taskId: task.id });

				const firstBody = first.body as SubmissionStatusResponse;
				const secondBody = second.body as SubmissionStatusResponse;

				expect(secondBody.id).toEqual(firstBody.id);

				const count = await em.count(Submission, { task: task.id });
				expect(count).toEqual(1);
			});
		});

		describe('WHEN the student is not a member of the task course', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const course = courseEntityFactory.buildWithId();
				const task = taskFactory.isPublished().buildWithId({ course });

				await em.persist([task, course, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { loggedInClient, task };
			};

			it('should return 403 and create nothing', async () => {
				const { loggedInClient, task } = await setup();

				const { status } = await loggedInClient.post('', { taskId: task.id });

				expect(status).toEqual(403);
				expect(await em.count(Submission, { task: task.id })).toEqual(0);
			});
		});
	});

	describe('update submission', () => {
		let app: INestApplication;
		let em: EntityManager;
		let apiClient: TestApiClient;

		beforeAll(async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [ServerTestModule],
			}).compile();

			app = module.createNestApplication();
			await app.init();
			em = module.get(EntityManager);
			apiClient = new TestApiClient(app, '/submissions');
		});

		beforeEach(async () => {
			await cleanupCollections(em);
		});

		afterAll(async () => {
			await app.close();
		});

		describe('WHEN user is not authenticated', () => {
			it('should return 401', async () => {
				const { status } = await apiClient.patch(new ObjectId().toHexString(), { submitted: true });

				expect(status).toEqual(401);
			});
		});

		describe('WHEN the student owns the submission', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const course = courseEntityFactory.buildWithId({ students: [studentUser] });
				const task = taskFactory.isPublished().buildWithId({ course });
				const submission = submissionFactory.buildWithId({ task, student: studentUser });

				await em.persist([submission, task, course, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { loggedInClient, submission };
			};

			it('should hand the submission in', async () => {
				const { loggedInClient, submission } = await setup();

				const response = await loggedInClient.patch(submission.id, { submitted: true, comment: 'Fertig' });
				const body = response.body as SubmissionStatusResponse;

				expect(response.status).toEqual(200);
				expect(body.isSubmitted).toBe(true);

				const persisted = await em.findOneOrFail(Submission, { id: submission.id });
				expect(persisted.submitted).toBe(true);
				expect(persisted.comment).toEqual('Fertig');
			});

			// The global validation pipe runs with `enableImplicitConversion`, so a wrongly typed
			// `submitted` is coerced rather than rejected. What must hold is that fields outside
			// the params DTO never reach the entity — a student may hand in, but not grade.
			it('should ignore grading fields sent by the student', async () => {
				const { loggedInClient, submission } = await setup();

				const { status } = await loggedInClient.patch(submission.id, {
					submitted: true,
					grade: 100,
					graded: true,
					gradeComment: 'Sehr gut',
				});

				expect(status).toEqual(200);

				const persisted = await em.findOneOrFail(Submission, { id: submission.id });
				expect(persisted.submitted).toBe(true);
				expect(persisted.graded).toBe(false);
				expect(persisted.grade).toBeUndefined();
				expect(persisted.gradeComment).toBeUndefined();
			});
		});

		describe('WHEN the submission is already graded', () => {
			const setup = async () => {
				const { studentUser, studentAccount } = UserAndAccountTestFactory.buildStudent();
				const course = courseEntityFactory.buildWithId({ students: [studentUser] });
				const task = taskFactory.isPublished().buildWithId({ course });
				const submission = submissionFactory.submitted().graded().buildWithId({ task, student: studentUser });

				await em.persist([submission, task, course, studentUser, studentAccount]).flush();
				em.clear();

				const loggedInClient = await apiClient.login(studentAccount);

				return { loggedInClient, submission };
			};

			it('should refuse to withdraw it', async () => {
				const { loggedInClient, submission } = await setup();

				const { status } = await loggedInClient.patch(submission.id, { submitted: false });

				expect(status).toEqual(403);

				const persisted = await em.findOneOrFail(Submission, { id: submission.id });
				expect(persisted.submitted).toBe(true);
			});
		});
	});
	describe('collect submissions for a class', () => {
		let app: INestApplication;
		let em: EntityManager;
		let apiClient: TestApiClient;

		beforeAll(async () => {
			const module: TestingModule = await Test.createTestingModule({
				imports: [ServerTestModule],
			}).compile();

			app = module.createNestApplication();
			await app.init();
			em = module.get(EntityManager);
			apiClient = new TestApiClient(app, '/submissions');
		});

		beforeEach(async () => {
			await cleanupCollections(em);
		});

		afterAll(async () => {
			await app.close();
		});

		const setupClass = async () => {
			const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
			const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent();
			const other = UserAndAccountTestFactory.buildStudent();
			const course = courseEntityFactory.buildWithId({ teachers: [teacherUser], students: [studentUser] });
			const task = taskFactory.isPublished().buildWithId({ course });

			await em
				.persist([task, course, teacherUser, teacherAccount, studentUser, studentAccount, other.studentUser, other.studentAccount])
				.flush();
			em.clear();

			return { teacherAccount, studentAccount, studentUser, task, outsider: other.studentUser };
		};

		describe('WHEN a teacher opens the collect list', () => {
			it('should list every student of the course, including those without a submission', async () => {
				const { teacherAccount, studentUser, task } = await setupClass();
				const loggedInClient = await apiClient.login(teacherAccount);

				const response = await loggedInClient.get(`collect/task/${task.id}`);
				const body = response.body as { data: { studentId: string; isSubmitted: boolean; submissionId?: string }[] };

				expect(response.status).toEqual(200);
				expect(body.data).toHaveLength(1);
				expect(body.data[0].studentId).toEqual(studentUser.id);
				expect(body.data[0].isSubmitted).toBe(false);
				expect(body.data[0].submissionId).toBeUndefined();
			});

			it('should report the state once a submission exists', async () => {
                const { teacherAccount, studentUser, task } = await setupClass();
				const submission = submissionFactory.submitted().buildWithId({ task, student: studentUser });
				await em.persist(submission).flush();
				em.clear();
				const loggedInClient = await apiClient.login(teacherAccount);

				const response = await loggedInClient.get(`collect/task/${task.id}`);
				const body = response.body as { data: { isSubmitted: boolean; submissionId?: string }[] };

				expect(body.data[0].isSubmitted).toBe(true);
				expect(body.data[0].submissionId).toEqual(submission.id);
			});
		});

		describe('WHEN a student opens the collect list', () => {
			it('should return 403 — the class roster is not theirs to read', async () => {
				const { studentAccount, task } = await setupClass();
				const loggedInClient = await apiClient.login(studentAccount);

				const { status } = await loggedInClient.get(`collect/task/${task.id}`);

				expect(status).toEqual(403);
			});
		});

		describe('WHEN a teacher hands in for a student', () => {
			it('should create the submission for that student', async () => {
				const { teacherAccount, studentUser, task } = await setupClass();
				const loggedInClient = await apiClient.login(teacherAccount);

				const response = await loggedInClient.post('', { taskId: task.id, studentId: studentUser.id });
				const body = response.body as SubmissionStatusResponse;

				expect(response.status).toEqual(201);
				expect(body.submitters).toEqual([studentUser.id]);

				const persisted = await em.findOneOrFail(Submission, { id: body.id });
				expect(persisted.student?.id).toEqual(studentUser.id);
			});

			it('should refuse a student outside the course', async () => {
				const { teacherAccount, task, outsider } = await setupClass();
				const loggedInClient = await apiClient.login(teacherAccount);

				const { status } = await loggedInClient.post('', { taskId: task.id, studentId: outsider.id });

				expect(status).toEqual(403);
				expect(await em.count(Submission, { task: task.id })).toEqual(0);
			});
		});

		describe('WHEN a student tries to hand in for someone else', () => {
			it('should return 403', async () => {
				const { studentAccount, task, outsider } = await setupClass();
				const loggedInClient = await apiClient.login(studentAccount);

				const { status } = await loggedInClient.post('', { taskId: task.id, studentId: outsider.id });

				expect(status).toEqual(403);
			});
		});
	});
});
