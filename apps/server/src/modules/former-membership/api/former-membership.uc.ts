import { CopyStatusEnum } from '@modules/copy-helper';
import { CourseService } from '@modules/course';
import { CourseCopyService } from '@modules/learnroom';
import { RoomMembershipService } from '@modules/room-membership';
import { RoomService } from '@modules/room';
import { SagaService } from '@modules/saga';
import { FormerMembership, type FormerMembershipType, UserDo, UserService } from '@modules/user';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';
import { FormerMembershipListItemResponse } from './dto';

@Injectable()
export class FormerMembershipUc {
	constructor(
		private readonly userService: UserService,
		private readonly courseService: CourseService,
		private readonly roomService: RoomService,
		private readonly roomMembershipService: RoomMembershipService,
		private readonly courseCopyService: CourseCopyService,
		private readonly sagaService: SagaService
	) {}

	// Lists the current user's own former memberships, resolved to a display name. Entries whose
	// target has since been deleted are dropped silently - there's nothing left to reclaim.
	public async list(userId: EntityId): Promise<FormerMembershipListItemResponse[]> {
		const user = await this.userService.findById(userId);
		const entries = user.formerMemberships ?? [];

		const resolved = await Promise.all(entries.map((entry) => this.resolveEntry(entry)));
		const items: FormerMembershipListItemResponse[] = [];
		const stale: FormerMembership[] = [];

		resolved.forEach((item, index) => {
			if (item) {
				items.push(item);
			} else {
				stale.push(entries[index]);
			}
		});

		if (stale.length > 0) {
			await this.dropEntries(user, stale);
		}

		return items;
	}

	// Reclaiming means copying the course/room into the user's CURRENT school, leaving the
	// original untouched for any members still at the old school - not restoring membership on
	// the original, which would be invisible to the user anyway (course/room listings filter by
	// current schoolId).
	// Stale (target since deleted) -> drop the entry and return false, nothing to retry.
	// Failed (copy threw) -> keep the entry so the user can retry, and propagate the exception -
	// this is also the fix for the former bug where the entry was dropped unconditionally.
	public async reclaim(userId: EntityId, type: FormerMembershipType, refId: EntityId): Promise<boolean> {
		const user = await this.userService.findById(userId);
		const entry = this.findEntry(user, type, refId);

		if (entry.type === 'course') {
			const courseStillExists = await this.courseExists(entry.refId);
			if (!courseStillExists) {
				await this.dropEntries(user, [entry]);
				return false;
			}

			const reclaimed = await this.reclaimCourse(userId, entry);
			if (reclaimed) {
				await this.dropEntries(user, [entry]);
			}
			return reclaimed;
		}

		const roomId = await this.roomMembershipService.getRoomIdByUserGroupId(entry.refId);
		if (!roomId) {
			await this.dropEntries(user, [entry]);
			return false;
		}

		const reclaimed = await this.reclaimRoom(userId, roomId);
		if (reclaimed) {
			await this.dropEntries(user, [entry]);
		}
		return reclaimed;
	}

	// Explicitly discard a snapshot without acting on it - e.g. the user decides they don't want
	// the old course/room after all. Only ever touches the caller's own snapshot array, same as
	// reclaim, so no separate authorization check is needed here either.
	public async discard(userId: EntityId, type: FormerMembershipType, refId: EntityId): Promise<void> {
		const user = await this.userService.findById(userId);
		const entry = this.findEntry(user, type, refId);

		await this.dropEntries(user, [entry]);
	}

	private async resolveEntry(entry: FormerMembership): Promise<FormerMembershipListItemResponse | null> {
		if (entry.type === 'course') {
			try {
				const course = await this.courseService.findById(entry.refId);

				return new FormerMembershipListItemResponse({
					type: entry.type,
					refId: entry.refId,
					name: course.name,
					schoolId: entry.schoolId,
					removedAt: entry.removedAt,
				});
			} catch {
				return null;
			}
		}

		// type 'room': refId is the room-access group id, resolved to the room it still belongs to.
		const roomId = await this.roomMembershipService.getRoomIdByUserGroupId(entry.refId);
		if (!roomId) {
			return null;
		}

		try {
			const room = await this.roomService.getSingleRoom(roomId);

			return new FormerMembershipListItemResponse({
				type: entry.type,
				refId: entry.refId,
				name: room.name,
				schoolId: entry.schoolId,
				removedAt: entry.removedAt,
			});
		} catch {
			return null;
		}
	}

	// Copies the course into the reclaiming user's current school, with them as sole teacher -
	// same "sole owner" model room-copy already uses (ROOMOWNER on the copy), regardless of the
	// user's role on the original. The original course is untouched.
	private async reclaimCourse(userId: EntityId, entry: FormerMembership): Promise<boolean> {
		const copyStatus = await this.courseCopyService.copyCourse({ userId, courseId: entry.refId });

		return copyStatus.status !== CopyStatusEnum.FAIL;
	}

	// Copies the room (and its boards/content) into the reclaiming user's current school via the
	// existing roomCopy saga, with them as owner. The original room is untouched.
	private async reclaimRoom(userId: EntityId, roomId: EntityId): Promise<boolean> {
		const { roomCopied } = await this.sagaService.executeSaga('roomCopy', { userId, roomId });

		return Boolean(roomCopied?.id);
	}

	private async courseExists(courseId: EntityId): Promise<boolean> {
		try {
			await this.courseService.findById(courseId);
			return true;
		} catch {
			return false;
		}
	}

	private findEntry(user: UserDo, type: FormerMembershipType, refId: EntityId): FormerMembership {
		const entries = user.formerMemberships ?? [];
		const entry = entries.find((candidate) => candidate.type === type && candidate.refId === refId);

		if (!entry) {
			throw new NotFoundException('No such former membership for this user.');
		}

		return entry;
	}

	private async dropEntries(user: UserDo, toRemove: FormerMembership[]): Promise<void> {
		user.formerMemberships = (user.formerMemberships ?? []).filter(
			(entry) => !toRemove.some((removed) => removed.type === entry.type && removed.refId === entry.refId)
		);

		await this.userService.save(user);
	}
}
