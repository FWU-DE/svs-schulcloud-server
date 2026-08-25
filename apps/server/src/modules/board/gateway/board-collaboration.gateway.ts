import { ICurrentUser, WsJwtAuthentication } from '@infra/auth-guard';
import { Socket, WsValidationPipe } from '@infra/socketio';
import { EnsureRequestContext, MikroORM } from '@mikro-orm/core';
import { Inject, UsePipes } from '@nestjs/common';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsException,
} from '@nestjs/websockets';
import { EntityId } from '@shared/domain/types';
import { Server } from 'socket.io';
import { BOARD_CONFIG_TOKEN, BoardConfig } from '../board.config';
import { AnyContentElementResponse } from '../controller/dto';
import {
	BoardResponseMapper,
	CardResponseMapper,
	ColumnResponseMapper,
	CardCommentResponseMapper,
	ChecklistElementResponseMapper,
	ContentElementResponseFactory,
	PollElementResponseMapper,
} from '../controller/mapper';
import { MoveCardResponseMapper } from '../controller/mapper/move-card-response.mapper';
import { AnyBoardNode, type BoardViewContext, type CardComment, ColumnBoard } from '../domain';
import { MetricsService } from '../metrics/metrics.service';
import { TrackExecutionTime } from '../metrics/track-execution-time.decorator';
import { BoardUc, CardUc, ColumnUc, ElementUc } from '../uc';
import {
	CopyCardMessageParams,
	CopyColumnMessageParams,
	CreateCardMessageParams,
	CreateColumnMessageParams,
	CreateContentElementMessageParams,
	DeleteBoardMessageParams,
	DeleteCardMessageParams,
	DeleteColumnMessageParams,
	DeleteContentElementMessageParams,
	FetchBoardMessageParams,
	FetchCardsMessageParams,
	MoveCardMessageParams,
	MoveCardToBoardMessageParams,
	MoveColumnMessageParams,
	MoveContentElementMessageParams,
	UpdateBoardLayoutMessageParams,
	UpdateBoardTitleMessageParams,
	UpdateBoardVisibilityMessageParams,
	UpdateCardColorMessageParams,
	UpdateCardHeightMessageParams,
	UpdateCardTitleMessageParams,
	UpdateColumnTitleMessageParams,
	AddCardCommentMessageParams,
	EditCardCommentMessageParams,
	ReactToCardMessageParams,
	RemoveCardCommentMessageParams,
	ReportCardCommentMessageParams,
	UpdateBoardCommentsEnabledMessageParams,
	UpdateBoardReactionTypeMessageParams,
	SetChecklistItemCheckedMessageParams,
	UpdateContentElementMessageParams,
	VoteInPollMessageParams,
} from './dto';
import { UpdateReadersCanEditMessageParams } from './dto/update-users-can-edit.message.param';

