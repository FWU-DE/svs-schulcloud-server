import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { AuthorizationService } from '@modules/authorization';
import { CourseService } from '@modules/course';
import { RoleName } from '@modules/role';
import { RoomService } from '@modules/room';
import { RoomAuthorizable, RoomMembershipService, type RoomOperation, RoomRule } from '@modules/room-membership';
import { type User, type UserDo, UserService } from '@modules/user';
import { Test, type TestingModule } from '@nestjs/testing';
import { QuickSearchResultType, QuickSearchService } from './quick-search.service';

const room = (id: string, name: string) =>
	({ id, name }) as unknown as Awaited<ReturnType<RoomService['getSingleRoom']>>;
const course = (id: string, name: string) =>
	({ id, name }) as unknown as Awaited<ReturnType<CourseService['findById']>>;
const user = (id: string, firstName: string, lastName: string, deletedAt?: Date) =>
	({ id, firstName, lastName, deletedAt }) as UserDo;

const authorizable = (roomId: string, memberIds: string[], applicantIds: string[] = []) =>
	new RoomAuthorizable(
		roomId,
		[...memberIds, ...applicantIds].map((userId) => {
			const roles = applicantIds.includes(userId) ? [{ id: 'role-applicant', name: RoleName.ROOMAPPLICANT }] : [];
			return { userId, roles, userSchoolId: 'school-1' };
		}),
		'school-1'
	);

