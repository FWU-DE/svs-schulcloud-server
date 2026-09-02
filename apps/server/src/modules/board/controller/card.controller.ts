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
	Post,
	Put,
	Query,
	UnprocessableEntityException,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { RequestTimeout } from '@shared/common/decorators';
import { ApiValidationError } from '@shared/common/error';
import { BOARD_INCOMING_REQUEST_TIMEOUT_COPY_API_KEY } from '../timeout.config';
import { CardUc, ColumnUc } from '../uc';
import {
	AnyContentElementResponse,
	CardCommentBodyParams,
	CardCommentReportBodyParams,
	CardCommentResponse,
	CardCommentUrlParams,
	CardIdsParams,
	CardListResponse,
	CardReactionBodyParams,
	CardSettingsBodyParams,
	CardResponse,
	CardUrlParams,
	ColorBodyParams,
	CreateContentElementBodyParams,
	DeletedElementResponse,
	DrawingElementResponse,
	ExternalToolElementResponse,
	FileElementResponse,
	FileFolderElementResponse,
	H5pElementResponse,
	LinkElementResponse,
	MoveCardBodyParams,
	RenameBodyParams,
	RichTextElementResponse,
	VideoConferenceElementResponse,
} from './dto';
import { MoveCardResponse } from './dto/board/move-card.response';
import { SetHeightBodyParams } from './dto/board/set-height.body.params';
import { CardCommentResponseMapper, CardResponseMapper, ContentElementResponseFactory } from './mapper';
import { MoveCardResponseMapper } from './mapper/move-card-response.mapper';

@ApiTags('Board Card')
@JwtAuthentication()
@Controller('cards')
export class CardController {
	constructor(
		private readonly columnUc: ColumnUc,
		private readonly cardUc: CardUc
	) {}

