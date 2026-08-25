import { EntityManager } from '@mikro-orm/mongodb';
import { BoardNodeEntity } from '@modules/board/repo/entity';
import { RoomEntity } from '@modules/room/repo';
import { RoomRolesTestFactory } from '@modules/room/testing/room-roles.test.factory';
import { ServerTestModule } from '@modules/server';
import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { cleanupCollections } from '@testing/cleanup-collections';
import { UserAndAccountTestFactory } from '@testing/factory/user-and-account.test.factory';
import { TestApiClient } from '@testing/test-api-client';
import { type Response } from 'supertest';

/** The transport rejects a POST that does not accept both content types, whatever it answers with. */
const MCP_ACCEPT = 'application/json, text/event-stream';

interface JsonRpcResponse {
	result?: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean };
	error?: { message: string };
}

describe('MCP Controller (API)', () => {
	let app: INestApplication;
	let em: EntityManager;
	let testApiClient: TestApiClient;

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({ imports: [ServerTestModule] }).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
		em = app.get(EntityManager);
		testApiClient = new TestApiClient(app, 'mcp');

		// `RoleRepo` caches roles by name for a minute, so wiping and re-seeding them between tests
		// would leave room memberships pointing at a role id that no longer exists — and every board
		// permission derived from it would silently vanish. Seed them once for the whole suite.
		await cleanupCollections(em);
		const { roomOwnerRole, roomAdminRole, roomEditorRole, roomViewerRole } = RoomRolesTestFactory.createRoomRoles();
		await em.persist([roomOwnerRole, roomAdminRole, roomEditorRole, roomViewerRole]).flush();
		em.clear();
	});

	afterAll(async () => {
		await app.close();
	});

	const setupTeacher = async () => {
		const { teacherAccount, teacherUser } = UserAndAccountTestFactory.buildTeacher();
		await em.persist([teacherAccount, teacherUser]).flush();
		em.clear();

		const loggedInClient = await testApiClient.login(teacherAccount);

		return { loggedInClient, teacherUser };
	};

	const rpc = (client: TestApiClient, method: string, params?: object): Promise<Response> =>
		client
			.post(undefined, { jsonrpc: '2.0', id: 1, method, params })
			.set('accept', MCP_ACCEPT)
			.set('content-type', 'application/json');

	const callTool = async (client: TestApiClient, name: string, args: object): Promise<Record<string, unknown>> => {
		const response = await rpc(client, 'tools/call', { name, arguments: args });
		const body = response.body as JsonRpcResponse;

		expect(response.status).toBe(HttpStatus.OK);
		if (body.result?.isError) {
			throw new Error(`tool ${name} failed: ${body.result.content?.[0].text ?? ''}`);
		}

		return JSON.parse(body.result?.content?.[0].text ?? '{}') as Record<string, unknown>;
	};

	describe('when the user is not authenticated', () => {
		it('should return a 401 error', async () => {
			const response = await testApiClient
				.post(undefined, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
				.set('accept', MCP_ACCEPT);

			expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
		});
	});

	describe('when a method other than POST is used', () => {
		it('should answer 405 for GET and DELETE', async () => {
			const { loggedInClient } = await setupTeacher();

			await expect(loggedInClient.get().then((response) => response.status)).resolves.toBe(
				HttpStatus.METHOD_NOT_ALLOWED
			);
			await expect(loggedInClient.delete().then((response) => response.status)).resolves.toBe(
				HttpStatus.METHOD_NOT_ALLOWED
			);
		});
	});

	describe('when the client does not accept an event stream', () => {
		it('should answer 406', async () => {
			const { loggedInClient } = await setupTeacher();

			const response = await loggedInClient.post(undefined, { jsonrpc: '2.0', id: 1, method: 'tools/list' });

			expect(response.status).toBe(HttpStatus.NOT_ACCEPTABLE);
		});
	});

	describe('initialize', () => {
		it('should announce the server and its tool capability', async () => {
			const { loggedInClient } = await setupTeacher();

			const response = await rpc(loggedInClient, 'initialize', {
				protocolVersion: '2025-06-18',
				capabilities: {},
				clientInfo: { name: 'api-spec', version: '1.0.0' },
			});

			expect(response.status).toBe(HttpStatus.OK);
			expect(response.body).toMatchObject({
				result: { serverInfo: { name: 'schulcloud-mcp' }, capabilities: { tools: {} } },
			});
		});
	});

	describe('tools/list', () => {
		it('should list the room, course and board tools', async () => {
			const { loggedInClient } = await setupTeacher();

			const response = await rpc(loggedInClient, 'tools/list');
			const names = (response.body as JsonRpcResponse).result?.tools?.map((tool) => tool.name);

			expect(response.status).toBe(HttpStatus.OK);
			expect(names).toEqual(
				expect.arrayContaining([
					'list_rooms',
					'create_room',
					'list_room_boards',
					'list_courses',
					'create_course',
					'create_board',
					'get_board',
					'add_column',
					'add_card',
					'add_card_element',
					'set_board_visibility',
				])
			);
		});
	});

	describe('tools/call', () => {
		it('should create a room the caller owns', async () => {
			const { loggedInClient } = await setupTeacher();

			const room = await callTool(loggedInClient, 'create_room', { name: 'Raum aus MCP', color: 'red' });

			await expect(em.findOneOrFail(RoomEntity, room.id as string)).resolves.toMatchObject({ name: 'Raum aus MCP' });
		});

		it('should list the rooms the caller is a member of', async () => {
			const { loggedInClient } = await setupTeacher();
			const room = await callTool(loggedInClient, 'create_room', { name: 'Raum aus MCP', color: 'red' });

			const rooms = await callTool(loggedInClient, 'list_rooms', {});

			expect(rooms).toMatchObject({ total: 1, data: [{ id: room.id, name: 'Raum aus MCP' }] });
		});

		it('should create and list a course', async () => {
			const { loggedInClient } = await setupTeacher();
			const course = await callTool(loggedInClient, 'create_course', { name: 'Kurs aus MCP' });

			const courses = await callTool(loggedInClient, 'list_courses', {});

			expect(courses).toMatchObject({ total: 1, data: [{ id: course.id, name: 'Kurs aus MCP' }] });
		});

		it('should create a room board with its whole content in one call', async () => {
			const { loggedInClient } = await setupTeacher();
			const room = await callTool(loggedInClient, 'create_room', { name: 'Raum aus MCP', color: 'red' });

			const board = await callTool(loggedInClient, 'create_board', {
				parentType: 'room',
				parentId: room.id,
				title: 'Wochenplan',
				columns: [
					{
						title: 'Material',
						cards: [
							{
								title: 'Einstieg',
								elements: [
									{ type: 'text', text: 'Willkommen!' },
									{ type: 'link', url: 'https://dbildungscloud.de', title: 'dBildungscloud' },
								],
							},
						],
					},
				],
			});

			expect(board).toMatchObject({
				title: 'Wochenplan',
				isVisible: true,
				columns: [
					{
						title: 'Material',
						cards: [{ title: 'Einstieg', elements: [{ type: 'richText' }, { type: 'link' }] }],
					},
				],
			});
			await expect(em.findOneOrFail(BoardNodeEntity, board.id as string)).resolves.toMatchObject({ isVisible: true });
		});

		it('should list the boards of a room', async () => {
			const { loggedInClient } = await setupTeacher();
			const room = await callTool(loggedInClient, 'create_room', { name: 'Raum aus MCP', color: 'red' });
			await callTool(loggedInClient, 'create_board', { parentType: 'room', parentId: room.id, title: 'Wochenplan' });

			const boards = await callTool(loggedInClient, 'list_room_boards', { roomId: room.id });

			expect(boards).toMatchObject({ total: 1, data: [{ title: 'Wochenplan', isVisible: true }] });
		});

		it('should reject arguments that do not match the tool schema', async () => {
			const { loggedInClient } = await setupTeacher();

			const response = await rpc(loggedInClient, 'tools/call', {
				name: 'create_room',
				arguments: { name: 'Raum aus MCP', color: 'not-a-colour' },
			});

			const body = response.body as JsonRpcResponse;

			expect(response.status).toBe(HttpStatus.OK);
			expect(body.result?.isError).toBe(true);
			expect(body.result?.content?.[0].text).toContain('Invalid arguments for tool create_room');
		});

		it('should report a denied call as a tool error instead of failing the request', async () => {
			const { loggedInClient } = await setupTeacher();
			const { teacherUser: foreignUser } = UserAndAccountTestFactory.buildTeacher();
			await em.persist([foreignUser]).flush();

			const response = await rpc(loggedInClient, 'tools/call', {
				name: 'get_board',
				arguments: { boardId: foreignUser.id },
			});
			const body = response.body as JsonRpcResponse;

			expect(response.status).toBe(HttpStatus.OK);
			expect(body.result?.isError).toBe(true);
			expect(body.result?.content?.[0].text).toContain('get_board failed');
		});
	});
});
