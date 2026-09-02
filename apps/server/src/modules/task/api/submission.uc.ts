import { AuthorizationContextBuilder, AuthorizationService } from '@modules/authorization';
import { CourseService } from '@modules/course';
import { CourseEntity, UsersList } from '@modules/course/repo';
import { User } from '@modules/user/repo';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Permission } from '@shared/domain/interface';
import { EntityId } from '@shared/domain/types';
import { SubmissionService, TaskService } from '../domain';
import { Submission, Task } from '../repo';
import { SubmissionUpdateParams } from './dto';

@Injectable()
export class SubmissionUc {
	constructor(
		private readonly submissionService: SubmissionService,
		private readonly taskService: TaskService,
		private readonly courseService: CourseService,
		private readonly authorizationService: AuthorizationService
	) {}

	public async findAllByTask(userId: EntityId, taskId: EntityId): Promise<Submission[]> {
		const [submissions] = await this.submissionService.findAllByTask(taskId);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		const permittedSubmissions = this.filterSubmissionsByPermission(submissions, user);

		return permittedSubmissions;
	}

	/**
	 * Opens the user's own submission for a task, creating it on first use. Files are attached
	 * afterwards through the files-storage API with parent type `submissions` and this id, so a
	 * submission has to exist before anything can be uploaded to it.
	 *
	 * Idempotent on purpose: opening the same task twice must return the same submission rather
	 * than leaving a second, empty one behind.
	 */
	public async create(userId: EntityId, taskId: EntityId, studentId?: EntityId): Promise<Submission> {
		const [user, task] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.taskService.findById(taskId),
		]);

		// Collecting for someone else is a teacher's action on the task, so it is authorised
		// against the task rather than against the caller's own submission.
		const collectingFor = studentId && studentId !== userId ? studentId : undefined;
		if (collectingFor) {
			this.authorizationService.checkPermission(
				user,
				task,
				AuthorizationContextBuilder.write([Permission.SUBMISSIONS_CREATE])
			);
		}

		const owner = collectingFor ?? userId;
		const existingSubmission = await this.submissionService.findByTaskAndUser(taskId, owner);
		if (existingSubmission) {
			this.authorizationService.checkPermission(
				user,
				existingSubmission,
				AuthorizationContextBuilder.read([Permission.SUBMISSIONS_VIEW])
			);

			return existingSubmission;
		}

		if (!collectingFor) {
			this.authorizationService.checkPermission(
				user,
				task,
				AuthorizationContextBuilder.read([Permission.SUBMISSIONS_CREATE])
			);
		}

		const student = collectingFor ? await this.findCourseStudent(task, collectingFor) : user;
		const submission = new Submission({ school: student.school, task, student, comment: '' });

		// Checked against the unsaved entity so the submission rule can apply its own conditions.
		// For the student's own submission that means being a submitter with the due date still
		// open; for a teacher it resolves through write access to the parent task, which
		// deliberately has no deadline — collecting late is the point.
		this.authorizationService.checkPermission(
			user,
			submission,
			AuthorizationContextBuilder.write([Permission.SUBMISSIONS_CREATE])
		);

		const savedSubmission = await this.submissionService.save(submission);

		return savedSubmission;
	}

	/**
	 * The students of a task's course together with their submission state — the list a teacher
	 * works through when the class shares one device.
	 */
	public async findCollectStatusesByTask(userId: EntityId, taskId: EntityId): Promise<[UsersList[], Submission[]]> {
		const [user, task] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.taskService.findById(taskId),
		]);

		this.authorizationService.checkPermission(
			user,
			task,
			AuthorizationContextBuilder.write([Permission.SUBMISSIONS_VIEW])
		);

		const course = await this.resolveCourse(task);
		const [submissions] = await this.submissionService.findAllByTask(taskId);

		return [course.getStudentsList(), submissions];
	}

	private async findCourseStudent(task: Task, studentId: EntityId): Promise<User> {
		const course = await this.resolveCourse(task);
		const student = course.students.getItems().find((candidate) => candidate.id === studentId);

		if (!student) {
			// Not a 404: the caller may read the task, so saying "not a participant" leaks nothing
			// they could not already see, and it is the only actionable message.
			throw new ForbiddenException("The given student does not take part in this task's course.");
		}

		return student;
	}

	private async resolveCourse(task: Task): Promise<CourseEntity> {
		const courseId = task.course?.id ?? task.lesson?.course?.id;
		if (!courseId) {
			throw new BadRequestException('This task has no course, so it has no class to collect from.');
		}

		// Reloaded through the course service because the task repo populates the course itself
		// but not its student collection.
		const course = await this.courseService.findById(courseId);

		return course;
	}

	public async update(userId: EntityId, submissionId: EntityId, params: SubmissionUpdateParams): Promise<Submission> {
		const [user, submission] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.submissionService.findById(submissionId),
		]);

		this.authorizationService.checkPermission(
			user,
			submission,
			AuthorizationContextBuilder.write([Permission.SUBMISSIONS_EDIT])
		);

		const changesSubmittedState = params.submitted !== undefined && params.submitted !== submission.submitted;
		if (submission.isGraded() && changesSubmittedState) {
			throw new ForbiddenException('A graded submission can neither be handed in nor withdrawn again.');
		}

		if (params.comment !== undefined) {
			submission.comment = params.comment;
		}
		if (params.submitted !== undefined) {
			submission.submitted = params.submitted;
		}

		const savedSubmission = await this.submissionService.save(submission);

		return savedSubmission;
	}

	public async delete(userId: EntityId, submissionId: EntityId): Promise<boolean> {
		const [user, submission] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.submissionService.findById(submissionId),
		]);

		this.authorizationService.checkPermission(
			user,
			submission,
			AuthorizationContextBuilder.write([Permission.SUBMISSIONS_EDIT])
		);

		await this.submissionService.delete(submission);

		return true;
	}

	private filterSubmissionsByPermission(submissions: Submission[], user: User): Submission[] {
		const permissionContext = AuthorizationContextBuilder.read([Permission.SUBMISSIONS_VIEW]);

		const permittedSubmissions = submissions.filter((submission) => {
			const hasPermission = this.authorizationService.hasPermission(user, submission, permissionContext);

			return hasPermission;
		});

		return permittedSubmissions;
	}
}
