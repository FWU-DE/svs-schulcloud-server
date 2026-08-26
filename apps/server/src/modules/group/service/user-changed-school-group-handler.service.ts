import { MikroORM, EnsureRequestContext } from '@mikro-orm/core';
import { FormerMembership, UserService } from '@modules/user';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserChangedSchoolEvent } from '../../user/domain/events/user-changed-school.event';
import { GroupRepo } from '../repo/group.repo';

@Injectable()
@EventsHandler(UserChangedSchoolEvent)
export class UserChangedSchoolGroupHandlerService implements IEventHandler<UserChangedSchoolEvent> {
	constructor(
		private readonly groupRepo: GroupRepo,
		private readonly userService: UserService,
		private readonly orm: MikroORM
	) {}

	@EnsureRequestContext()
	public async handle(event: UserChangedSchoolEvent): Promise<void> {
		// Only room-backing groups are snapshotted here: a room has no membership of its own, so
		// losing this group membership is what makes the room disappear for the user. The snapshot
		// stores the group id, not the room id — room-memberships is resolved at reclaim/list time.
		const affectedRoomGroupIds = await this.groupRepo.findRoomGroupIdsForUser(event.userId);

		await this.groupRepo.removeUserReference(event.userId);

		const removedAt = new Date();
		const formerMemberships: FormerMembership[] = affectedRoomGroupIds.map(
			(groupId) =>
				new FormerMembership({
					type: 'room',
					refId: groupId,
					schoolId: event.oldSchoolId,
					removedAt,
				})
		);

		await this.userService.appendFormerMemberships(event.userId, formerMemberships);
	}
}