describe('QuickSearchService', () => {
	let module: TestingModule;
	let service: QuickSearchService;
	let roomMembershipService: DeepMocked<RoomMembershipService>;
	let roomService: DeepMocked<RoomService>;
	let courseService: DeepMocked<CourseService>;
	let userService: DeepMocked<UserService>;
	let authorizationService: DeepMocked<AuthorizationService>;
	let roomRule: DeepMocked<RoomRule>;

	beforeAll(async () => {
		module = await Test.createTestingModule({
			providers: [
				QuickSearchService,
				{ provide: RoomMembershipService, useValue: createMock<RoomMembershipService>() },
				{ provide: RoomService, useValue: createMock<RoomService>() },
				{ provide: CourseService, useValue: createMock<CourseService>() },
				{ provide: UserService, useValue: createMock<UserService>() },
				{ provide: AuthorizationService, useValue: createMock<AuthorizationService>() },
				{ provide: RoomRule, useValue: createMock<RoomRule>() },
			],
		}).compile();

		service = module.get(QuickSearchService);
		roomMembershipService = module.get(RoomMembershipService);
		roomService = module.get(RoomService);
		courseService = module.get(CourseService);
		userService = module.get(UserService);
		authorizationService = module.get(AuthorizationService);
		roomRule = module.get(RoomRule);
	});

	afterAll(async () => {
		await module.close();
	});

	beforeEach(() => {
		jest.resetAllMocks();
		roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([]);
		roomService.getRoomsByIds.mockResolvedValue([]);
		courseService.findAllByUserId.mockResolvedValue([[], 0]);
		userService.findByIds.mockResolvedValue([]);
		authorizationService.getUserWithPermissions.mockResolvedValue({ id: 'user-1' } as User);
		roomRule.can.mockReturnValue(true);
	});

	describe('when a room matches', () => {
		it('returns it with the route the client navigates to', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([authorizable('room-1', [])]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Ökosystem See')]);

			const results = await service.search('user-1', 'school-1', 'See', 10);

			expect(results).toEqual([
				{
					id: 'room-1',
					type: QuickSearchResultType.ROOM,
					title: 'Ökosystem See',
					subtitle: '',
					url: '/rooms/room-1',
				},
			]);
		});
	});

	describe('when the query differs from the title in its diacritics', () => {
		it('still matches', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([authorizable('room-1', [])]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Ökosystem See')]);

			const results = await service.search('user-1', 'school-1', 'okosystem', 10);

			expect(results).toHaveLength(1);
		});
	});

	describe('when several rooms match', () => {
		it('puts the one starting with the query first', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', []),
				authorizable('room-2', []),
			]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Ökosystem See'), room('room-2', 'Seeufer')]);

			const results = await service.search('user-1', 'school-1', 'See', 10);

			expect(results.map((result) => result.title)).toEqual(['Seeufer', 'Ökosystem See']);
		});
	});

	describe('when a course matches', () => {
		it('links to the course route', async () => {
			courseService.findAllByUserId.mockResolvedValue([[course('course-1', 'Bio Kurs')], 1]);

			const results = await service.search('user-1', 'school-1', 'Bio', 10);

			expect(results).toEqual([
				{
					id: 'course-1',
					type: QuickSearchResultType.COURSE,
					title: 'Bio Kurs',
					subtitle: '',
					url: '/courses/course-1',
				},
			]);
		});
	});

	describe('when rooms, courses and people all match', () => {
		it('interleaves the kinds so one group cannot fill the palette', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-2']),
				authorizable('room-2', []),
			]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Bio A'), room('room-2', 'Bio B')]);
			courseService.findAllByUserId.mockResolvedValue([[course('course-1', 'Bio Kurs')], 1]);
			userService.findByIds.mockResolvedValue([user('user-2', 'Bio', 'Lehrer')]);

			const results = await service.search('user-1', 'school-1', 'Bio', 10);

			expect(results.map((result) => result.type)).toEqual([
				QuickSearchResultType.ROOM,
				QuickSearchResultType.COURSE,
				QuickSearchResultType.PERSON,
				QuickSearchResultType.ROOM,
			]);
		});
	});

	describe('when a person shares a room with the searcher', () => {
		it('links to the members page of that room and leaves the searcher out', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-1', 'user-2']),
			]);
			userService.findByIds.mockResolvedValue([user('user-2', 'Lina', 'Okoro')]);

			const results = await service.search('user-1', 'school-1', 'Lina', 10);

			expect(userService.findByIds).toHaveBeenCalledWith(['user-2'], false);
			expect(results).toEqual([
				{
					id: 'user-2',
					type: QuickSearchResultType.PERSON,
					title: 'Lina Okoro',
					subtitle: '',
					url: '/rooms/room-1/members',
				},
			]);
		});
	});

	describe('when the searcher shares no room with anybody', () => {
		it('does not ask for users at all', async () => {
			await service.search('user-1', 'school-1', 'Lina', 10);

			expect(userService.findByIds).not.toHaveBeenCalled();
		});
	});

	describe('when the user may not open a room', () => {
		it('neither returns the room nor the people in it', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-1', 'user-2']),
			]);
			roomRule.can.mockReturnValue(false);

			const results = await service.search('user-1', 'school-1', 'Lina', 10);

			expect(roomService.getRoomsByIds).toHaveBeenCalledWith([]);
			expect(userService.findByIds).not.toHaveBeenCalled();
			expect(results).toEqual([]);
		});
	});

	describe('when the user may open a room but not read its member list', () => {
		it('returns the room and keeps the names to itself', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-1', 'user-2']),
			]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Lina Raum')]);
			roomRule.can.mockImplementation((operation: RoomOperation) => operation !== 'getRoomMembers');

			const results = await service.search('user-1', 'school-1', 'Lina', 10);

			expect(userService.findByIds).not.toHaveBeenCalled();
			expect(results.map((result) => result.type)).toEqual([QuickSearchResultType.ROOM]);
		});
	});

	describe('when somebody has only applied to the room', () => {
		it('does not ask for them, because the member list hides applicants too', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-1'], ['user-3']),
			]);

			await service.search('user-1', 'school-1', 'Lina', 10);

			expect(userService.findByIds).not.toHaveBeenCalled();
		});
	});

	describe('when a person has been deleted', () => {
		it('leaves them out of the results', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([
				authorizable('room-1', ['user-1', 'user-2']),
			]);
			userService.findByIds.mockResolvedValue([user('user-2', 'Lina', 'Okoro', new Date())]);

			const results = await service.search('user-1', 'school-1', 'Lina', 10);

			expect(results).toEqual([]);
		});
	});

	describe('when more results match than asked for', () => {
		it('returns at most the limit', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([authorizable('room-1', [])]);
			roomService.getRoomsByIds.mockResolvedValue([
				room('room-1', 'Bio 1'),
				room('room-2', 'Bio 2'),
				room('room-3', 'Bio 3'),
			]);

			const results = await service.search('user-1', 'school-1', 'Bio', 2);

			expect(results).toHaveLength(2);
		});
	});

	describe('when nothing matches', () => {
		it('returns nothing', async () => {
			roomMembershipService.getRoomAuthorizablesByUserId.mockResolvedValue([authorizable('room-1', [])]);
			roomService.getRoomsByIds.mockResolvedValue([room('room-1', 'Ökosystem See')]);

			const results = await service.search('user-1', 'school-1', 'Chemie', 10);

			expect(results).toEqual([]);
		});
	});
});
