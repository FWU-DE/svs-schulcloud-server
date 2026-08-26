import { EntityManager } from '@mikro-orm/mongodb';
import { courseEntityFactory } from '@modules/course/testing';
import { ServerTestModule } from '@modules/server/server.app.module';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import {
	BoardExternalReferenceType,
	ChecklistProgressMode,
	ContentElementType,
	RecordingMediaType,
} from '../../domain';
import { BoardNodeEntity } from '../../repo';
import {
	cardEntityFactory,
	checklistElementEntityFactory,
	codeElementEntityFactory,
	columnBoardEntityFactory,
	columnEntityFactory,
	deadlineElementEntityFactory,
	formulaElementEntityFactory,
	recordingElementEntityFactory,
} from '../../testing';
import { ChecklistElementResponse } from '../dto';

describe('interactive board elements (api)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let elementApiClient: TestApiClient;
	let cardApiClient: TestApiClient;
	let boardApiClient: TestApiClient;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			imports: [ServerTestModule],
		}).compile();

		app = module.createNestApplication();
		await app.init();
		em = module.get(EntityManager);
		elementApiClient = new TestApiClient(app, 'elements');
		cardApiClient = new TestApiClient(app, 'cards');
		boardApiClient = new TestApiClient(app, 'boards');
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await cleanupCollections(em);
	});

	const setup = async () => {
		const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
		// Same school as the course: that is what a course membership normally looks like, and
		// the deadline lookup walks the user's courses, which are scoped by school.
		const { studentAccount, studentUser } = UserAndAccountTestFactory.buildStudent({ school: teacherUser.school });
		const other = UserAndAccountTestFactory.buildStudent({ school: teacherUser.school });
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
		});
		const column = columnEntityFactory.withParent(columnBoardNode).build();
		const card = cardEntityFactory.withParent(column).build();
		const deadline = deadlineElementEntityFactory.withParent(card).build();
		const code = codeElementEntityFactory.withParent(card).build();
		const formula = formulaElementEntityFactory.withParent(card).build();
		const checklist = checklistElementEntityFactory.withParent(card).build();
		const recording = recordingElementEntityFactory.withParent(card).build();

		await em.persist([columnBoardNode, column, card, deadline, code, formula, checklist, recording]).flush();
		em.clear();

		return {
			teacherElements: await elementApiClient.login(teacherAccount),
			studentElements: await elementApiClient.login(studentAccount),
			otherStudentElements: await elementApiClient.login(other.studentAccount),
			outsiderElements: await elementApiClient.login(outsider.studentAccount),
			studentCards: await cardApiClient.login(studentAccount),
			teacherBoards: await boardApiClient.login(teacherAccount),
			studentBoards: await boardApiClient.login(studentAccount),
			outsiderBoards: await boardApiClient.login(outsider.studentAccount),
			card,
			deadline,
			code,
			formula,
			checklist,
			recording,
		};
	};

	describe('the deadline element', () => {
		it('should store the title and the due date', async () => {
			const { teacherElements, deadline } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: {
					type: ContentElementType.DEADLINE,
					content: { title: 'Abgabe Übungsblatt 3', dueDate: '2026-09-01T12:00:00.000Z', showInCalendar: false },
				},
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, deadline.id);

			expect(stored.title).toEqual('Abgabe Übungsblatt 3');
			expect(stored.dueDate?.toISOString()).toEqual('2026-09-01T12:00:00.000Z');
		});

		it('should clear the date when it is left out', async () => {
			const { teacherElements, deadline } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: { type: ContentElementType.DEADLINE, content: { title: 'Ohne Frist', showInCalendar: false } },
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, deadline.id);

			expect(stored.dueDate).toBeUndefined();
		});

		it('should refuse an edit by a student', async () => {
			const { studentElements, deadline } = await setup();

			const response = await studentElements.patch(`${deadline.id}/content`, {
				data: { type: ContentElementType.DEADLINE, content: { title: 'Meine Frist', showInCalendar: false } },
			});

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('the code element', () => {
		it('should keep the snippet exactly as written', async () => {
			const { teacherElements, code } = await setup();
			const snippet = 'if (a < b && c > d) {\n\treturn "<b>not markup</b>";\n}';

			await teacherElements.patch(`${code.id}/content`, {
				data: {
					type: ContentElementType.CODE,
					content: { code: snippet, language: 'javascript', showLineNumbers: true, syntaxHighlighting: true },
				},
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, code.id);

			expect(stored.code).toEqual(snippet);
		});
	});

	describe('the formula element', () => {
		it('should keep the LaTeX source exactly as written', async () => {
			const { teacherElements, formula } = await setup();
			const latex = '\\frac{a}{b} < \\sqrt{c}';

			await teacherElements.patch(`${formula.id}/content`, {
				data: { type: ContentElementType.FORMULA, content: { latex } },
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, formula.id);

			expect(stored.latex).toEqual(latex);
		});
	});

	describe('the deadline calendar option', () => {
		it('should keep the deadline out of the calendar list while the option is off', async () => {
			const { teacherElements, teacherBoards, deadline } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: {
					type: ContentElementType.DEADLINE,
					content: { title: 'Nur auf dem Board', dueDate: '2026-09-01T12:00:00.000Z', showInCalendar: false },
				},
			});
			const response = await teacherBoards.get('deadlines');

			expect(response.body.data).toEqual([]);
		});

		it('should list it for everyone who may see the board once the option is on', async () => {
			const { teacherElements, studentBoards, deadline, card } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: {
					type: ContentElementType.DEADLINE,
					content: { title: 'Auch im Kalender', dueDate: '2026-09-01T12:00:00.000Z', showInCalendar: true },
				},
			});
			const response = await studentBoards.get('deadlines');

			expect(response.body.data).toHaveLength(1);
			expect(response.body.data[0]).toMatchObject({
				elementId: deadline.id,
				cardId: card.id,
				title: 'Auch im Kalender',
			});
		});

		it('should not list it for someone outside the course', async () => {
			const { teacherElements, outsiderBoards, deadline } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: {
					type: ContentElementType.DEADLINE,
					content: { title: 'Fremd', dueDate: '2026-09-01T12:00:00.000Z', showInCalendar: true },
				},
			});
			const response = await outsiderBoards.get('deadlines');

			expect(response.body.data).toEqual([]);
		});

		it('should not list a deadline without a date', async () => {
			const { teacherElements, teacherBoards, deadline } = await setup();

			await teacherElements.patch(`${deadline.id}/content`, {
				data: { type: ContentElementType.DEADLINE, content: { title: 'Ohne Datum', showInCalendar: true } },
			});
			const response = await teacherBoards.get('deadlines');

			expect(response.body.data).toEqual([]);
		});
	});

	describe('the personal checklist', () => {
		const switchToPerUser = async (teacherElements: TestApiClient, checklist: BoardNodeEntity) =>
			teacherElements.patch(`${checklist.id}/content`, {
				data: {
					type: ContentElementType.CHECKLIST,
					content: {
						title: 'Mein Lernweg',
						progressMode: ChecklistProgressMode.PER_USER,
						items: [{ text: 'Schritt 1' }, { text: 'Schritt 2' }],
					},
				},
			});

		it('should let each person keep their own ticks', async () => {
			const { teacherElements, studentElements, otherStudentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const otherView = await otherStudentElements.get(`${checklist.id}`);
			const ownView = await studentElements.get(`${checklist.id}`);

			const otherItems = (otherView.body.element as ChecklistElementResponse).content.items;
			const ownItems = (ownView.body.element as ChecklistElementResponse).content.items;

			expect(ownItems[0].checked).toBe(true);
			expect(otherItems[0].checked).toBe(false);
		});

		it('should count how many ticked an item for whoever may edit', async () => {
			const { teacherElements, studentElements, otherStudentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			await otherStudentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const teacherView = await teacherElements.get(`${checklist.id}`);
			const content = (teacherView.body.element as ChecklistElementResponse).content;

			expect(content.items[0].checkedCount).toBe(2);
			expect(content.participantCount).toBe(2);
		});

		it('should not report the counts to a participant', async () => {
			const { teacherElements, studentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const studentView = await studentElements.get(`${checklist.id}`);
			const content = (studentView.body.element as ChecklistElementResponse).content;

			expect(content.items[0].checkedCount).toBeUndefined();
			expect(content.participantCount).toBeUndefined();
		});

		it('should never report who ticked what', async () => {
			const { teacherElements, studentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const teacherView = await teacherElements.get(`${checklist.id}`);

			expect(JSON.stringify(teacherView.body)).not.toContain('userId');
		});

		it('should report the own progress', async () => {
			const { teacherElements, studentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			const response = await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const content = (response.body as ChecklistElementResponse).content;

			expect(content.completedCount).toBe(1);
			expect(content.items).toHaveLength(2);
		});

		it('should start the progress over when the mode is switched', async () => {
			const { teacherElements, studentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;
			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });

			await teacherElements.patch(`${checklist.id}/content`, {
				data: {
					type: ContentElementType.CHECKLIST,
					content: {
						title: 'Mein Lernweg',
						progressMode: ChecklistProgressMode.SHARED,
						items: [{ id: itemId, text: 'Schritt 1' }],
					},
				},
			});
			const view = await studentElements.get(`${checklist.id}`);

			expect((view.body.element as ChecklistElementResponse).content.items[0].checked).toBe(false);
		});

		it('should still let a student tick, although they may not edit the element', async () => {
			const { teacherElements, studentElements, checklist } = await setup();

			const configured = await switchToPerUser(teacherElements, checklist);
			const itemId = (configured.body as ChecklistElementResponse).content.items[0].id;

			const response = await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });

			expect(response.statusCode).toBe(200);
		});
	});

	describe('the recording element', () => {
		it('should store the media type and the caption', async () => {
			const { teacherElements, recording } = await setup();

			await teacherElements.patch(`${recording.id}/content`, {
				data: {
					type: ContentElementType.RECORDING,
					content: { mediaType: RecordingMediaType.VIDEO, caption: 'Mein Vortrag' },
				},
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, recording.id);

			expect(stored.mediaType).toEqual(RecordingMediaType.VIDEO);
			expect(stored.caption).toEqual('Mein Vortrag');
		});

		it('should refuse an unknown media type', async () => {
			const { teacherElements, recording } = await setup();

			const response = await teacherElements.patch(`${recording.id}/content`, {
				data: { type: ContentElementType.RECORDING, content: { mediaType: 'hologram', caption: '' } },
			});

			expect(response.statusCode).toEqual(400);
		});

		it('should refuse an edit by a student', async () => {
			const { studentElements, recording } = await setup();

			const response = await studentElements.patch(`${recording.id}/content`, {
				data: {
					type: ContentElementType.RECORDING,
					content: { mediaType: RecordingMediaType.AUDIO, caption: 'Meins' },
				},
			});

			expect(response.statusCode).toEqual(403);
		});
	});

	describe('the checklist element', () => {
		it('should let a student tick an item although they may not edit the board', async () => {
			const { studentElements, checklist } = await setup();
			const itemId = checklist.items?.[0].id ?? '';

			const response = await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const body = response.body as ChecklistElementResponse;

			expect(response.statusCode).toEqual(200);
			expect(body.content.items[0].checked).toBe(true);
		});

		it('should show the tick to everyone, since the list is shared', async () => {
			const { studentElements, studentCards, checklist, card } = await setup();
			const itemId = checklist.items?.[0].id ?? '';

			await studentElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });
			const response = await studentCards.get().query({ ids: [card.id] });
			const element = response.body.data[0].elements.find(
				(e: { id: string }) => e.id === checklist.id
			) as ChecklistElementResponse;

			expect(element.content.items[0].checked).toBe(true);
		});

		it('should refuse the tick for someone outside the course', async () => {
			const { outsiderElements, checklist } = await setup();
			const itemId = checklist.items?.[0].id ?? '';

			const response = await outsiderElements.put(`${checklist.id}/checklist/${itemId}`, { checked: true });

			expect(response.statusCode).toEqual(403);
		});

		it('should keep the checked state when the text of another item is edited', async () => {
			const { teacherElements, studentElements, checklist } = await setup();
			const [first, second] = checklist.items ?? [];

			await studentElements.put(`${checklist.id}/checklist/${first.id}`, { checked: true });
			await teacherElements.patch(`${checklist.id}/content`, {
				data: {
					type: ContentElementType.CHECKLIST,
					content: {
						progressMode: ChecklistProgressMode.SHARED,
						title: 'Schritte',
						items: [
							{ id: first.id, text: first.text },
							{ id: second.id, text: 'zweiter Schritt, korrigiert' },
						],
					},
				},
			});
			const stored = await em.findOneOrFail(BoardNodeEntity, checklist.id);

			expect(stored.items?.[0].checked).toBe(true);
			expect(stored.items?.[1].text).toEqual('zweiter Schritt, korrigiert');
		});

		it('should refuse a tick on an item that does not exist', async () => {
			const { studentElements, checklist } = await setup();

			const response = await studentElements.put(`${checklist.id}/checklist/000000000000000000000000`, {
				checked: true,
			});

			expect(response.statusCode).toEqual(404);
		});

		it('should refuse the checklist endpoint on another element type', async () => {
			const { studentElements, code, checklist } = await setup();
			const itemId = checklist.items?.[0].id ?? '';

			const response = await studentElements.put(`${code.id}/checklist/${itemId}`, { checked: true });

			expect(response.statusCode).toEqual(422);
		});
	});
});
