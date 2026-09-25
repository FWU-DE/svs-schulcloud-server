import { CourseModule } from '@modules/course';
import { RoomModule } from '@modules/room';
import { RoomMembershipModule } from '@modules/room-membership';
import { UserModule } from '@modules/user';
import { Module } from '@nestjs/common';
import { QuickSearchService } from './quick-search.service';

@Module({
	imports: [RoomModule, RoomMembershipModule, CourseModule, UserModule],
	providers: [QuickSearchService],
	exports: [QuickSearchService],
})
export class QuickSearchModule {}
