import { AuthorizationContextBuilder, AuthorizationService } from '@modules/authorization';
import { User } from '@modules/user/repo';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission } from '@shared/domain/interface';
import { EntityId } from '@shared/domain/types';
import { SubmissionService, TaskService } from '../domain';
import { Submission } from '../repo';
import { SubmissionUpdateParams } from './dto';

@Injectable()
export class SubmissionUc {
	constructor(
		private readonly submissionService: SubmissionService,
		private readonly taskService: TaskService,
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
	public async create(userId: EntityId, taskId: EntityId): Promise<Submission> {
		const [user, task] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.taskService.findById(taskId),
		]);

		const existingSubmission = await this.submissionService.findByTaskAndUser(taskId, userId);
		if (existingSubmission) {
			this.authorizationService.checkPermission(
				user,
				existingSubmission,
				AuthorizationContextBuilder.read([Permission.SUBMISSIONS_VIEW])
			);

			return existingSubmission;
		}

		this.authorizationService.checkPermission(
			user,
			task,
			AuthorizationContextBuilder.read([Permission.SUBMISSIONS_CREATE])
		);

		const submission = new Submission({ school: user.school, task, student: user, comment: '' });

		// Checked against the unsaved entity so the submission rule can apply its own conditions:
		// the user has to be a submitter, and the due date must not have passed.
		this.authorizationService.checkPermission(
			user,
			submission,
			AuthorizationContextBuilder.write([Permission.SUBMISSIONS_CREATE])
		);

		const savedSubmission = await this.submissionService.save(submission);

		return savedSubmission;
	}

	public async update(
		userId: EntityId,
		submissionId: EntityId,
		params: SubmissionUpdateParams
	): Promise<Submission> {
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
