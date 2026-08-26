import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { Test, type TestingModule } from '@nestjs/testing';
import { currentUserFactory } from '@testing/factory/currentuser.factory';
import {
	FormerMembershipListItemResponse,
	type FormerMembershipUrlParams,
	ReclaimFormerMembershipResponse,
} from './dto';
import { FormerMembershipController } from './former-membership.controller';
import { FormerMembershipUc } from './former-membership.uc';

describe('FormerMembershipController', () => {
	let module: TestingModule;
	let sut: FormerMembershipController;
	let ucMock: DeepMocked<FormerMembershipUc>;

	beforeAll(async () => {
		module = await Test.createTestingModule({
			controllers: [FormerMembershipController],
			providers: [
				{
					provide: FormerMembershipUc,
					useValue: createMock<FormerMembershipUc>(),
				},
			],
		}).compile();

		sut = module.get(FormerMembershipController);
		ucMock = module.get(FormerMembershipUc);
	});

	afterAll(async () => {
		await module.close();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	const currentUser = currentUserFactory.build();
	const params: FormerMembershipUrlParams = { type: 'course', refId: 'course-id' };

	describe('list', () => {
		it("delegates to the uc with the current user's id and returns its items", async () => {
			const items = [
				new FormerMembershipListItemResponse({
					type: 'course',
					refId: 'course-id',
					name: 'My course',
					schoolId: 'school-id',
					removedAt: new Date(),
				}),
			];
			ucMock.list.mockResolvedValueOnce(items);

			const result = await sut.list(currentUser);

			expect(ucMock.list).toHaveBeenCalledWith(currentUser.userId);
			expect(result).toEqual(items);
		});
	});

	describe('reclaim', () => {
		it('delegates to the uc and wraps the result in a ReclaimFormerMembershipResponse', async () => {
			ucMock.reclaim.mockResolvedValueOnce(true);

			const result = await sut.reclaim(currentUser, params);

			expect(ucMock.reclaim).toHaveBeenCalledWith(currentUser.userId, params.type, params.refId);
			expect(result).toEqual(new ReclaimFormerMembershipResponse(true));
		});

		it('propagates reclaimed=false when the uc reports the target as stale', async () => {
			ucMock.reclaim.mockResolvedValueOnce(false);

			const result = await sut.reclaim(currentUser, params);

			expect(result).toEqual(new ReclaimFormerMembershipResponse(false));
		});
	});

	describe('discard', () => {
		it('delegates to the uc with no response body', async () => {
			ucMock.discard.mockResolvedValueOnce();

			const result = await sut.discard(currentUser, params);

			expect(ucMock.discard).toHaveBeenCalledWith(currentUser.userId, params.type, params.refId);
			expect(result).toBeUndefined();
		});
	});
});