	@ApiOperation({ summary: 'Get a list of cards by their ids.' })
	@ApiResponse({ status: 200, type: CardListResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@Get()
	public async getCards(
		@CurrentUser() currentUser: ICurrentUser,
		@Query() cardIdParams: CardIdsParams
	): Promise<CardListResponse> {
		const cardIds = Array.isArray(cardIdParams.ids) ? cardIdParams.ids : [cardIdParams.ids];
		const cards = await this.cardUc.findCards(currentUser.userId, cardIds);
		const cardResponses = cards.map(({ card, viewContext }) => CardResponseMapper.mapToResponse(card, viewContext));

		const result = new CardListResponse({
			data: cardResponses,
		});
		return result;
	}

	@ApiOperation({ summary: "Override the board's comment and editing settings for a single card." })
	@ApiResponse({ status: 200, type: CardResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(200)
	@Patch(':cardId/settings')
	public async updateCardSettings(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: CardSettingsBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardResponse> {
		const { card, viewContext } = await this.cardUc.updateCardSettings(currentUser.userId, urlParams.cardId, {
			commentsEnabled: bodyParams.commentsEnabled,
			readersCanEdit: bodyParams.readersCanEdit,
			reactionType: bodyParams.reactionType,
		});

		return CardResponseMapper.mapToResponse(card, viewContext);
	}

	@ApiOperation({ summary: 'React to a card, change or withdraw the reaction.' })
	@ApiResponse({ status: 200, type: CardResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@ApiResponse({ status: 422, type: UnprocessableEntityException })
	@HttpCode(200)
	@Put(':cardId/reaction')
	public async reactToCard(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: CardReactionBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardResponse> {
		const { card, viewContext } = await this.cardUc.reactToCard(currentUser.userId, urlParams.cardId, bodyParams.value);

		return CardResponseMapper.mapToResponse(card, viewContext);
	}

	@ApiOperation({ summary: 'Write a comment on a card.' })
	@ApiResponse({ status: 201, type: CardCommentResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@ApiResponse({ status: 422, type: UnprocessableEntityException })
	@Post(':cardId/comments')
	public async addComment(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: CardCommentBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardCommentResponse> {
		const { comment, viewContext } = await this.cardUc.addComment(
			currentUser.userId,
			urlParams.cardId,
			bodyParams.text
		);

		return CardCommentResponseMapper.mapToResponse(comment, viewContext);
	}

	@ApiOperation({ summary: 'Edit an own comment on a card.' })
	@ApiResponse({ status: 200, type: CardCommentResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(200)
	@Patch(':cardId/comments/:commentId')
	public async editComment(
		@Param() urlParams: CardCommentUrlParams,
		@Body() bodyParams: CardCommentBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardCommentResponse> {
		const { comment, viewContext } = await this.cardUc.editComment(
			currentUser.userId,
			urlParams.cardId,
			urlParams.commentId,
			bodyParams.text
		);

		return CardCommentResponseMapper.mapToResponse(comment, viewContext);
	}

	@ApiOperation({ summary: 'Remove a comment: an own one, or any as a moderator.' })
	@ApiResponse({ status: 200, type: CardCommentResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(200)
	@Delete(':cardId/comments/:commentId')
	public async removeComment(
		@Param() urlParams: CardCommentUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardCommentResponse> {
		const { comment, viewContext } = await this.cardUc.removeComment(
			currentUser.userId,
			urlParams.cardId,
			urlParams.commentId
		);

		return CardCommentResponseMapper.mapToResponse(comment, viewContext);
	}

	@ApiOperation({ summary: 'Report a comment to the people who may moderate this board.' })
	@ApiResponse({ status: 200, type: CardCommentResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@ApiResponse({ status: 422, type: UnprocessableEntityException })
	@HttpCode(200)
	@Post(':cardId/comments/:commentId/report')
	public async reportComment(
		@Param() urlParams: CardCommentUrlParams,
		@Body() bodyParams: CardCommentReportBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardCommentResponse> {
		const { comment, viewContext } = await this.cardUc.reportComment(
			currentUser.userId,
			urlParams.cardId,
			urlParams.commentId,
			bodyParams.reason
		);

		return CardCommentResponseMapper.mapToResponse(comment, viewContext);
	}

	@ApiOperation({ summary: 'Move a single card.' })
	@ApiResponse({ status: 204, type: MoveCardResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@Put(':cardId/position')
	public async moveCard(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: MoveCardBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<MoveCardResponse> {
		const data = await this.columnUc.moveCard(
			currentUser.userId,
			urlParams.cardId,
			bodyParams.toColumnId,
			bodyParams.toPosition
		);
		const result = MoveCardResponseMapper.mapToReponse(data);

		return result;
	}

	@ApiOperation({ summary: 'Update the height of a single card.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Patch(':cardId/height')
	public async updateCardHeight(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: SetHeightBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.cardUc.updateCardHeight(currentUser.userId, urlParams.cardId, bodyParams.height);
	}

	@ApiOperation({ summary: 'Update the title of a single card.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Patch(':cardId/title')
	public async updateCardTitle(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: RenameBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.cardUc.updateCardTitle(currentUser.userId, urlParams.cardId, bodyParams.title);
	}

	@ApiOperation({ summary: 'Update the color of a single card.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Patch(':cardId/color')
	public async updateCardColor(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: ColorBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<void> {
		await this.cardUc.updateCardColor(currentUser.userId, urlParams.cardId, bodyParams.backgroundColor);
	}

	@ApiOperation({ summary: 'Delete a single card.' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@HttpCode(204)
	@Delete(':cardId')
	public async deleteCard(@Param() urlParams: CardUrlParams, @CurrentUser() currentUser: ICurrentUser): Promise<void> {
		await this.cardUc.deleteCard(currentUser.userId, urlParams.cardId);
	}

	@ApiOperation({ summary: 'Copy a single card.' })
	@ApiResponse({ status: 201, type: CardResponse })
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@Post(':cardId/copy')
	@RequestTimeout(BOARD_INCOMING_REQUEST_TIMEOUT_COPY_API_KEY)
	public async copyCard(
		@Param() urlParams: CardUrlParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<CardResponse> {
		const copiedCard = await this.columnUc.copyCard(currentUser.userId, urlParams.cardId, currentUser.schoolId);
		const cardDto = CardResponseMapper.mapToResponse(copiedCard.copyEntity);
		return cardDto;
	}

	@ApiOperation({ summary: 'Create a new element on a card.' })
	@ApiExtraModels(
		ExternalToolElementResponse,
		FileElementResponse,
		FileFolderElementResponse,
		LinkElementResponse,
		RichTextElementResponse,
		DrawingElementResponse,
		DeletedElementResponse,
		VideoConferenceElementResponse,
		H5pElementResponse
	)
	@ApiResponse({
		status: 201,
		schema: {
			oneOf: [
				{ $ref: getSchemaPath(ExternalToolElementResponse) },
				{ $ref: getSchemaPath(FileElementResponse) },
				{ $ref: getSchemaPath(FileFolderElementResponse) },
				{ $ref: getSchemaPath(LinkElementResponse) },
				{ $ref: getSchemaPath(RichTextElementResponse) },
				{ $ref: getSchemaPath(DrawingElementResponse) },
				{ $ref: getSchemaPath(DeletedElementResponse) },
				{ $ref: getSchemaPath(VideoConferenceElementResponse) },
				{ $ref: getSchemaPath(H5pElementResponse) },
			],
		},
	})
	@ApiResponse({ status: 400, type: ApiValidationError })
	@ApiResponse({ status: 403, type: ForbiddenException })
	@ApiResponse({ status: 404, type: NotFoundException })
	@Post(':cardId/elements')
	public async createElement(
		@Param() urlParams: CardUrlParams,
		@Body() bodyParams: CreateContentElementBodyParams,
		@CurrentUser() currentUser: ICurrentUser
	): Promise<AnyContentElementResponse> {
		const { type, toPosition } = bodyParams;
		const element = await this.cardUc.createElement(currentUser.userId, urlParams.cardId, type, toPosition);
		const response = ContentElementResponseFactory.mapToResponse(element);

		return response;
	}
}
