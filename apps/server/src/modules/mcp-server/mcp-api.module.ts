import { CourseApiModule } from '@modules/course/course-api.module';
import { RoomApiModule } from '@modules/room/room-api.module';
import { Module } from '@nestjs/common';
import { McpController } from './api/mcp.controller';
import { McpServerFactory } from './api/mcp-server.factory';

/**
 * Mounts the MCP endpoint inside a host server app (e.g. the main server) so it shares
 * that app's JWT auth and session whitelist — the same process the iOS client and the
 * in-app assistant already authenticate against. No separate process / session store.
 *
 * The host app must provide the database and the JWT auth guard (the main ServerModule
 * already does); this module only adds the controller, the tool factory and the
 * room/course use-cases it drives.
 */
@Module({
	imports: [RoomApiModule, CourseApiModule],
	controllers: [McpController],
	providers: [McpServerFactory],
})
export class McpApiModule {}
