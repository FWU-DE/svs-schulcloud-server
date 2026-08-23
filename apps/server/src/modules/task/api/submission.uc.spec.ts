import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { AuthorizationContextBuilder, AuthorizationService } from '@modules/authorization';
import { CourseService } from '@modules/course';
import { CourseEntity, CourseGroupEntity } from '@modules/course/repo';
import { courseEntityFactory } from '@modules/course/testing';
import { LessonEntity, Material } from '@modules/lesson/repo';
import { User } from '@modules/user/repo';
import { userFactory } from '@modules/user/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Permission } from '@shared/domain/interface';
import { type Counted } from '@shared/domain/types';
import { setupEntities } from '@testing/database';
import { SubmissionService, TaskService } from '../domain';
import { Submission, Task } from '../repo';
import { submissionFactory, taskFactory } from '../testing';
import { SubmissionUc } from './submission.uc';

describe('Submission Uc', () => {
	let module: TestingModule;
	let submissionUc: SubmissionUc;
	let submissionService: DeepMocked<SubmissionService>;
	let taskService: DeepMocked<TaskService>;
	let courseService: DeepMocked<CourseService>;
	let authorizationService: DeepMocked<AuthorizationService>;

	beforeAll(async () => {
		await setupEntities([User, Task, Submission, CourseEntity, CourseGroupEntity, LessonEntity, Material]);

		module = await Test.createTestingModule({
			imports: [],
			providers: [
				SubmissionUc,
				{
					provide: SubmissionService,
					useValue: createMock<SubmissionService>(),
				},
				{
					provide: TaskService,
					useValue: createMock<TaskService>(),
				},
				{
					provide: CourseService,
					useValue: createMock<CourseService>(),
				},
				{
					provide: AuthorizationService,
					useValue: createMock<AuthorizationService>(),
				},
			],
		}).compile();

		submissionUc = module.get(SubmissionUc);
		submissionService = module.get(SubmissionService);
		taskService = module.get(TaskService);
		courseService = module.get(CourseService);
		authorizationService = module.get(AuthorizationService);
	});

	afterAll(async () => {
		await module.close();
	});

	beforeEach(() => {
		jest.resetAllMocks();
	});

	it('should be defined', () => {
		expect(submissionUc).toBeDefined();
	});

	describe('findAllByTask is called', () => {
		const createParams = () => {
			const user = userFactory.buildWithId();
			const task = taskFactory.buildWithId();

			const submission1 = submissionFactory.buildWithId();
			const submission2 = submissionFactory.buildWithId();
			const submissions = [submission1, submission2];
			const countedSubmissions: Counted<Submission[]> = [submissions, 2];

			return { user, task, submissions, countedSubmissions };
		};

		describe('WHEN service returns successfully and user is authorized for all submissions', () => {
			const setup = () => {
				const { user, task, submissions, countedSubmissions } = createParams();

				submissionService.findAllByTask.mockResolvedValueOnce(countedSubmissions);
				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				authorizationService.hasPermission.mockReturnValue(true).mockReturnValue(true);

				return { taskId: task.id, user, submissions, countedSubmissions };
			};

			it('should call findAllByTask', async () => {
				const { user, taskId } = setup();

				await submissionUc.findAllByTask(user.id, taskId);

				expect(submissionService.findAllByTask).toHaveBeenCalledWith(taskId);
			});

			it('should call getUserWithPermissions', async () => {
				const { user, taskId } = setup();

				await submissionUc.findAllByTask(user.id, taskId);

				expect(authorizationService.getUserWithPermissions).toHaveBeenCalledWith(user.id);
			});

			it('should call hasPermission', async () => {
				const { user, taskId, submissions } = setup();
				const permissionContext = AuthorizationContextBuilder.read([Permission.SUBMISSIONS_VIEW]);

				await submissionUc.findAllByTask(user.id, taskId);

				expect(authorizationService.hasPermission).toHaveBeenNthCalledWith(1, user, submissions[0], permissionContext);
				expect(authorizationService.hasPermission).toHaveBeenNthCalledWith(2, user, submissions[1], permissionContext);
			});

			it('should return submissions', async () => {
				const { user, taskId, submissions } = setup();

				const result = await submissionUc.findAllByTask(user.id, taskId);

				expect(result).toEqual(submissions);
			});
		});

		describe('WHEN service returns successfully and user is authorized for second submission only', () => {
			const setup = () => {
				const { user, task, submissions, countedSubmissions } = createParams();

				submissionService.findAllByTask.mockResolvedValueOnce(countedSubmissions);
				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				authorizationService.hasPermission.mockReturnValueOnce(false).mockReturnValueOnce(true);

				return { taskId: task.id, user, submissions };
			};

			it('should return only submission2', async () => {
				const { user, taskId, submissions } = setup();
				const expectedResult = [submissions[1]];

				const result = await submissionUc.findAllByTask(user.id, taskId);

				expect(result).toEqual(expectedResult);
			});
		});

		describe('WHEN submission service throws error', () => {
			const setup = () => {
				const { user, task } = createParams();
				const error = new Error();

				submissionService.findAllByTask.mockRejectedValueOnce(error);

				return { taskId: task.id, user, error };
			};

			it('should pass error', async () => {
				const { user, taskId, error } = setup();

				await expect(submissionUc.findAllByTask(user.id, taskId)).rejects.toThrow(error);
			});
		});

		describe('WHEN getUserWithPermissions throws error', () => {
			const setup = () => {
				const { user, task, countedSubmissions } = createParams();
				const error = new Error();

				submissionService.findAllByTask.mockResolvedValueOnce(countedSubmissions);
				authorizationService.getUserWithPermissions.mockRejectedValueOnce(error);

				return { taskId: task.id, user, error };
			};

			it('should pass error', async () => {
				const { user, taskId, error } = setup();

				await expect(submissionUc.findAllByTask(user.id, taskId)).rejects.toThrow(error);
			});
		});
	});

	describe('delete is called', () => {
		describe('WHEN user has permission and service deletes succesfully', () => {
			const setup = () => {
				const submission = submissionFactory.buildWithId();
				const user = userFactory.buildWithId();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation();
				submissionService.delete.mockResolvedValueOnce();

				return { submission, user };
			};

			it('should return true', async () => {
				const { submission, user } = setup();

				const result = await submissionUc.delete(user.id, submission.id);

				expect(submissionService.findById).toHaveBeenCalledWith(submission.id);
				expect(authorizationService.getUserWithPermissions).toHaveBeenCalledWith(user.id);
				expect(authorizationService.checkPermission).toHaveBeenCalledWith(
					user,
					submission,
					AuthorizationContextBuilder.write([Permission.SUBMISSIONS_EDIT])
				);
				expect(submissionService.delete).toHaveBeenCalledWith(submission);
				expect(result).toBe(true);
			});
		});

		describe('WHEN user can not be found', () => {
			const setup = () => {
				const submission = submissionFactory.buildWithId();
				const user = userFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockRejectedValueOnce(error);

				return { submission, user, error };
			};

			it('should pass error', async () => {
				const { submission, user, error } = setup();

				await expect(submissionUc.delete(user.id, submission.id)).rejects.toThrow(error);
			});
		});

		describe('WHEN submission can not be found', () => {
			const setup = () => {
				const submission = submissionFactory.buildWithId();
				const user = userFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockRejectedValueOnce(error);

				return { submission, user, error };
			};

			it('should pass error', async () => {
				const { submission, user, error } = setup();

				await expect(submissionUc.delete(user.id, submission.id)).rejects.toThrow(error);
			});
		});

		describe('WHEN user has no permission', () => {
			const setup = () => {
				const submission = submissionFactory.buildWithId();
				const user = userFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation(() => {
					throw error;
				});

				return { submission, user, error };
			};

			it('should pass error', async () => {
				const { submission, user, error } = setup();

				await expect(submissionUc.delete(user.id, submission.id)).rejects.toThrow(error);
			});
		});

		describe('WHEN service returns error', () => {
			const setup = () => {
				const submission = submissionFactory.buildWithId();
				const user = userFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation();
				submissionService.delete.mockRejectedValueOnce(error);

				return { submission, user, error };
			};

			it('should pass error', async () => {
				const { submission, user, error } = setup();

				await expect(submissionUc.delete(user.id, submission.id)).rejects.toThrow(error);
			});
		});
	});
	describe('create is called', () => {
		describe('WHEN the user has no submission for the task yet', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const task = taskFactory.buildWithId();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				taskService.findById.mockResolvedValueOnce(task);
				submissionService.findByTaskAndUser.mockResolvedValueOnce(null);
				authorizationService.checkPermission.mockImplementation();
				submissionService.save.mockImplementation((submission) => Promise.resolve(submission));

				return { user, task };
			};

			it('should create the submission for the current user and save it', async () => {
				const { user, task } = setup();

				const result = await submissionUc.create(user.id, task.id);

				expect(result.task).toBe(task);
				expect(result.student).toBe(user);
				expect(result.school).toBe(user.school);
				expect(result.submitted).toBe(false);
				expect(submissionService.save).toHaveBeenCalledWith(result);
			});

			it('should check read permission on the task and write permission on the new submission', async () => {
				const { user, task } = setup();

				const result = await submissionUc.create(user.id, task.id);

				expect(authorizationService.checkPermission).toHaveBeenCalledWith(
					user,
					task,
					AuthorizationContextBuilder.read([Permission.SUBMISSIONS_CREATE])
				);
				expect(authorizationService.checkPermission).toHaveBeenCalledWith(
					user,
					result,
					AuthorizationContextBuilder.write([Permission.SUBMISSIONS_CREATE])
				);
			});
		});

		describe('WHEN the user already has a submission for the task', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const task = taskFactory.buildWithId();
				const submission = submissionFactory.buildWithId();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				taskService.findById.mockResolvedValueOnce(task);
				submissionService.findByTaskAndUser.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation();

				return { user, task, submission };
			};

			it('should return the existing submission without creating a second one', async () => {
				const { user, task, submission } = setup();

				const result = await submissionUc.create(user.id, task.id);

				expect(result).toBe(submission);
				expect(submissionService.save).not.toHaveBeenCalled();
				expect(authorizationService.checkPermission).toHaveBeenCalledWith(
					user,
					submission,
					AuthorizationContextBuilder.read([Permission.SUBMISSIONS_VIEW])
				);
			});
		});

		describe('WHEN the user may not submit to the task', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const task = taskFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				taskService.findById.mockResolvedValueOnce(task);
				submissionService.findByTaskAndUser.mockResolvedValueOnce(null);
				authorizationService.checkPermission.mockImplementation(() => {
					throw error;
				});

				return { user, task, error };
			};

			it('should pass error and save nothing', async () => {
				const { user, task, error } = setup();

				await expect(submissionUc.create(user.id, task.id)).rejects.toThrow(error);
				expect(submissionService.save).not.toHaveBeenCalled();
			});
		});

		describe('WHEN the task can not be found', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const task = taskFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				taskService.findById.mockRejectedValueOnce(error);

				return { user, task, error };
			};

			it('should pass error', async () => {
				const { user, task, error } = setup();

				await expect(submissionUc.create(user.id, task.id)).rejects.toThrow(error);
			});
		});
	});

	describe('update is called', () => {
		describe('WHEN the user hands in their submission', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const submission = submissionFactory.buildWithId();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation();
				submissionService.save.mockImplementation((updated) => Promise.resolve(updated));

				return { user, submission };
			};

			it('should apply submitted and comment and save', async () => {
				const { user, submission } = setup();

				const result = await submissionUc.update(user.id, submission.id, {
					submitted: true,
					comment: 'Fertig bearbeitet',
				});

				expect(result.submitted).toBe(true);
				expect(result.comment).toBe('Fertig bearbeitet');
				expect(authorizationService.checkPermission).toHaveBeenCalledWith(
					user,
					submission,
					AuthorizationContextBuilder.write([Permission.SUBMISSIONS_EDIT])
				);
				expect(submissionService.save).toHaveBeenCalledWith(submission);
			});

			it('should leave fields the params do not mention untouched', async () => {
				const { user, submission } = setup();
				const previousComment = submission.comment;

				const result = await submissionUc.update(user.id, submission.id, { submitted: true });

				expect(result.comment).toBe(previousComment);
			});
		});

		describe('WHEN the submission is already graded', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const submission = submissionFactory.submitted().graded().buildWithId();

				authorizationService.getUserWithPermissions.mockResolvedValue(user);
				submissionService.findById.mockResolvedValue(submission);
				authorizationService.checkPermission.mockImplementation();
				submissionService.save.mockImplementation((updated) => Promise.resolve(updated));

				return { user, submission };
			};

			it('should refuse to withdraw it and save nothing', async () => {
				const { user, submission } = setup();

				await expect(submissionUc.update(user.id, submission.id, { submitted: false })).rejects.toThrow(
					ForbiddenException
				);
				expect(submissionService.save).not.toHaveBeenCalled();
			});

			it('should still allow editing the comment', async () => {
				const { user, submission } = setup();

				const result = await submissionUc.update(user.id, submission.id, { comment: 'Nachtrag' });

				expect(result.comment).toBe('Nachtrag');
				expect(submissionService.save).toHaveBeenCalledWith(submission);
			});
		});

		describe('WHEN user has no permission', () => {
			const setup = () => {
				const user = userFactory.buildWithId();
				const submission = submissionFactory.buildWithId();
				const error = new Error();

				authorizationService.getUserWithPermissions.mockResolvedValueOnce(user);
				submissionService.findById.mockResolvedValueOnce(submission);
				authorizationService.checkPermission.mockImplementation(() => {
					throw error;
				});

				return { user, submission, error };
			};

			it('should pass error and save nothing', async () => {
				const { user, submission, error } = setup();

				await expect(submissionUc.update(user.id, submission.id, { submitted: true })).rejects.toThrow(error);
				expect(submissionService.save).not.toHaveBeenCalled();
			});
		});
	});
	describe('create on behalf of a student', () => {
		const setup = () => {
			const teacher = userFactory.buildWithId();
			const student = userFactory.buildWithId();
			const course = courseEntityFactory.buildWithId({ teachers: [teacher], students: [student] });
			const task = taskFactory.buildWithId({ course });

			authorizationService.getUserWithPermissions.mockResolvedValueOnce(teacher);
			taskService.findById.mockResolvedValueOnce(task);
			courseService.findById.mockResolvedValue(course);
			submissionService.findByTaskAndUser.mockResolvedValueOnce(null);
			authorizationService.checkPermission.mockImplementation();
			submissionService.save.mockImplementation((submission) => Promise.resolve(submission));

			return { teacher, student, course, task };
		};

		it('should create the submission for the student, not the teacher', async () => {
			const { teacher, student, task } = setup();

			const result = await submissionUc.create(teacher.id, task.id, student.id);

			expect(result.student).toBe(student);
			expect(result.school).toBe(student.school);
			expect(submissionService.findByTaskAndUser).toHaveBeenCalledWith(task.id, student.id);
		});

		it('should authorise against the task with write access', async () => {
			const { teacher, student, task } = setup();

			await submissionUc.create(teacher.id, task.id, student.id);

			expect(authorizationService.checkPermission).toHaveBeenCalledWith(
				teacher,
				task,
				AuthorizationContextBuilder.write([Permission.SUBMISSIONS_CREATE])
			);
			// Never the student-facing read check — that one is for handing in your own work.
			expect(authorizationService.checkPermission).not.toHaveBeenCalledWith(
				teacher,
				task,
				AuthorizationContextBuilder.read([Permission.SUBMISSIONS_CREATE])
			);
		});

		it('should reuse an existing submission of that student', async () => {
			const { teacher, student, task } = setup();
			const existing = submissionFactory.buildWithId();
			submissionService.findByTaskAndUser.mockReset();
			submissionService.findByTaskAndUser.mockResolvedValueOnce(existing);

			const result = await submissionUc.create(teacher.id, task.id, student.id);

			expect(result).toBe(existing);
			expect(submissionService.save).not.toHaveBeenCalled();
		});

		it('should refuse a student who does not take part in the course', async () => {
			const { teacher, task } = setup();
			const outsider = userFactory.buildWithId();

			await expect(submissionUc.create(teacher.id, task.id, outsider.id)).rejects.toThrow(ForbiddenException);
			expect(submissionService.save).not.toHaveBeenCalled();
		});

		it('should treat a studentId equal to the caller as handing in your own work', async () => {
			const { teacher, task } = setup();

			await submissionUc.create(teacher.id, task.id, teacher.id);

			expect(submissionService.findByTaskAndUser).toHaveBeenCalledWith(task.id, teacher.id);
			expect(authorizationService.checkPermission).toHaveBeenCalledWith(
				teacher,
				task,
				AuthorizationContextBuilder.read([Permission.SUBMISSIONS_CREATE])
			);
		});
	});

	describe('findCollectStatusesByTask is called', () => {
		it('should return every student of the course together with the submissions', async () => {
			const teacher = userFactory.buildWithId();
			const [first, second] = userFactory.buildListWithId(2);
			const course = courseEntityFactory.buildWithId({ teachers: [teacher], students: [first, second] });
			const task = taskFactory.buildWithId({ course });
			const submission = submissionFactory.buildWithId({ task, student: first });

			authorizationService.getUserWithPermissions.mockResolvedValueOnce(teacher);
			taskService.findById.mockResolvedValueOnce(task);
			courseService.findById.mockResolvedValue(course);
			submissionService.findAllByTask.mockResolvedValueOnce([[submission], 1]);
			authorizationService.checkPermission.mockImplementation();

			const [students, submissions] = await submissionUc.findCollectStatusesByTask(teacher.id, task.id);

			expect(students.map((entry) => entry.id)).toEqual([first.id, second.id]);
			expect(submissions).toEqual([submission]);
			expect(authorizationService.checkPermission).toHaveBeenCalledWith(
				teacher,
				task,
				AuthorizationContextBuilder.write([Permission.SUBMISSIONS_VIEW])
			);
		});

		it('should reject a task without a course', async () => {
			const teacher = userFactory.buildWithId();
			const task = taskFactory.buildWithId();

			authorizationService.getUserWithPermissions.mockResolvedValueOnce(teacher);
			taskService.findById.mockResolvedValueOnce(task);
			authorizationService.checkPermission.mockImplementation();

			await expect(submissionUc.findCollectStatusesByTask(teacher.id, task.id)).rejects.toThrow(
				BadRequestException
			);
		});
	});
});
