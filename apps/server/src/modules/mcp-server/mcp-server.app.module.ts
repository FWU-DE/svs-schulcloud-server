import { LoggerModule } from '@core/logger';
import { ValidationModule } from '@core/validation';
import { AuthGuardModule, AuthGuardOptions, JWT_AUTH_GUARD_CONFIG_TOKEN, JwtAuthGuardConfig } from '@infra/auth-guard';
import { ConfigurationModule } from '@infra/configuration';
import { DATABASE_CONFIG_TOKEN, DatabaseConfig, DatabaseModule } from '@infra/database';
import { CourseApiModule } from '@modules/course/course-api.module';
import { RoomApiModule } from '@modules/room/room-api.module';
import { ENTITIES } from '@modules/server/server.entity.imports';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { McpController } from './api/mcp.controller';
import { McpServerFactory } from './api/mcp-server.factory';
import { MCP_SERVER_CONFIG_TOKEN, McpServerConfig } from './mcp-server.config';

@Module({
	imports: [
		ConfigurationModule.register(MCP_SERVER_CONFIG_TOKEN, McpServerConfig),
		ValidationModule,
		LoggerModule,
		CqrsModule,
		AuthGuardModule.register([
			{
				option: AuthGuardOptions.JWT,
				configInjectionToken: JWT_AUTH_GUARD_CONFIG_TOKEN,
				configConstructor: JwtAuthGuardConfig,
			},
		]),
		DatabaseModule.register({
			configInjectionToken: DATABASE_CONFIG_TOKEN,
			configConstructor: DatabaseConfig,
			entities: ENTITIES,
		}),
		RoomApiModule,
		CourseApiModule,
	],
	controllers: [McpController],
	providers: [McpServerFactory],
})
export class McpServerModule {}
