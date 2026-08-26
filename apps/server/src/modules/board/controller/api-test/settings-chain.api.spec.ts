import { EntityManager } from '@mikro-orm/mongodb';
import { roomEntityFactory } from '@modules/room/testing';
import { roomMembershipEntityFactory } from '@modules/room-membership/testing';
import { RoomRolesTestFactory } from '@modules/room/testing/room-roles.test.factory';
import { ServerTestModule } from '@modules/server/server.app.module';
import { groupEntityFactory } from '@modules/group/testing';
import { GroupEntityTypes } from '@modules/group/entity';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { BoardExternalReferenceType, CardReactionType } from '../../domain';
import { cardEntityFactory, columnBoardEntityFactory, columnEntityFactory } from '../../testing';
import { CardResponse } from '../dto';

/**
 * Comment and feedback settings cascade room → board → column → card. These tests pin the
 * cascade itself: which level wins, and that clearing a level hands the decision back up.
 */
describe('board settings chain (api)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let cardApiClient: TestApiClient;
	let boardApiClient: TestApiClient;
	let columnApiClient: TestApiClient;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = module.createNestApplication();
		await app.init();
		em = module.get(EntityManager);
		cardApiClient = new TestApiClient(app, 'cards');
		boardApiClient = new TestApiClient(app, 'boards');
		columnApiClient = new TestApiClient(app, 'columns');
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await cleanupCollections(em);
	});

	const setup = async (roomSettings: { commentsEnabled: boolean; reactionType: CardReactionType }) => {
		const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
		const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent({ school: teacherUser.school });

		const room = roomEntityFactory.buildWithId({ schoolId: teacherUser.school.id, ...roomSettings });
		const { roomOwnerRole, roomViewerRole } = RoomRolesTestFactory.createRoomRoles();
		const userGroup = groupEntityFactory.buildWithId({
			type: GroupEntityTypes.ROOM,
			users: [
				{ user: teacherUser, role: roomOwnerRole },
				{ user: studentUser, role: roomViewerRole },
			],
			organization: teacherUser.school,
		});
		const roomMembership = roomMembershipEntityFactory.build({ roomId: room.id, userGroupId: userGroup.id });

		const board = columnBoardEntityFactory.build({
			context: { id: room.id, type: BoardExternalReferenceType.Room },
			isVisible: true,
			commentsEnabled: undefined,
			reactionType: undefined,
		});
		const column = columnEntityFactory.withParent(board).build();
		const card = cardEntityFactory.withParent(column).build();

		await em
			.persist([
				teacherAccount,
				teacherUser,
				studentAccount,
				studentUser,
				room,
				roomOwnerRole,
				roomViewerRole,
				userGroup,
				roomMembership,
				board,
				column,
				card,
			])
			.flush();
		em.clear();

		return {
			teacherCards: await cardApiClient.login(teacherAccount),
			studentCards: await cardApiClient.login(studentAccount),
			teacherBoards: await boardApiClient.login(teacherAccount),
			teacherColumns: await columnApiClient.login(teacherAccount),
			studentColumns: await columnApiClient.login(studentAccount),
			board,
			column,
			card,
		};
	};

	const readCard = async (client: TestApiClient, cardId: string): Promise<CardResponse> => {
		const response = await client.get().query({ ids: [cardId] });

		return response.body.data[0] as CardResponse;
	};

	describe('when only the room is set', () => {
		it('should apply the room feedback kind to a card', async () => {
			const { teacherCards, card } = await setup({ commentsEnabled: true, reactionType: CardReactionType.STAR });

			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.STAR);
		});

		it('should allow comments on a card', async () => {
			const { studentCards, card } = await setup({ commentsEnabled: true, reactionType: CardReactionType.NONE });

			const response = await studentCards.post(`${card.id}/comments`, { text: 'Vom Raum erlaubt' });

			expect(response.statusCode).toEqual(201);
		});
	});

	describe('when the room has everything off', () => {
		it('should report no reactions on a card', async () => {
			const { teacherCards, card } = await setup({ commentsEnabled: false, reactionType: CardReactionType.NONE });

			const body = await readCard(teacherCards, card.id);

			expect(body.reactions).toBeUndefined();
		});

		it('should refuse a comment', async () => {
			const { studentCards, card } = await setup({ commentsEnabled: false, reactionType: CardReactionType.NONE });

			const response = await studentCards.post(`${card.id}/comments`, { text: 'Nicht erlaubt' });

			expect(response.statusCode).toEqual(422);
		});
	});

	describe('when the board overrules the room', () => {
		it('should win over the room feedback kind', async () => {
			const { teacherBoards, teacherCards, board, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.STAR,
			});

			await teacherBoards.patch(`${board.id}/reaction-type`, { reactionType: CardReactionType.VOTE });
			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.VOTE);
		});

		it('should be able to turn the room setting off', async () => {
			const { teacherBoards, studentCards, board, card } = await setup({
				commentsEnabled: true,
				reactionType: CardReactionType.NONE,
			});

			await teacherBoards.patch(`${board.id}/comments-enabled`, { commentsEnabled: false });
			const response = await studentCards.post(`${card.id}/comments`, { text: 'Board sagt nein' });

			expect(response.statusCode).toEqual(422);
		});

		it('should follow the room again once its override is cleared', async () => {
			const { teacherBoards, teacherCards, board, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.STAR,
			});

			await teacherBoards.patch(`${board.id}/reaction-type`, { reactionType: CardReactionType.VOTE });
			await teacherBoards.patch(`${board.id}/reaction-type`, { reactionType: null });
			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.STAR);
		});
	});

	describe('when the column overrules the board', () => {
		it('should win over the board feedback kind', async () => {
			const { teacherBoards, teacherColumns, teacherCards, board, column, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.NONE,
			});

			await teacherBoards.patch(`${board.id}/reaction-type`, { reactionType: CardReactionType.LIKE });
			await teacherColumns.patch(`${column.id}/settings`, { reactionType: CardReactionType.STAR });
			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.STAR);
		});

		it('should be able to allow comments the board turned off', async () => {
			const { teacherColumns, studentCards, column, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.NONE,
			});

			await teacherColumns.patch(`${column.id}/settings`, { commentsEnabled: true });
			const response = await studentCards.post(`${card.id}/comments`, { text: 'Spalte sagt ja' });

			expect(response.statusCode).toEqual(201);
		});

		it('should be refused for someone who may only view the room', async () => {
			const { studentColumns, column } = await setup({ commentsEnabled: false, reactionType: CardReactionType.NONE });

			const response = await studentColumns.patch(`${column.id}/settings`, { commentsEnabled: true });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when the card overrules the column', () => {
		it('should win over everything above it', async () => {
			const { teacherColumns, teacherCards, column, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.NONE,
			});

			await teacherColumns.patch(`${column.id}/settings`, { reactionType: CardReactionType.STAR });
			await teacherCards.patch(`${card.id}/settings`, { reactionType: CardReactionType.LIKE });
			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.LIKE);
		});

		it('should follow the column again once its override is cleared', async () => {
			const { teacherColumns, teacherCards, column, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.NONE,
			});

			await teacherColumns.patch(`${column.id}/settings`, { reactionType: CardReactionType.STAR });
			await teacherCards.patch(`${card.id}/settings`, { reactionType: CardReactionType.LIKE });
			await teacherCards.patch(`${card.id}/settings`, { reactionType: null });
			const body = await readCard(teacherCards, card.id);

			expect(body.reactions?.type).toEqual(CardReactionType.STAR);
		});
	});

	describe('when nothing is set anywhere', () => {
		it('should leave the board behaving as it did before these settings existed', async () => {
			const { teacherCards, studentCards, card } = await setup({
				commentsEnabled: false,
				reactionType: CardReactionType.NONE,
			});

			const body = await readCard(teacherCards, card.id);
			const comment = await studentCards.post(`${card.id}/comments`, { text: 'Nein' });

			expect(body.reactions).toBeUndefined();
			expect(comment.statusCode).toEqual(422);
		});
	});
});
