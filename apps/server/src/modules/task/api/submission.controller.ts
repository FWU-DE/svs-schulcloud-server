import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
	SubmissionCreateParams,
	SubmissionStatusListResponse,
	SubmissionStatusResponse,
	SubmissionUpdateParams,
	SubmissionUrlParams,
	TaskUrlParams,
} from './dto';
import { SubmissionMapper } from './mapper';
import { SubmissionUc } from './submission.uc';

@ApiTags('Submission')
@JwtAuthentication()
@Controller('submissions')
export class SubmissionController {
	constructor(private readonly submissionUc: SubmissionUc) {}

	@Get('status/task/:taskId')
	public async findStatusesByTask(
		@CurrentUser() currentUser: ICurrentUser,
		@Param() params: TaskUrlParams
	): Promise<SubmissionStatusListResponse> {
		const submissions = await this.submissionUc.findAllByTask(currentUser.userId, params.taskId);

		const submissionResponses = submissions.map((submission) => SubmissionMapper.mapToStatusResponse(submission));

		const listResponse = new SubmissionStatusListResponse(submissionResponses);

		return listResponse;
	}

	@Post()
	public async create(
		@CurrentUser() currentUser: ICurrentUser,
		@Body() params: SubmissionCreateParams
	): Promise<SubmissionStatusResponse> {
		const submission = await this.submissionUc.create(currentUser.userId, params.taskId);

		return SubmissionMapper.mapToStatusResponse(submission);
	}

	@Patch(':submissionId')
	public async update(
		@CurrentUser() currentUser: ICurrentUser,
		@Param() urlParams: SubmissionUrlParams,
		@Body() params: SubmissionUpdateParams
	): Promise<SubmissionStatusResponse> {
		const submission = await this.submissionUc.update(currentUser.userId, urlParams.submissionId, params);

		return SubmissionMapper.mapToStatusResponse(submission);
	}

	@Delete(':submissionId')
	public async delete(
		@Param() urlParams: SubmissionUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<boolean> {
		const result = await this.submissionUc.delete(currentUser.userId, urlParams.submissionId);

		return result;
	}
}
