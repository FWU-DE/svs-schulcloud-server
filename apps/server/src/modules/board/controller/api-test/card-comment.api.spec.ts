import { EntityManager } from '@mikro-orm/mongodb';
import { courseEntityFactory } from '@modules/course/testing';
import { ServerTestModule } from '@modules/server/server.app.module';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { BoardExternalReferenceType } from '../../domain';
import { BoardNodeEntity } from '../../repo';
import { cardEntityFactory, columnBoardEntityFactory, columnEntityFactory } from '../../testing';
import { CardCommentResponse, CardResponse } from '../dto';

describe('card comment (api)', () => {
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

	const setup = async (commentsEnabled = true) => {
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
			commentsEnabled,
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

	const comment = async (client: TestApiClient, cardId: string, text = 'Ich habe eine Frage dazu.') => {
		const response = await client.post(`${cardId}/comments`, { text });

		return response.body as CardCommentResponse;
	};

	describe('when a course member comments', () => {
		it('should accept the comment although the student may not edit the board', async () => {
			const { studentCards, card } = await setup();

			const response = await studentCards.post(`${card.id}/comments`, { text: 'Frage' });

			expect(response.statusCode).toEqual(201);
		});

		it('should report the comment as their own, with their name', async () => {
			const { studentCards, card, studentUser } = await setup();

			const created = await comment(studentCards, card.id);

			expect(created.isOwn).toBe(true);
			expect(created.authorName).toContain(studentUser.lastName);
		});

		it('should show the comment to everyone on the card', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			await comment(studentCards, card.id, 'Sichtbar für alle');
			const response = await otherStudentCards.get().query({ ids: [card.id] });
			const body = response.body.data[0] as CardResponse;

			expect(body.comments).toHaveLength(1);
			expect(body.comments?.[0].text).toEqual('Sichtbar für alle');
			expect(body.comments?.[0].isOwn).toBe(false);
		});

		it('should strip markup from the text', async () => {
			const { studentCards, card } = await setup();

			const created = await comment(studentCards, card.id, '<img src=x onerror=alert(1)>hallo');

			expect(created.text).not.toContain('<img');
		});
	});

	describe('when someone outside the course comments', () => {
		it('should be rejected', async () => {
			const { outsiderCards, card } = await setup();

			const response = await outsiderCards.post(`${card.id}/comments`, { text: 'Frage' });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when the board has comments turned off', () => {
		it('should refuse the comment', async () => {
			const { studentCards, card } = await setup(false);

			const response = await studentCards.post(`${card.id}/comments`, { text: 'Frage' });

			expect(response.statusCode).toEqual(422);
		});

		it('should not report comments on the card at all', async () => {
			const { studentCards, card } = await setup(false);

			const response = await studentCards.get().query({ ids: [card.id] });

			expect((response.body.data[0] as CardResponse).comments).toBeUndefined();
		});
	});

	describe('when a comment is edited', () => {
		it('should be allowed for its author', async () => {
			const { studentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await studentCards.patch(`${card.id}/comments/${created.id}`, { text: 'Korrigiert' });

			expect((response.body as CardCommentResponse).text).toEqual('Korrigiert');
			expect((response.body as CardCommentResponse).isEdited).toBe(true);
		});

		it('should be refused for another student', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await otherStudentCards.patch(`${card.id}/comments/${created.id}`, { text: 'Fremd' });

			expect(response.statusCode).toEqual(403);
		});

		it('should be refused even for a teacher, who may remove but not rewrite', async () => {
			const { studentCards, teacherCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await teacherCards.patch(`${card.id}/comments/${created.id}`, { text: 'Umgeschrieben' });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when a comment is removed', () => {
		it('should be allowed for its author', async () => {
			const { studentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await studentCards.delete(`${card.id}/comments/${created.id}`);
			const body = response.body as CardCommentResponse;

			expect(body.isRemoved).toBe(true);
			expect(body.removedByModerator).toBe(false);
			expect(body.text).toEqual('');
		});

		it('should be allowed for a teacher and marked as moderated', async () => {
			const { studentCards, teacherCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await teacherCards.delete(`${card.id}/comments/${created.id}`);
			const body = response.body as CardCommentResponse;

			expect(body.isRemoved).toBe(true);
			expect(body.removedByModerator).toBe(true);
		});

		it('should be refused for an uninvolved student', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await otherStudentCards.delete(`${card.id}/comments/${created.id}`);

			expect(response.statusCode).toEqual(403);
		});

		it('should keep the removed comment in the thread but drop its text', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id, 'Wird entfernt');
			await studentCards.delete(`${card.id}/comments/${created.id}`);
			const response = await otherStudentCards.get().query({ ids: [card.id] });
			const body = response.body.data[0] as CardResponse;

			expect(body.comments).toHaveLength(1);
			expect(body.comments?.[0].isRemoved).toBe(true);
			expect(JSON.stringify(body)).not.toContain('Wird entfernt');
		});
	});

	describe('when a comment is reported', () => {
		it('should be accepted from another student', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, { reason: 'Beleidigend' });

			expect(response.statusCode).toEqual(200);
			expect((response.body as CardCommentResponse).ownReport).toBe(true);
		});

		it('should be refused for the author of the comment', async () => {
			const { studentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			const response = await studentCards.post(`${card.id}/comments/${created.id}/report`, {});

			expect(response.statusCode).toEqual(422);
		});

		it('should count a repeated report only once', async () => {
			const { studentCards, otherStudentCards, teacherCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, {});
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, {});
			const response = await teacherCards.get().query({ ids: [card.id] });
			const body = response.body.data[0] as CardResponse;

			expect(body.comments?.[0].reportCount).toEqual(1);
		});

		it('should show the report count to a teacher', async () => {
			const { studentCards, otherStudentCards, teacherCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, {});
			const response = await teacherCards.get().query({ ids: [card.id] });

			expect((response.body.data[0] as CardResponse).comments?.[0].reportCount).toEqual(1);
		});

		it('should hide the report count from students', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, {});
			const response = await studentCards.get().query({ ids: [card.id] });

			expect((response.body.data[0] as CardResponse).comments?.[0].reportCount).toBeUndefined();
		});

		it('should never reveal who reported', async () => {
			const { studentCards, otherStudentCards, teacherCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, { reason: 'Beleidigend' });
			const response = await teacherCards.get().query({ ids: [card.id] });

			expect(JSON.stringify(response.body)).not.toContain('Beleidigend');
			expect(JSON.stringify(response.body)).not.toContain('reports');
		});

		it('should keep the reason for the moderators in the database', async () => {
			const { studentCards, otherStudentCards, card } = await setup();

			const created = await comment(studentCards, card.id);
			await otherStudentCards.post(`${card.id}/comments/${created.id}/report`, { reason: 'Beleidigend' });
			const stored = await em.findOneOrFail(BoardNodeEntity, card.id);

			expect(stored.comments?.[0].reports[0].reason).toEqual('Beleidigend');
		});
	});

	describe('when a card overrides the board setting', () => {
		it('should allow comments on that card although the board has them off', async () => {
			const { teacherCards, studentCards, card } = await setup(false);

			await teacherCards.patch(`${card.id}/settings`, { commentsEnabled: true });
			const response = await studentCards.post(`${card.id}/comments`, { text: 'Doch erlaubt' });

			expect(response.statusCode).toEqual(201);
		});

		it('should refuse comments on that card although the board has them on', async () => {
			const { teacherCards, studentCards, card } = await setup(true);

			await teacherCards.patch(`${card.id}/settings`, { commentsEnabled: false });
			const response = await studentCards.post(`${card.id}/comments`, { text: 'Nicht hier' });

			expect(response.statusCode).toEqual(422);
		});

		it('should follow the board again once the override is cleared', async () => {
			const { teacherCards, studentCards, card } = await setup(true);

			await teacherCards.patch(`${card.id}/settings`, { commentsEnabled: false });
			await teacherCards.patch(`${card.id}/settings`, { commentsEnabled: null });
			const response = await studentCards.post(`${card.id}/comments`, { text: 'Wieder erlaubt' });

			expect(response.statusCode).toEqual(201);
		});

		it('should let a reader edit that card although the board does not', async () => {
			const { teacherCards, studentCards, card } = await setup(true);

			await teacherCards.patch(`${card.id}/settings`, { readersCanEdit: true });
			const response = await studentCards.patch(`${card.id}/title`, { title: 'Von der Klasse benannt' });

			expect(response.statusCode).toEqual(204);
		});

		it('should refuse the override for a student', async () => {
			const { studentCards, card } = await setup(true);

			const response = await studentCards.patch(`${card.id}/settings`, { commentsEnabled: true });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when comments are turned on or off for the board', () => {
		it('should be allowed for whoever may manage the board', async () => {
			const { teacherBoards, columnBoardNode } = await setup(false);

			const response = await teacherBoards.patch(`${columnBoardNode.id}/comments-enabled`, { commentsEnabled: true });
			const stored = await em.findOneOrFail(BoardNodeEntity, columnBoardNode.id);

			expect(response.statusCode).toEqual(204);
			expect(stored.commentsEnabled).toBe(true);
		});

		it('should be refused for a student', async () => {
			const { studentBoards, columnBoardNode } = await setup(false);

			const response = await studentBoards.patch(`${columnBoardNode.id}/comments-enabled`, { commentsEnabled: true });

			expect(response.statusCode).toEqual(403);
		});
	});
});
