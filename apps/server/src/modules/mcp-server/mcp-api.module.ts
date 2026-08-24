import { LoggerModule } from '@core/logger';
import { AuthorizationModule } from '@modules/authorization';
import { BoardModule } from '@modules/board';
import { BoardApiModule } from '@modules/board/board-api.module';
import { CourseApiModule } from '@modules/course/course-api.module';
import { RoomApiModule } from '@modules/room/room-api.module';
import { Module } from '@nestjs/common';
import { McpServerFactory } from './api/mcp-server.factory';
import { McpController } from './api/mcp.controller';
import { BoardTools, CourseTools, RoomTools } from './api/tools';

/**
 * Mounts the MCP endpoint inside a host server app (e.g. the main server) so it shares
 * that app's JWT auth and session whitelist — the same process the iOS client and the
 * in-app assistant already authenticate against. No separate process / session store.
 *
 * The host app must provide the database and the JWT auth guard (the main ServerModule
 * already does); this module only adds the controller, the tool groups and the
 * room/course/board use-cases they drive.
 */
@Module({
	imports: [RoomApiModule, CourseApiModule, BoardApiModule, BoardModule, AuthorizationModule, LoggerModule],
	controllers: [McpController],
	providers: [McpServerFactory, RoomTools, CourseTools, BoardTools],
})
export class McpApiModule {}
