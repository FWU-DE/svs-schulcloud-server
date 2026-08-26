import { MikroORM, EnsureRequestContext } from '@mikro-orm/core';
import { FormerMembership, UserService } from '@modules/user';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserChangedSchoolEvent } from '../../../user/domain/events/user-changed-school.event';
import { CourseRepo } from '../../repo/course.repo';

@Injectable()
@EventsHandler(UserChangedSchoolEvent)
export class UserChangedSchoolHandlerService implements IEventHandler<UserChangedSchoolEvent> {
	constructor(
		private readonly courseRepo: CourseRepo,
		private readonly userService: UserService,
		private readonly orm: MikroORM
	) {}

	@EnsureRequestContext()
	public async handle(event: UserChangedSchoolEvent): Promise<void> {
		const removedCourseIds = await this.courseRepo.removeUserFromCourses(event.userId, event.oldSchoolId);

		const removedAt = new Date();
		const formerMemberships: FormerMembership[] = removedCourseIds.map(
			(courseId) =>
				new FormerMembership({
					type: 'course',
					refId: courseId,
					schoolId: event.oldSchoolId,
					removedAt,
				})
		);

		await this.userService.appendFormerMemberships(event.userId, formerMemberships);
	}
}
