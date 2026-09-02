import { EntityManager } from '@mikro-orm/mongodb';
import { courseEntityFactory } from '@modules/course/testing';
import { ServerTestModule } from '@modules/server/server.app.module';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { BoardExternalReferenceType, CardReactionType } from '../../domain';
import { BoardNodeEntity } from '../../repo';
import { cardEntityFactory, columnBoardEntityFactory, columnEntityFactory } from '../../testing';
import { type CardListResponse, type CardResponse } from '../dto';

describe('card reaction (api)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let cardApiClient: TestApiClient;
	let boardApiClient: TestApiClient;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = module.createNestApplication();
		await app.init();
		em = module.get(EntityManager);
		cardApiClient = new TestApiClient(app, 'cards');
		boardApiClient = new TestApiClient(app, 'boards');
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await cleanupCollections(em);
	});

	const setup = async (reactionType: CardReactionType = CardReactionType.LIKE) => {
		const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
		const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent();
		const other = UserAndAccountTestFactory.buildStudent();
		const outsider = UserAndAccountTestFactory.buildStudent({ school: teacherUser.school });

		const course = courseEntityFactory.build({
			school: teacherUser.school,
			teachers: [teacherUser],
			students: [studentUser, other.studentUser],
		});

		await em
			.persist([
				teacherAccount,
				teacherUser,
				studentAccount,
				studentUser,
				other.studentAccount,
				other.studentUser,
				outsider.studentAccount,
				outsider.studentUser,
				course,
			])
			.flush();

		const columnBoardNode = columnBoardEntityFactory.build({
			context: { id: course.id, type: BoardExternalReferenceType.Course },
			isVisible: true,
			reactionType,
		});
		const column = columnEntityFactory.withParent(columnBoardNode).build();
		const card = cardEntityFactory.withParent(column).build();

		await em.persist([columnBoardNode, column, card]).flush();
		em.clear();

		return {
			teacherCards: await cardApiClient.login(teacherAccount),
			studentCards: await cardApiClient.login(studentAccount),
			otherStudentCards: await cardApiClient.login(other.studentAccount),
			outsiderCards: await cardApiClient.login(outsider.studentAccount),
			teacherBoards: await boardApiClient.login(teacherAccount),
			studentBoards: await boardApiClient.login(studentAccount),
			card,
			columnBoardNode,
			studentUser,
		};
	};

	describe('when a course member reacts', () => {
		it('should accept the reaction although the student may not edit the board', async () => {
			const { studentCards, card } = await setup();

			const response = await studentCards.put(`${card.id}/reaction`, { value: 1 });

			expect(response.statusCode).toEqual(200);
		});

		it('should report the totals and the own value back', async () => {
			const { studentCards, card } = await setup();

			const response = await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const body = response.body as CardResponse;

			expect(body.reactions).toEqual({ type: CardReactionType.LIKE, count: 1, sum: 1, ownValue: 1 });
		});

		it('should count one reaction per person, not one per click', async () => {
			const { studentCards, card } = await setup();

			await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const response = await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const body = response.body as CardResponse;

			expect(body.reactions?.count).toEqual(1);
		});

		it('should withdraw the reaction when no value is sent', async () => {
			const { studentCards, card } = await setup();

			await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const response = await studentCards.put(`${card.id}/reaction`, {});
			const body = response.body as CardResponse;

			expect(body.reactions).toEqual({ type: CardReactionType.LIKE, count: 0, sum: 0 });
		});
	});

	describe('when someone outside the course reacts', () => {
		it('should be rejected', async () => {
			const { outsiderCards, card } = await setup();

			const response = await outsiderCards.put(`${card.id}/reaction`, { value: 1 });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when the board has reactions turned off', () => {
		it('should refuse the reaction', async () => {
			const { studentCards, card } = await setup(CardReactionType.NONE);

			const response = await studentCards.put(`${card.id}/reaction`, { value: 1 });

			expect(response.statusCode).toEqual(422);
		});

		it('should not report reactions on the card at all', async () => {
			const { studentCards, card } = await setup(CardReactionType.NONE);

			const response = await studentCards.get().query({ ids: [card.id] });

			expect((response.body as CardListResponse).data[0].reactions).toBeUndefined();
		});
	});

	describe('when the value does not fit the board reaction kind', () => {
		it('should refuse three stars on a like board', async () => {
			const { studentCards, card } = await setup(CardReactionType.LIKE);

			const response = await studentCards.put(`${card.id}/reaction`, { value: 3 });

			expect(response.statusCode).toEqual(422);
		});

		it('should accept three stars on a star board', async () => {
			const { studentCards, card } = await setup(CardReactionType.STAR);

			const response = await studentCards.put(`${card.id}/reaction`, { value: 3 });

			expect((response.body as CardResponse).reactions).toEqual({
				type: CardReactionType.STAR,
				count: 1,
				sum: 3,
				ownValue: 3,
			});
		});

		it('should accept a downvote on a vote board', async () => {
			const { studentCards, card } = await setup(CardReactionType.VOTE);

			const response = await studentCards.put(`${card.id}/reaction`, { value: -1 });

			expect((response.body as CardResponse).reactions?.sum).toEqual(-1);
		});
	});

	describe('when someone else reads the card', () => {
		it('should show the totals but not the reader own value', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const response = await otherStudentCards.get().query({ ids: [card.id] });
			const body = (response.body as CardListResponse).data[0];

			expect(body.reactions?.count).toEqual(1);
			expect(body.reactions?.ownValue).toBeUndefined();
		});

		it('should never report who reacted', async () => {
			const { studentCards, teacherCards, card } = await setup();

			await studentCards.put(`${card.id}/reaction`, { value: 1 });
			const response = await teacherCards.get().query({ ids: [card.id] });

			expect(JSON.stringify(response.body)).not.toContain('userId');
		});
	});

	describe('when the reaction kind of the board is changed', () => {
		it('should be allowed for whoever may manage the board', async () => {
			const { teacherBoards, columnBoardNode } = await setup(CardReactionType.NONE);

			const response = await teacherBoards.patch(`${columnBoardNode.id}/reaction-type`, {
				reactionType: CardReactionType.STAR,
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, columnBoardNode.id);

			expect(response.statusCode).toEqual(204);
			expect(stored.reactionType).toEqual(CardReactionType.STAR);
		});

		it('should be refused for a student', async () => {
			const { studentBoards, columnBoardNode } = await setup(CardReactionType.NONE);

			const response = await studentBoards.patch(`${columnBoardNode.id}/reaction-type`, {
				reactionType: CardReactionType.STAR,
			});

			expect(response.statusCode).toEqual(403);
		});
	});
});