// Using a variable here to access the exchange name in the decorator
const websocketOptions = {
	path: '',
	cors: {
		origin: '',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		preflightContinue: false,
		optionsSuccessStatus: 204,
		credentials: true,
	},
};
@UsePipes(new WsValidationPipe())
@WebSocketGateway(websocketOptions)
@WsJwtAuthentication()
export class BoardCollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	private readonly server!: Server;

	// TODO: use loggables instead of legacy logger
	constructor(
		private readonly orm: MikroORM,
		private readonly boardUc: BoardUc,
		private readonly columnUc: ColumnUc,
		private readonly cardUc: CardUc,
		private readonly elementUc: ElementUc,
		private readonly metricsService: MetricsService,
		@Inject(BOARD_CONFIG_TOKEN) private readonly boardConfig: BoardConfig
	) {
		websocketOptions.cors.origin = this.boardConfig.hostUrl;
		websocketOptions.path = this.boardConfig.basePath;
	}

	public trackExecutionTime(methodName: string, executionTimeMs: number): void {
		if (this.metricsService) {
			this.metricsService.setExecutionTime(methodName, executionTimeMs);
			this.metricsService.incrementActionCount(methodName);
			this.metricsService.incrementActionGauge(methodName);
			this.metricsService.incrementActionCount('all');
			this.metricsService.incrementActionGauge('all');
		}
	}

	private getCurrentUser(socket: Socket): ICurrentUser {
		const { user } = socket.handshake;
		if (!user) throw new WsException('Not Authenticated.');
		return user;
	}

	public handleConnection(): void {
		this.updateTotalUserCount();
		this.updateTotalBoardCount();
	}

	public handleDisconnect(): void {
		this.updateTotalUserCount();
		this.updateTotalBoardCount();
	}

	private updateTotalUserCount(): void {
		const clientCount = this.server.engine.clientsCount;
		this.metricsService.setTotalUserCount(clientCount);
	}

	private updateTotalBoardCount(): void {
		const allRooms = this.server.sockets.adapter.rooms;
		let boardCount = 0;

		for (const [roomName, clients] of allRooms.entries()) {
			const isSocketId = clients.has(roomName);
			if (!isSocketId) {
				boardCount++;
			}
		}

		this.metricsService.setTotalBoardCount(boardCount);
	}

	@SubscribeMessage('delete-board-request')
	@EnsureRequestContext()
	public async deleteBoard(socket: Socket, data: DeleteBoardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'delete-board' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.deleteBoard(userId, data.boardId);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-board-title-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateBoardTitle(socket: Socket, data: UpdateBoardTitleMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-board-title' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.updateBoardTitle(userId, data.boardId, data.newTitle);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-card-title-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateCardTitle(socket: Socket, data: UpdateCardTitleMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-card-title' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const card = await this.cardUc.updateCardTitle(userId, data.cardId, data.newTitle);
			emitter.emitToClientAndRoom(data, card);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-card-height-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateCardHeight(socket: Socket, data: UpdateCardHeightMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-card-height' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const card = await this.cardUc.updateCardHeight(userId, data.cardId, data.newHeight);
			emitter.emitToClientAndRoom(data, card);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-card-color-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateCardColor(socket: Socket, data: UpdateCardColorMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-card-color' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const card = await this.cardUc.updateCardColor(userId, data.cardId, data.backgroundColor);
			emitter.emitToClientAndRoom(data, card);
		} catch {
			emitter.emitFailure(data);
		}
	}

	/**
	 * Like a poll vote, a reaction splits into two payloads: the room sees the new totals, the
	 * reacting client alone learns its own value back.
	 */
	@SubscribeMessage('react-to-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async reactToCard(socket: Socket, data: ReactToCardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'react-to-card' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const { card, viewContext } = await this.cardUc.reactToCard(userId, data.cardId, data.value);

			emitter.emitToClient({ ...data, card: CardResponseMapper.mapToResponse(card, viewContext) });
			emitter.emitToRoom(
				{
					cardId: data.cardId,
					card: CardResponseMapper.mapToResponse(card, { ...viewContext, userId: undefined }),
				},
				card
			);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-board-reaction-type-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateBoardReactionType(socket: Socket, data: UpdateBoardReactionTypeMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-board-reaction-type' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.updateReactionType(userId, data.boardId, data.reactionType);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	/**
	 * Comment traffic is broadcast to the whole room, but each recipient needs their own view of
	 * it: only the author sees `isOwn`, only a moderator sees the report count, only a reporter
	 * sees their own report. The room therefore gets the neutral rendering and refetches the
	 * card, while the acting client gets the version built for them.
	 */
	@SubscribeMessage('add-card-comment-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async addCardComment(socket: Socket, data: AddCardCommentMessageParams): Promise<void> {
		await this.handleCommentAction(socket, 'add-card-comment', data, () =>
			this.cardUc.addComment(this.getCurrentUser(socket).userId, data.cardId, data.text)
		);
	}

	@SubscribeMessage('edit-card-comment-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async editCardComment(socket: Socket, data: EditCardCommentMessageParams): Promise<void> {
		await this.handleCommentAction(socket, 'edit-card-comment', data, () =>
			this.cardUc.editComment(this.getCurrentUser(socket).userId, data.cardId, data.commentId, data.text)
		);
	}

	@SubscribeMessage('remove-card-comment-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async removeCardComment(socket: Socket, data: RemoveCardCommentMessageParams): Promise<void> {
		await this.handleCommentAction(socket, 'remove-card-comment', data, () =>
			this.cardUc.removeComment(this.getCurrentUser(socket).userId, data.cardId, data.commentId)
		);
	}

	@SubscribeMessage('report-card-comment-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async reportCardComment(socket: Socket, data: ReportCardCommentMessageParams): Promise<void> {
		await this.handleCommentAction(socket, 'report-card-comment', data, () =>
			this.cardUc.reportComment(this.getCurrentUser(socket).userId, data.cardId, data.commentId, data.reason)
		);
	}

	@SubscribeMessage('update-board-comments-enabled-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateBoardCommentsEnabled(
		socket: Socket,
		data: UpdateBoardCommentsEnabledMessageParams
	): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-board-comments-enabled' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.updateCommentsEnabled(userId, data.boardId, data.commentsEnabled);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	private async handleCommentAction(
		socket: Socket,
		action: string,
		data: { cardId: string },
		perform: () => Promise<{ card: AnyBoardNode; comment: CardComment; viewContext: BoardViewContext }>
	): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action });
		try {
			const { card, comment, viewContext } = await perform();

			emitter.emitToClient({ ...data, comment: CardCommentResponseMapper.mapToResponse(comment, viewContext) });
			emitter.emitToRoom({ cardId: data.cardId }, card);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('delete-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async deleteCard(socket: Socket, data: DeleteCardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'delete-card' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const rootId = await this.cardUc.deleteCard(userId, data.cardId);
			emitter.emitToClientAndRoom(data, rootId);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('create-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async createCard(socket: Socket, data: CreateCardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'create-card' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const card = await this.columnUc.createCard(userId, data.columnId, data.requiredEmptyElements, data.position);
			const newCard = CardResponseMapper.mapToResponse(card);

			const responsePayload = {
				...data,
				newCard,
			};

			emitter.emitToClientAndRoom(responsePayload, card);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('create-column-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async createColumn(socket: Socket, data: CreateColumnMessageParams): Promise<object> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'create-column' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const column = await this.boardUc.createColumn(userId, data.boardId);

			const newColumn = ColumnResponseMapper.mapToResponse(column);
			const responsePayload = {
				...data,
				newColumn,
			};
			await emitter.joinRoom(column);
			emitter.emitToClientAndRoom(responsePayload, column);

			// payload needs to be returned to allow the client to do sequential operation
			// of createColumn and move the card into that column
			return responsePayload;
		} catch {
			emitter.emitFailure(data);
			return {};
		}
	}

	@SubscribeMessage('fetch-board-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async fetchBoard(socket: Socket, data: FetchBoardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'fetch-board' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const { board, features, allowedOperations } = await this.boardUc.findBoard(userId, data.boardId);
			const responsePayload = BoardResponseMapper.mapToResponse(board, features, allowedOperations);
			await emitter.joinRoom(board);
			emitter.emitSuccess(responsePayload);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('move-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async moveCard(socket: Socket, data: MoveCardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'move-card' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const { toBoard } = await this.columnUc.moveCard(userId, data.cardId, data.toColumnId, data.newIndex);
			emitter.emitToClientAndRoom(data, toBoard.id);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('move-card-to-board-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async moveCardToBoard(socket: Socket, data: MoveCardToBoardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'move-card-to-board' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const resultData = await this.columnUc.moveCard(userId, data.cardId, data.toColumnId);
			const result = MoveCardResponseMapper.mapToReponse(resultData);
			const payload = {
				...result,
				forceNextTick: data.forceNextTick,
			};
			emitter.emitToClient(payload);
			if (result.fromBoard.id === result.toBoard.id) {
				emitter.emitToRoom(payload, result.fromBoard.id);
			} else {
				emitter.emitToRoom(payload, result.toBoard.id);
			}
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('duplicate-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async copyCard(socket: Socket, data: CopyCardMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'duplicate-card' });
		const { userId, schoolId } = this.getCurrentUser(socket);
		try {
			const copyResult = await this.columnUc.copyCard(userId, data.cardId, schoolId);

			const cardResponse = CardResponseMapper.mapToResponse(copyResult.copyEntity);
			const responsePayload = {
				...data,
				duplicatedCard: cardResponse,
				status: copyResult.status,
			};
			emitter.emitToClientAndRoom(responsePayload, copyResult.copyEntity);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('duplicate-column-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async copyColumn(socket: Socket, data: CopyColumnMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'duplicate-column' });
		const { userId, schoolId } = this.getCurrentUser(socket);
		try {
			const copyResult = await this.boardUc.copyColumn(userId, data.columnId, schoolId);

			const columnFullResponse = ColumnResponseMapper.mapToFullResponse(copyResult.copyEntity);
			const responsePayload = {
				...data,
				duplicatedColumn: columnFullResponse,
				status: copyResult.status,
			};
			emitter.emitToClientAndRoom(responsePayload, copyResult.copyEntity);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('move-column-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async moveColumn(socket: Socket, data: MoveColumnMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'move-column' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const column = await this.boardUc.moveColumn(
				userId,
				data.columnMove.columnId,
				data.targetBoardId,
				data.columnMove.addedIndex
			);
			emitter.emitToClientAndRoom(data, column);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-column-title-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateColumnTitle(socket: Socket, data: UpdateColumnTitleMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-column-title' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const column = await this.columnUc.updateColumnTitle(userId, data.columnId, data.newTitle);
			emitter.emitToClientAndRoom(data, column);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-readers-can-edit-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateReadersCanEdit(socket: Socket, data: UpdateReadersCanEditMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-readers-can-edit' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.updateReadersCanEdit(userId, data.boardId, data.readersCanEdit);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-board-visibility-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateBoardVisibility(socket: Socket, data: UpdateBoardVisibilityMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-board-visibility' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board = await this.boardUc.updateVisibility(userId, data.boardId, data.isVisible);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('update-board-layout-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateBoardLayout(socket: Socket, data: UpdateBoardLayoutMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-board-layout' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const board: ColumnBoard = await this.boardUc.updateLayout(userId, data.boardId, data.layout);
			emitter.emitToClientAndRoom(data, board);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('delete-column-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async deleteColumn(socket: Socket, data: DeleteColumnMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'delete-column' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const rootId = await this.columnUc.deleteColumn(userId, data.columnId);
			emitter.emitToClientAndRoom(data, rootId);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('fetch-card-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async fetchCards(socket: Socket, data: FetchCardsMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'fetch-card' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const cards = await this.cardUc.findCards(userId, data.cardIds);
			const cardResponses = cards.map(({ card, viewContext }) => CardResponseMapper.mapToResponse(card, viewContext));

			emitter.emitSuccess({ cards: cardResponses });
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('create-element-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async createElement(
		socket: Socket,
		data: CreateContentElementMessageParams
	): Promise<AnyContentElementResponse | undefined> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'create-element' });
		const { userId } = this.getCurrentUser(socket);
		let response: AnyContentElementResponse | undefined;

		try {
			const element = await this.cardUc.createElement(userId, data.cardId, data.type, data.toPosition);

			const responsePayload = {
				...data,
				newElement: ContentElementResponseFactory.mapToResponse(element),
			};
			emitter.emitToClientAndRoom(responsePayload, element);

			response = responsePayload.newElement;
		} catch {
			emitter.emitFailure(data);
		}

		return response;
	}

	@SubscribeMessage('update-element-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async updateElement(socket: Socket, data: UpdateContentElementMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'update-element' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const element = await this.elementUc.updateElement(userId, data.elementId, data.data.content);
			emitter.emitToClientAndRoom(data, element);
		} catch {
			emitter.emitFailure(data);
		}
	}

	/**
	 * A vote produces two different payloads on purpose: the room only learns the new tally,
	 * while the voter alone gets their own ballot back. Broadcasting one shared payload would
	 * hand every other participant the voter's choice — which is exactly what an anonymous
	 * poll must not do.
	 */
	@SubscribeMessage('vote-in-poll-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async voteInPoll(socket: Socket, data: VoteInPollMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'vote-in-poll' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const { element, viewContext } = await this.elementUc.voteInPoll(userId, data.elementId, data.optionIds);
			const mapper = PollElementResponseMapper.getInstance();

			emitter.emitToClient({
				...data,
				pollElement: mapper.mapToResponse(element, viewContext),
			});
			emitter.emitToRoom(
				{
					elementId: data.elementId,
					optionIds: [],
					pollElement: mapper.mapToResponse(element, { canEdit: viewContext.canEdit }),
				},
				element
			);
		} catch {
			emitter.emitFailure(data);
		}
	}

	/**
	 * A checklist is shared state, so unlike a poll vote everyone gets the same payload.
	 */
	@SubscribeMessage('set-checklist-item-checked-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async setChecklistItemChecked(socket: Socket, data: SetChecklistItemCheckedMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'set-checklist-item-checked' });
		const { userId } = this.getCurrentUser(socket);
		try {
			const element = await this.elementUc.setChecklistItemChecked(userId, data.elementId, data.itemId, data.checked);

			emitter.emitToClientAndRoom(
				{ ...data, element: ChecklistElementResponseMapper.getInstance().mapToResponse(element) },
				element
			);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('delete-element-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async deleteElement(socket: Socket, data: DeleteContentElementMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'delete-element' });
		const { userId } = this.getCurrentUser(socket);

		try {
			const rootId = await this.elementUc.deleteElement(userId, data.elementId);
			emitter.emitToClientAndRoom(data, rootId);
		} catch {
			emitter.emitFailure(data);
		}
	}

	@SubscribeMessage('move-element-request')
	@TrackExecutionTime()
	@EnsureRequestContext()
	public async moveElement(socket: Socket, data: MoveContentElementMessageParams): Promise<void> {
		const emitter = this.buildBoardSocketEmitter({ socket, action: 'move-element' });
		const { userId } = this.getCurrentUser(socket);

		try {
			const element = await this.cardUc.moveElement(userId, data.elementId, data.toCardId, data.toPosition);
			emitter.emitToClientAndRoom(data, element);
		} catch {
			emitter.emitFailure(data);
		}
	}

	private buildBoardSocketEmitter({ socket, action }: { socket: Socket; action: string }): {
		joinRoom(boardNode: AnyBoardNode): Promise<void>;
		emitSuccess(data: object): void;
		emitToClientAndRoom(data: object, boardNodeOrRootId: AnyBoardNode | EntityId): void;
		emitToClient(data: object): void;
		emitToRoom(data: object, boardNodeOrRootId: AnyBoardNode | EntityId): void;
		emitFailure(data: object): void;
	} {
		const getRoomName = (boardNode: AnyBoardNode | EntityId): string => {
			const rootId = typeof boardNode === 'string' ? boardNode : boardNode.rootId;
			return `board_${rootId}`;
		};
		return {
			async joinRoom(boardNode: AnyBoardNode): Promise<void> {
				const room = getRoomName(boardNode);
				await socket.join(room);
			},
			emitSuccess(data: object): void {
				socket.emit(`${action}-success`, { ...data, isOwnAction: true });
			},
			emitToClientAndRoom(data: object, boardNodeOrRootId: AnyBoardNode | EntityId): void {
				const room = getRoomName(boardNodeOrRootId);
				socket.to(room).emit(`${action}-success`, { ...data, isOwnAction: false });
				socket.emit(`${action}-success`, { ...data, isOwnAction: true });
			},
			emitToClient(data: object): void {
				socket.emit(`${action}-success`, { ...data, isOwnAction: true });
			},
			emitToRoom(data: object, boardNodeOrRootId: AnyBoardNode | EntityId): void {
				const room = getRoomName(boardNodeOrRootId);
				socket.to(room).emit(`${action}-success`, { ...data, isOwnAction: false });
			},
			emitFailure(data: object): void {
				socket.emit(`${action}-failure`, data);
			},
		};
	}
}
