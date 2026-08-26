import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { CopyStatusEnum, type CopyStatus } from '@modules/copy-helper';
import { CourseService } from '@modules/course';
import { CourseEntity } from '@modules/course/repo';
import { courseEntityFactory } from '@modules/course/testing';
import { CourseCopyService } from '@modules/learnroom';
import { roomFactory } from '@modules/room/testing';
import { RoomService } from '@modules/room';
import { RoomMembershipService } from '@modules/room-membership';
import { SagaService } from '@modules/saga';
import { FormerMembership, type UserDo, UserService } from '@modules/user';
import { userDoFactory } from '@modules/user/testing';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ObjectId } from '@mikro-orm/mongodb';
import { setupEntities } from '@testing/database';
import { FormerMembershipUc } from './former-membership.uc';

describe('FormerMembershipUc', () => {
	let module: TestingModule;
	let uc: FormerMembershipUc;
	let userService: DeepMocked<UserService>;
	let courseService: DeepMocked<CourseService>;
	let roomService: DeepMocked<RoomService>;
	let roomMembershipService: DeepMocked<RoomMembershipService>;
	let courseCopyService: DeepMocked<CourseCopyService>;
	let sagaService: DeepMocked<SagaService>;

	beforeAll(async () => {
		module = await Test.createTestingModule({
			providers: [
				FormerMembershipUc,
				{ provide: UserService, useValue: createMock<UserService>() },
				{ provide: CourseService, useValue: createMock<CourseService>() },
				{ provide: RoomService, useValue: createMock<RoomService>() },
				{ provide: RoomMembershipService, useValue: createMock<RoomMembershipService>() },
				{ provide: CourseCopyService, useValue: createMock<CourseCopyService>() },
				{ provide: SagaService, useValue: createMock<SagaService>() },
			],
		}).compile();

		uc = module.get(FormerMembershipUc);
		userService = module.get(UserService);
		courseService = module.get(CourseService);
		roomService = module.get(RoomService);
		roomMembershipService = module.get(RoomMembershipService);
		courseCopyService = module.get(CourseCopyService);
		sagaService = module.get(SagaService);

		await setupEntities([CourseEntity]);
	});

	afterAll(async () => {
		await module.close();
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	const buildCourseEntry = (): FormerMembership =>
		new FormerMembership({
			type: 'course',
			refId: new ObjectId().toHexString(),
			schoolId: new ObjectId().toHexString(),
			removedAt: new Date(),
		});

	const buildRoomEntry = (): FormerMembership =>
		new FormerMembership({
			type: 'room',
			refId: new ObjectId().toHexString(),
			schoolId: new ObjectId().toHexString(),
			removedAt: new Date(),
		});

	const setupUserWithEntries = (entries: FormerMembership[]): UserDo => {
		const user = userDoFactory.build({ formerMemberships: entries });
		userService.findById.mockResolvedValueOnce(user);

		return user;
	};

	describe('list', () => {
		it('resolves course and room entries to display items', async () => {
			const courseEntry = buildCourseEntry();
			const roomEntry = buildRoomEntry();
			setupUserWithEntries([courseEntry, roomEntry]);

			const course = courseEntityFactory.build({ name: 'My course' });
			courseService.findById.mockResolvedValueOnce(course);

			const room = roomFactory.build({ name: 'My room' });
			roomMembershipService.getRoomIdByUserGroupId.mockResolvedValueOnce(room.id);
			roomService.getSingleRoom.mockResolvedValueOnce(room);

			const result = await uc.list('user-id');

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ type: 'course', refId: courseEntry.refId, name: 'My course' });
			expect(result[1]).toMatchObject({ type: 'room', refId: roomEntry.refId, name: 'My room' });
			expect(userService.save).not.toHaveBeenCalled();
		});

		it('drops stale entries silently and does not return them', async () => {
			const staleCourseEntry = buildCourseEntry();
			const user = setupUserWithEntries([staleCourseEntry]);
			courseService.findById.mockRejectedValueOnce(new NotFoundException());

			const result = await uc.list('user-id');

			expect(result).toHaveLength(0);
			expect(userService.save).toHaveBeenCalledWith(expect.objectContaining({ formerMemberships: [] }));
			expect(user.formerMemberships).toEqual([]);
		});
	});

	describe('reclaim', () => {
		describe('when the entry does not exist', () => {
			it('throws NotFoundException', async () => {
				setupUserWithEntries([]);

				await expect(uc.reclaim('user-id', 'course', 'unknown-id')).rejects.toThrow(NotFoundException);
			});
		});

		describe('course reclaim', () => {
			it('drops the entry and returns false when the course no longer exists (stale)', async () => {
				const entry = buildCourseEntry();
				const user = setupUserWithEntries([entry]);
				courseService.findById.mockRejectedValueOnce(new NotFoundException());

				const result = await uc.reclaim('user-id', 'course', entry.refId);

				expect(result).toBe(false);
				expect(courseCopyService.copyCourse).not.toHaveBeenCalled();
				expect(user.formerMemberships).toEqual([]);
			});

			it('copies the course into the current school and drops the entry on success', async () => {
				const entry = buildCourseEntry();
				const user = setupUserWithEntries([entry]);
				courseService.findById.mockResolvedValueOnce(courseEntityFactory.build());
				const copyStatus: CopyStatus = { title: 'copy', type: 'COURSE' as never, status: CopyStatusEnum.SUCCESS };
				courseCopyService.copyCourse.mockResolvedValueOnce(copyStatus);

				const result = await uc.reclaim('user-id', 'course', entry.refId);

				expect(result).toBe(true);
				expect(courseCopyService.copyCourse).toHaveBeenCalledWith({ userId: 'user-id', courseId: entry.refId });
				expect(user.formerMemberships).toEqual([]);
			});

			it('keeps the entry and propagates the error when the copy fails/throws', async () => {
				const entry = buildCourseEntry();
				const user = setupUserWithEntries([entry]);
				courseService.findById.mockResolvedValueOnce(courseEntityFactory.build());
				courseCopyService.copyCourse.mockRejectedValueOnce(new Error('copy boom'));

				await expect(uc.reclaim('user-id', 'course', entry.refId)).rejects.toThrow('copy boom');

				expect(user.formerMemberships).toEqual([entry]);
				expect(userService.save).not.toHaveBeenCalled();
			});

			it('keeps the entry and returns false when the copy reports a failure status', async () => {
				const entry = buildCourseEntry();
				const user = setupUserWithEntries([entry]);
				courseService.findById.mockResolvedValueOnce(courseEntityFactory.build());
				const copyStatus: CopyStatus = { title: 'copy', type: 'COURSE' as never, status: CopyStatusEnum.FAIL };
				courseCopyService.copyCourse.mockResolvedValueOnce(copyStatus);

				const result = await uc.reclaim('user-id', 'course', entry.refId);

				expect(result).toBe(false);
				expect(user.formerMemberships).toEqual([entry]);
				expect(userService.save).not.toHaveBeenCalled();
			});
		});

		describe('room reclaim', () => {
			it('drops the entry and returns false when the room-access group no longer resolves to a room (stale)', async () => {
				const entry = buildRoomEntry();
				const user = setupUserWithEntries([entry]);
				roomMembershipService.getRoomIdByUserGroupId.mockResolvedValueOnce(null);

				const result = await uc.reclaim('user-id', 'room', entry.refId);

				expect(result).toBe(false);
				expect(sagaService.executeSaga).not.toHaveBeenCalled();
				expect(user.formerMemberships).toEqual([]);
			});

			it('copies the room into the current school via the roomCopy saga and drops the entry on success', async () => {
				const entry = buildRoomEntry();
				const user = setupUserWithEntries([entry]);
				const roomId = new ObjectId().toHexString();
				roomMembershipService.getRoomIdByUserGroupId.mockResolvedValueOnce(roomId);
				sagaService.executeSaga.mockResolvedValueOnce({
					roomCopied: roomFactory.build(),
					boardsCopied: [],
				} as never);

				const result = await uc.reclaim('user-id', 'room', entry.refId);

				expect(result).toBe(true);
				expect(sagaService.executeSaga).toHaveBeenCalledWith('roomCopy', { userId: 'user-id', roomId });
				expect(user.formerMemberships).toEqual([]);
			});

			it('keeps the entry and propagates the error when the saga throws', async () => {
				const entry = buildRoomEntry();
				const user = setupUserWithEntries([entry]);
				roomMembershipService.getRoomIdByUserGroupId.mockResolvedValueOnce(new ObjectId().toHexString());
				sagaService.executeSaga.mockRejectedValueOnce(new Error('saga boom'));

				await expect(uc.reclaim('user-id', 'room', entry.refId)).rejects.toThrow('saga boom');

				expect(user.formerMemberships).toEqual([entry]);
				expect(userService.save).not.toHaveBeenCalled();
			});
		});
	});

	describe('discard', () => {
		it('throws NotFoundException when the entry does not exist', async () => {
			setupUserWithEntries([]);

			await expect(uc.discard('user-id', 'course', 'unknown-id')).rejects.toThrow(NotFoundException);
		});

		it('removes only the matching entry, without reclaiming anything', async () => {
			const toDiscard = buildCourseEntry();
			const toKeep = buildRoomEntry();
			const user = setupUserWithEntries([toDiscard, toKeep]);

			await uc.discard('user-id', 'course', toDiscard.refId);

			expect(courseCopyService.copyCourse).not.toHaveBeenCalled();
			expect(sagaService.executeSaga).not.toHaveBeenCalled();
			expect(user.formerMemberships).toEqual([toKeep]);
			expect(userService.save).toHaveBeenCalledWith(user);
		});
	});
});
