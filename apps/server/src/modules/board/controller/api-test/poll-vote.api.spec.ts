import { EntityManager } from '@mikro-orm/mongodb';
import { courseEntityFactory } from '@modules/course/testing';
import { ServerTestModule } from '@modules/server/server.app.module';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { BoardExternalReferenceType, ContentElementType, PollResultVisibility } from '../../domain';
import { BoardNodeEntity } from '../../repo';
import {
	cardEntityFactory,
	columnBoardEntityFactory,
	columnEntityFactory,
	pollElementEntityFactory,
} from '../../testing';
import { type CardListResponse, type PollElementResponse } from '../dto';

describe('poll vote (api)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let testApiClient: TestApiClient;
	let cardApiClient: TestApiClient;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = module.createNestApplication();
		await app.init();
		em = module.get(EntityManager);
		testApiClient = new TestApiClient(app, 'elements');
		cardApiClient = new TestApiClient(app, 'cards');
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await cleanupCollections(em);
	});

	const setup = async (pollProps: Record<string, unknown> = {}) => {
		const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
		const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent();
		const other = UserAndAccountTestFactory.buildStudent();

		const outsider = UserAndAccountTestFactory.buildStudent({ school: teacherUser.school });

		const course = courseEntityFactory.build({
			school: teacherUser.school,
			teachers: [teacherUser],
			students: [studentUser, other.studentUser],
		});

		// The board context points at the course by id, so the course has to exist first.
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
		});
		const column = columnEntityFactory.withParent(columnBoardNode).build();
		const card = cardEntityFactory.withParent(column).build();
		const pollElement = pollElementEntityFactory.withParent(card).build(pollProps);

		await em.persist([columnBoardNode, column, card, pollElement]).flush();
		em.clear();

		const teacherClient = await testApiClient.login(teacherAccount);
		const studentClient = await testApiClient.login(studentAccount);
		const otherStudentClient = await testApiClient.login(other.studentAccount);
		const outsiderClient = await testApiClient.login(outsider.studentAccount);

		// Reading a poll goes through the card endpoint, which is where the per-user view of the
		// element is assembled — that is the surface the visibility rules have to hold on.
		const teacherCards = await cardApiClient.login(teacherAccount);
		const studentCards = await cardApiClient.login(studentAccount);
		const otherStudentCards = await cardApiClient.login(other.studentAccount);

		const optionIds = (pollElement.pollOptions ?? []).map((option) => option.id);

		return {
			teacherClient,
			studentClient,
			otherStudentClient,
			outsiderClient,
			teacherCards,
			studentCards,
			otherStudentCards,
			studentUser,
			pollElement,
			card,
			optionIds,
		};
	};

	describe('when a course member votes', () => {
		it('should accept the vote although the student may not edit the board', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });

			expect(response.statusCode).toEqual(200);
		});

		it('should report the vote back as the voter own ballot', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const body = response.body as PollElementResponse;

			expect(body.content.ownVote).toEqual([optionIds[0]]);
		});

		it('should replace an earlier vote instead of counting twice', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[1]] });
			const body = response.body as PollElementResponse;

			expect(body.content.voterCount).toEqual(1);
			expect(body.content.options.map((option) => option.count)).toEqual([0, 1]);
		});

		it('should withdraw the vote for an empty option list', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds: [] });
			const body = response.body as PollElementResponse;

			expect(body.content.ownVote).toEqual([]);
			expect(body.content.voterCount).toEqual(0);
		});
	});

	describe('when someone outside the course votes', () => {
		it('should be rejected', async () => {
			const { outsiderClient, pollElement, optionIds } = await setup();

			const response = await outsiderClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when a student tries to change the poll itself', () => {
		it('should be rejected', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			const response = await studentClient.patch(`${pollElement.id}/content`, {
				data: {
					type: ContentElementType.POLL,
					content: {
						question: 'my own question',
						options: optionIds.map((id) => {
							return { id, text: 'x' };
						}),
						anonymous: false,
						multipleChoice: false,
						closed: false,
						showResults: PollResultVisibility.ALWAYS,
						resultsReleased: false,
					},
				},
			});

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('when the poll is closed', () => {
		it('should refuse the vote', async () => {
			const { studentClient, pollElement, optionIds } = await setup({ closed: true });

			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });

			expect(response.statusCode).toEqual(422);
		});
	});

	describe('when the poll allows a single answer only', () => {
		it('should refuse a ballot with two options', async () => {
			const { studentClient, pollElement, optionIds } = await setup();

			const response = await studentClient.put(`${pollElement.id}/vote`, { optionIds });

			expect(response.statusCode).toEqual(422);
		});
	});

	describe('when the poll is anonymous', () => {
		const setupAnonymous = () => setup({ anonymous: true });

		it('should not store the voter with the ballot', async () => {
			const { studentClient, pollElement, optionIds } = await setupAnonymous();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const stored = await em.findOneOrFail(BoardNodeEntity, pollElement.id);

			expect(stored.votes).toHaveLength(1);
			expect(stored.votes?.[0].userId).toBeUndefined();
			expect(stored.votes?.[0].voterHash).toEqual(expect.any(String));
		});

		it('should not report voters to the teacher', async () => {
			const { studentClient, teacherCards, pollElement, card, optionIds } = await setupAnonymous();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await teacherCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.options.every((option) => option.voterIds === undefined)).toBe(true);
			expect(element.content.options.map((option) => option.count)).toEqual([1, 0]);
		});

		it('should still recognise the voter own ballot', async () => {
			const { studentClient, studentCards, pollElement, card, optionIds } = await setupAnonymous();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.ownVote).toEqual([optionIds[0]]);
		});
	});

	describe('when the poll is not anonymous', () => {
		it('should report who voted for what', async () => {
			const { studentClient, teacherCards, studentUser, pollElement, card, optionIds } = await setup();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await teacherCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.options[0].voterIds).toEqual([studentUser.id]);
		});
	});

	describe('when results are only visible after voting', () => {
		const setupAfterVote = () => setup({ showResults: PollResultVisibility.AFTER_VOTE });

		it('should withhold the tally from a student who has not voted', async () => {
			const { studentClient, otherStudentCards, pollElement, card, optionIds } = await setupAfterVote();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await otherStudentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.resultsVisible).toBe(false);
			expect(element.content.voterCount).toBeUndefined();
			expect(element.content.options.every((option) => option.count === undefined)).toBe(true);
		});

		it('should show the tally once the student has voted', async () => {
			const { studentClient, studentCards, pollElement, card, optionIds } = await setupAfterVote();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.resultsVisible).toBe(true);
			expect(element.content.options.map((option) => option.count)).toEqual([1, 0]);
		});
	});

	describe('when results wait for the teacher to release them', () => {
		const setupOnRelease = (resultsReleased = false) =>
			setup({ showResults: PollResultVisibility.ON_RELEASE, resultsReleased });

		it('should withhold the tally from a student even after voting', async () => {
			const { studentClient, studentCards, pollElement, card, optionIds } = await setupOnRelease();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.resultsVisible).toBe(false);
			expect(element.content.options.every((option) => option.count === undefined)).toBe(true);
		});

		it('should show the tally to the teacher before the release', async () => {
			const { studentClient, teacherCards, pollElement, card, optionIds } = await setupOnRelease();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await teacherCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.resultsVisible).toBe(true);
		});

		it('should show the tally to the student after the release', async () => {
			const { studentClient, studentCards, pollElement, card, optionIds } = await setupOnRelease(true);

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await studentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.resultsVisible).toBe(true);
			expect(element.content.options.map((option) => option.count)).toEqual([1, 0]);
		});
	});

	describe('when a student reads a card holding a poll', () => {
		it('should not leak another student own ballot', async () => {
			const { studentClient, otherStudentCards, pollElement, card, optionIds } = await setup();

			await studentClient.put(`${pollElement.id}/vote`, { optionIds: [optionIds[0]] });
			const response = await otherStudentCards.get().query({ ids: [card.id] });
			const element = (response.body as CardListResponse).data[0].elements[0] as PollElementResponse;

			expect(element.content.ownVote).toEqual([]);
		});
	});
});
