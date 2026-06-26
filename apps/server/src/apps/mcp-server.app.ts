/* istanbul ignore file */
import { LegacyLogger, Logger } from '@core/logger';
import { McpServerModule } from '@modules/mcp-server/mcp-server.app.module';
import { MCP_SERVER_CONFIG_TOKEN, McpServerConfig } from '@modules/mcp-server/mcp-server.config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { install as sourceMapInstall } from 'source-map-support';
import { AppStartLoggable } from './helpers';

async function bootstrap(): Promise<void> {
	sourceMapInstall();

	const nestMcpExpress = express();
	const nestMcpExpressAdapter = new ExpressAdapter(nestMcpExpress);
	nestMcpExpressAdapter.disable('x-powered-by');

	const nestMcpApp = await NestFactory.create<NestExpressApplication>(McpServerModule, nestMcpExpressAdapter);

	const logger = await nestMcpApp.resolve(Logger);
	const legacyLogger = await nestMcpApp.resolve(LegacyLogger);
	nestMcpApp.useLogger(legacyLogger);
	nestMcpApp.enableCors();
	nestMcpApp.useBodyParser('json', { limit: '4mb' });

	await nestMcpApp.init();

	const mcpServerConfig = await nestMcpApp.resolve<McpServerConfig>(MCP_SERVER_CONFIG_TOKEN);
	const mcpServerPort = mcpServerConfig.port;

	nestMcpExpress.listen(mcpServerPort, () => {
		logger.info(
			new AppStartLoggable({
				appName: 'MCP server app',
				port: mcpServerPort,
				mountsDescription: `/mcp --> MCP server (Streamable HTTP)`,
			})
		);
	});
}

void bootstrap();
