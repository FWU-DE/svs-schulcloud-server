import { CourseModule } from '@modules/course';
import { LearnroomModule } from '@modules/learnroom';
import { RoomModule } from '@modules/room';
import { RoomMembershipModule } from '@modules/room-membership';
import { SagaModule } from '@modules/saga';
import { UserModule } from '@modules/user';
import { Module } from '@nestjs/common';
import { FormerMembershipController, FormerMembershipUc } from './api';

@Module({
	// LearnroomModule provides CourseCopyService, SagaModule provides SagaService - both are used
	// directly by FormerMembershipUc to copy reclaimed courses/rooms into the user's current
	// school. The roomCopy saga's own steps self-register from RoomApiModule/BoardApiModule, which
	// are already loaded app-wide, so nothing further is needed here for those.
	imports: [UserModule, CourseModule, RoomModule, RoomMembershipModule, LearnroomModule, SagaModule],
	controllers: [FormerMembershipController],
	providers: [FormerMembershipUc],
})
export class FormerMembershipApiModule {}
