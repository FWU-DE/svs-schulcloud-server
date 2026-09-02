import { StorageLocation } from '@infra/files-storage-amqp-client';
import { LegacyLogger } from '@infra/logger';
import { Action, AuthorizationService } from '@modules/authorization';
import { BoardContextApiHelperService } from '@modules/board-context';
import { CopyStatus, CopyStatusEnum } from '@modules/copy-helper';
import { CourseService } from '@modules/course';
import { RoomService } from '@modules/room';
import { RoomMembershipService } from '@modules/room-membership';
import { forwardRef, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { FeatureDisabledLoggableException } from '@shared/common/loggable-exception';
import { throwForbiddenIfFalse } from '@shared/common/utils';
import { Permission } from '@shared/domain/interface';
import { EntityId } from '@shared/domain/types';
import { BoardNodeRule, BoardOperation } from '../authorisation/board-node.rule';
import { BOARD_CONFIG_TOKEN, BoardConfig } from '../board.config';
import { CreateBoardBodyParams } from '../controller/dto';
import { type User } from '@modules/user/repo';
import {
	BoardExternalReference,
	BoardExternalReferenceType,
	BoardFeature,
	BoardLayout,
	BoardNodeFactory,
	CardReactionType,
	isDeadlineElement,
	Column,
	ColumnBoard,
	isColumn,
} from '../domain';
import { BoardNodeAuthorizableService, BoardNodeService, ColumnBoardService } from '../service';
import { StorageLocationReference } from '../service/internal';

export interface BoardContextInfo {
	reference: BoardExternalReference;
	name: string;
}

export interface BoardDeadline {
	elementId: EntityId;
	cardId: EntityId;
	boardId: EntityId;
	boardTitle: string;
	title: string;
	dueDate: Date;
	context: BoardContextInfo;
}

@Injectable()
export class BoardUc {
	constructor(
		@Inject(forwardRef(() => AuthorizationService)) // TODO is this needed?
		private readonly authorizationService: AuthorizationService,
		private readonly roomMembershipService: RoomMembershipService,
		private readonly boardNodeService: BoardNodeService,
		private readonly columnBoardService: ColumnBoardService,
		private readonly logger: LegacyLogger,
		private readonly courseService: CourseService,
		private readonly roomService: RoomService,
		private readonly boardNodeFactory: BoardNodeFactory,
		private readonly boardContextApiHelperService: BoardContextApiHelperService,
		private readonly boardNodeAuthorizableService: BoardNodeAuthorizableService,
		@Inject(BOARD_CONFIG_TOKEN) private readonly config: BoardConfig,
		private readonly boardNodeRule: BoardNodeRule
	) {
		this.logger.setContext(BoardUc.name);
	}

	public async createBoard(userId: EntityId, params: CreateBoardBodyParams): Promise<ColumnBoard> {
		await this.checkBoardCreatePermission(userId, { type: params.parentType, id: params.parentId });

		const board = this.boardNodeFactory.buildColumnBoard({
			context: { type: params.parentType, id: params.parentId },
			title: params.title,
			layout: params.layout,
		});

		await this.boardNodeService.addRoot(board);

		return board;
	}

	public async findBoard(
		userId: EntityId,
		boardId: EntityId
	): Promise<{
		board: ColumnBoard;
		features: BoardFeature[];
		allowedOperations: Record<BoardOperation, boolean>;
		/** What the board would inherit if it set nothing itself. */
		roomDefaults: { commentsEnabled: boolean; reactionType: CardReactionType };
	}> {
		// TODO set depth=2 to reduce data?
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		throwForbiddenIfFalse(this.boardNodeRule.can('findBoard', user, boardNodeAuthorizable));

		const features = await this.boardContextApiHelperService.getFeaturesForBoardNode(boardId);
		const allowedOperations = this.boardNodeRule.listAllowedOperations(user, boardNodeAuthorizable);
		return {
			board,
			features,
			allowedOperations,
			roomDefaults: {
				commentsEnabled: boardNodeAuthorizable.boardConfiguration.roomCommentsEnabled ?? false,
				reactionType: boardNodeAuthorizable.boardConfiguration.roomReactionType ?? CardReactionType.NONE,
			},
		};
	}

	public async findBoardContext(userId: EntityId, boardId: EntityId): Promise<BoardExternalReference> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		throwForbiddenIfFalse(this.boardNodeRule.can('findBoard', user, boardNodeAuthorizable));

		return board.context;
	}

	public async deleteBoard(userId: EntityId, boardId: EntityId): Promise<ColumnBoard> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId); // TODO decide to refactor returned object vs return boardNodeId
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		throwForbiddenIfFalse(this.boardNodeRule.can('deleteBoard', user, boardNodeAuthorizable));

		await this.boardNodeService.delete(board);
		return board;
	}

	public async updateBoardTitle(userId: EntityId, boardId: EntityId, title: string): Promise<ColumnBoard> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId); // TODO decide to refactor returned object vs return boardNodeId
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateBoardTitle', user, boardNodeAuthorizable));

		await this.boardNodeService.updateTitle(board, title);
		return board;
	}

	public async createColumn(userId: EntityId, boardId: EntityId): Promise<Column> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId, 1);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		const user = await this.authorizationService.getUserWithPermissions(userId);

		throwForbiddenIfFalse(this.boardNodeRule.can('createColumn', user, boardNodeAuthorizable));

		const column = this.boardNodeFactory.buildColumn();

		await this.boardNodeService.addToParent(board, column);

		return column;
	}

	public async moveColumn(
		userId: EntityId,
		columnId: EntityId,
		targetBoardId: EntityId,
		targetPosition: number
	): Promise<Column> {
		const user = await this.authorizationService.getUserWithPermissions(userId);

		const column = await this.boardNodeService.findByClassAndId(Column, columnId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(column);

		throwForbiddenIfFalse(this.boardNodeRule.can('moveColumn', user, boardNodeAuthorizable));

		const targetBoard = await this.boardNodeService.findByClassAndId(ColumnBoard, targetBoardId);
		const boardNodeAuthorizableTargetBoard = await this.boardNodeAuthorizableService.getBoardAuthorizable(targetBoard);

		throwForbiddenIfFalse(this.boardNodeRule.can('moveColumn', user, boardNodeAuthorizableTargetBoard));

		await this.boardNodeService.move(column, targetBoard, targetPosition);
		return column;
	}

	public async copyColumn(
		userId: EntityId,
		columnId: EntityId,
		schoolId: EntityId
	): Promise<{ copyEntity: Column; status: CopyStatusEnum }> {
		const column = await this.boardNodeService.findByClassAndId(Column, columnId);

		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(column);

		throwForbiddenIfFalse(this.boardNodeRule.can('copyColumn', user, boardNodeAuthorizable));

		const copyStatus = await this.columnBoardService.copyColumn({
			originalColumnId: column.id,
			userId,
			targetStorageLocationReference: { id: schoolId, type: StorageLocation.SCHOOL },
			sourceStorageLocationReference: { id: schoolId, type: StorageLocation.SCHOOL },
			targetSchoolId: schoolId,
		});

		if (!isColumn(copyStatus.copyEntity)) {
			throw new InternalServerErrorException('Copied entity is not a column');
		}

		return { copyEntity: copyStatus.copyEntity, status: copyStatus.status };
	}

	public async copyBoard(userId: EntityId, boardId: EntityId, targetSchoolId: EntityId): Promise<CopyStatus> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('copyBoard', user, boardNodeAuthorizable));

		const sourceStorageLocationReference = await this.getStorageLocationReference(board.context);
		const targetStorageLocationReference = { id: targetSchoolId, type: StorageLocation.SCHOOL };

		const copyStatus = await this.columnBoardService.copyColumnBoard({
			originalColumnBoardId: boardId,
			targetExternalReference: board.context,
			sourceStorageLocationReference,
			targetStorageLocationReference,
			userId,
			targetSchoolId,
		});

		await this.columnBoardService.swapLinkedIdsInBoards(copyStatus);

		return copyStatus;
	}

	public async updateVisibility(userId: EntityId, boardId: EntityId, isVisible: boolean): Promise<ColumnBoard> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateBoardVisibility', user, boardNodeAuthorizable));

		await this.boardNodeService.updateVisibility(board, isVisible);

		return board;
	}

	public async updateReactionType(
		userId: EntityId,
		boardId: EntityId,
		reactionType: CardReactionType | null
	): Promise<ColumnBoard> {
		this.checkInteractiveElementsEnabled();

		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateBoardReactionType', user, boardNodeAuthorizable));

		await this.columnBoardService.updateReactionType(board, reactionType ?? undefined);

		return board;
	}

	public async updateCommentsEnabled(
		userId: EntityId,
		boardId: EntityId,
		commentsEnabled: boolean | null
	): Promise<ColumnBoard> {
		this.checkInteractiveElementsEnabled();

		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateBoardCommentsEnabled', user, boardNodeAuthorizable));

		await this.columnBoardService.updateCommentsEnabled(board, commentsEnabled ?? undefined);

		return board;
	}

	/**
	 * Every deadline the user may see and that is marked for the calendar.
	 *
	 * The dates are not pushed into the external calendar service. That service is optional,
	 * lives outside this system and would have to be kept in sync in both directions — a board
	 * deadline that someone deleted in their calendar app is a worse problem than one that is
	 * simply read from the board. The board stays the one place the date lives; the calendar
	 * view asks for it.
	 */
	public async findDeadlinesForUser(userId: EntityId): Promise<BoardDeadline[]> {
		if (!this.config.featureColumnBoardInteractiveElementsEnabled) {
			return [];
		}

		const user = await this.authorizationService.getUserWithPermissions(userId);
		const contexts = await this.findBoardContextsOfUser(userId, user.school.id);

		const boardsPerContext = await Promise.all(
			contexts.map(async (context) => {
				const boards = await this.columnBoardService.findByExternalReference(context.reference);

				return boards.map((board) => {
					return { board, context };
				});
			})
		);

		const deadlines = await Promise.all(
			boardsPerContext.flat().map(({ board, context }) => this.collectDeadlines(user, board, context))
		);

		return deadlines.flat().sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
	}

	private async findBoardContextsOfUser(userId: EntityId, schoolId: EntityId): Promise<BoardContextInfo[]> {
		const roomAuthorizables = await this.roomMembershipService.getRoomAuthorizablesByUserId(userId);
		const rooms = await Promise.all(
			roomAuthorizables.map(async (authorizable) => {
				const room = await this.roomService.getSingleRoom(authorizable.roomId);

				return {
					reference: { type: BoardExternalReferenceType.Room, id: authorizable.roomId },
					name: room.name,
				};
			})
		);

		const [courses] = await this.courseService.findAllByUserId(userId, schoolId);
		const courseContexts = courses.map((course) => {
			return {
				reference: { type: BoardExternalReferenceType.Course, id: course.id },
				name: course.name,
			};
		});

		return [...rooms, ...courseContexts];
	}

	private async collectDeadlines(user: User, board: ColumnBoard, context: BoardContextInfo): Promise<BoardDeadline[]> {
		const authorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);
		if (!this.boardNodeRule.can('findBoard', user, authorizable)) {
			return [];
		}

		const deadlines: BoardDeadline[] = [];
		for (const column of board.children) {
			for (const card of column.children) {
				for (const element of card.children) {
					if (isDeadlineElement(element) && element.showInCalendar && element.dueDate) {
						deadlines.push({
							elementId: element.id,
							cardId: card.id,
							boardId: board.id,
							boardTitle: board.title,
							title: element.title,
							dueDate: element.dueDate,
							context,
						});
					}
				}
			}
		}

		return deadlines;
	}

	private checkInteractiveElementsEnabled(): void {
		if (!this.config.featureColumnBoardInteractiveElementsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED');
		}
	}

	public async updateReadersCanEdit(
		userId: EntityId,
		boardId: EntityId,
		readersCanEdit: boolean
	): Promise<ColumnBoard> {
		if (!this.config.featureBoardReadersCanEditToggle) {
			throw new FeatureDisabledLoggableException('FEATURE_BOARD_READERS_CAN_EDIT_TOGGLE');
		}

		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateReadersCanEditSetting', user, boardNodeAuthorizable));

		await this.columnBoardService.updateReadersCanEdit(board, readersCanEdit);
		return board;
	}

	public async updateLayout(userId: EntityId, boardId: EntityId, layout: BoardLayout): Promise<ColumnBoard> {
		const board = await this.boardNodeService.findByClassAndId(ColumnBoard, boardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(board);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateBoardLayout', user, boardNodeAuthorizable));

		await this.boardNodeService.updateLayout(board, layout);
		return board;
	}

	private async checkBoardCreatePermission(userId: EntityId, context: BoardExternalReference): Promise<void> {
		const user = await this.authorizationService.getUserWithPermissions(userId);

		if (context.type === BoardExternalReferenceType.Course) {
			const course = await this.courseService.findById(context.id);

			this.authorizationService.checkPermission(user, course, {
				action: Action.write,
				requiredPermissions: [Permission.COURSE_EDIT],
			});
		} else if (context.type === BoardExternalReferenceType.Room) {
			const roomAuthorizable = await this.roomMembershipService.getRoomAuthorizable(context.id);

			this.authorizationService.checkPermission(user, roomAuthorizable, {
				action: Action.write,
				requiredPermissions: [Permission.ROOM_EDIT_CONTENT],
			});
		} else {
			throw new Error(`Unsupported context type ${context.type as string}`);
		}
	}

	private async getStorageLocationReference(context: BoardExternalReference): Promise<StorageLocationReference> {
		if (context.type === BoardExternalReferenceType.Course) {
			const course = await this.courseService.findById(context.id);

			return { id: course.school.id, type: StorageLocation.SCHOOL };
		}

		if (context.type === BoardExternalReferenceType.Room) {
			const room = await this.roomService.getSingleRoom(context.id);

			return { id: room.schoolId, type: StorageLocation.SCHOOL };
		}
		/* istanbul ignore next */
		throw new Error(`Unsupported board reference type ${context.type as string}`);
	}
}
