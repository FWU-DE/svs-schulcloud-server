import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	HttpCode,
	NotFoundException,
	Param,
	Patch,
	Put,
	UnprocessableEntityException,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { ApiValidationError } from '@shared/common/error';
import { CardUc, ElementUc } from '../uc';
import {
	AnyContentElementResponse,
	ContentElementUrlParams,
	DrawingElementContentBody,
	DrawingElementResponse,
	ElementWithParentHierarchyResponse,
	ExternalToolElementContentBody,
	ExternalToolElementResponse,
	FileElementContentBody,
	FileElementResponse,
	FileFolderElementContentBody,
	FileFolderElementResponse,
	ChecklistElementContentBody,
	ChecklistElementResponse,
	ChecklistItemCheckedBodyParams,
	ChecklistItemUrlParams,
	CodeElementContentBody,
	CodeElementResponse,
	DeadlineElementContentBody,
	DeadlineElementResponse,
	FormulaElementContentBody,
	FormulaElementResponse,
	H5pElementContentBody,
	H5pElementResponse,
	PollElementContentBody,
	PollElementResponse,
	RecordingElementContentBody,
	RecordingElementResponse,
	PollVoteBodyParams,
	LinkElementContentBody,
	LinkElementResponse,
	MoveContentElementBody,
	RichTextElementContentBody,
	RichTextElementResponse,
	UpdateElementContentBodyParams,
	VideoConferenceElementContentBody,
	VideoConferenceElementResponse,
} from './dto';
import {
	ChecklistElementResponseMapper,
	ContentElementResponseFactory,
	ParentNodeInfoResponseMapper,
	PollElementResponseMapper,
} from './mapper';

@ApiTags('Board Element')
@JwtAuthentication()
@Controller('elements')
export class ElementController {
	constructor(
		private readonly cardUc: CardUc,
		private readonly elementUc: ElementUc
	) {}

	@ApiOperation({ summary: 'Get metadata for a single content element.' })
	@ApiResponse({ status: 200, type: ElementWithParentHierarchyResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@Get(':contentElementId')
	public async getElementWithParentHierarchy(
		@Param() urlParams: ContentElementUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<ElementWithParentHierarchyResponse> {
		const { element, parentHierarchy, viewContext } = await this.elementUc.getElementWithParentHierarchy(
			currentUser.userId,
			urlParams.contentElementId
		);

		const elementReponse = ContentElementResponseFactory.mapToResponse(element, viewContext);
		const parentHierarchyResponse = ParentNodeInfoResponseMapper.mapToResponse(parentHierarchy);

		const response = new ElementWithParentHierarchyResponse({
			element: elementReponse,
			parentHierarchy: parentHierarchyResponse,
		});

		return response;
	}

	@ApiOperation({ summary: 'Move a single content element.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Put(':contentElementId/position')
	public async moveElement(
		@Param() urlParams: ContentElementUrlParams,
		@Body() bodyParams: MoveContentElementBody,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.cardUc.moveElement(
			currentUser.userId,
			urlParams.contentElementId,
			bodyParams.toCardId,
			bodyParams.toPosition
		);
	}

	@ApiOperation({ summary: 'Update a single content element.' })
	@ApiExtraModels(
		FileElementContentBody,
		RichTextElementContentBody,
		ExternalToolElementContentBody,
		LinkElementContentBody,
		DrawingElementContentBody,
		VideoConferenceElementContentBody,
		FileFolderElementContentBody,
		H5pElementContentBody,
		PollElementContentBody,
		DeadlineElementContentBody,
		CodeElementContentBody,
		FormulaElementContentBody,
		ChecklistElementContentBody,
		RecordingElementContentBody
	)
	@ApiResponse({
		status: 200,
		schema: {
			oneOf: [
				{ $ref: getSchemaPath(ExternalToolElementResponse) },
				{ $ref: getSchemaPath(FileElementResponse) },
				{ $ref: getSchemaPath(LinkElementResponse) },
				{ $ref: getSchemaPath(RichTextElementResponse) },
				{ $ref: getSchemaPath(DrawingElementResponse) },
				{ $ref: getSchemaPath(VideoConferenceElementResponse) },
				{ $ref: getSchemaPath(FileFolderElementResponse) },
				{ $ref: getSchemaPath(H5pElementResponse) },
				{ $ref: getSchemaPath(PollElementResponse) },
				{ $ref: getSchemaPath(DeadlineElementResponse) },
				{ $ref: getSchemaPath(CodeElementResponse) },
				{ $ref: getSchemaPath(FormulaElementResponse) },
				{ $ref: getSchemaPath(ChecklistElementResponse) },
				{ $ref: getSchemaPath(RecordingElementResponse) },
			],
		},
	})
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(200)
	@Patch(':contentElementId/content')
	public async updateElement(
		@Param() urlParams: ContentElementUrlParams,
		@Body() bodyParams: UpdateElementContentBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<AnyContentElementResponse> {
		const element = await this.elementUc.updateElement(
			currentUser.userId,
			urlParams.contentElementId,
			bodyParams.data.content
		);
		// The update itself proved the user may edit this element, so they see the full picture.
		const response = ContentElementResponseFactory.mapToResponse(element, {
			userId: currentUser.userId,
			canEdit: true,
		});
		return response;
	}

	@ApiOperation({ summary: 'Cast, change or withdraw a vote in a poll element.' })
	@ApiResponse({ status: 200, type: PollElementResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@ApiResponse({ status: 422, type: UnprocessableEntityException })
	@HttpCode(200)
	@Put(':contentElementId/vote')
	public async voteInPoll(
		@Param() urlParams: ContentElementUrlParams,
		@Body() bodyParams: PollVoteBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<PollElementResponse> {
		const { element, viewContext } = await this.elementUc.voteInPoll(
			currentUser.userId,
			urlParams.contentElementId,
			bodyParams.optionIds
		);

		const response = PollElementResponseMapper.getInstance().mapToResponse(element, viewContext);

		return response;
	}

	@ApiOperation({ summary: 'Tick or untick an item of a checklist element.' })
	@ApiResponse({ status: 200, type: ChecklistElementResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@ApiResponse({ status: 422, type: UnprocessableEntityException })
	@HttpCode(200)
	@Put(':contentElementId/checklist/:itemId')
	public async setChecklistItemChecked(
		@Param() urlParams: ChecklistItemUrlParams,
		@Body() bodyParams: ChecklistItemCheckedBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<ChecklistElementResponse> {
		const { element, viewContext } = await this.elementUc.setChecklistItemChecked(
			currentUser.userId,
			urlParams.contentElementId,
			urlParams.itemId,
			bodyParams.checked
		);

		return ChecklistElementResponseMapper.getInstance().mapToResponse(element, viewContext);
	}

	@ApiOperation({ summary: 'Delete a single content element.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Delete(':contentElementId')
	public async deleteElement(
		@Param() urlParams: ContentElementUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.elementUc.deleteElement(currentUser.userId, urlParams.contentElementId);
	}

	@ApiOperation({ summary: 'Check if user has read permission for any board element.' })
	@ApiResponse({ status: 200 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@Get(':contentElementId/permission')
	public async readPermission(
		@Param() urlParams: ContentElementUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.elementUc.checkElementReadPermission(currentUser.userId, urlParams.contentElementId);
	}
}
