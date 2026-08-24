import { ErrorResponse } from '@core/error/dto';
import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RoomAiTemplateBodyParams } from './dto/request/room-ai-template.body.params';
import { RoomAiTemplateUc } from './room-ai-template.uc';

@ApiTags('Room')
@JwtAuthentication()
@Controller('rooms')
export class RoomAiTemplateController {
	constructor(private readonly roomAiTemplateUc: RoomAiTemplateUc) {}

	@ApiOperation({
		summary: 'Suggest a room structure for a description',
		description:
			'Streams the suggestion as newline delimited json, one item per line, so that the client can show the structure while it is generated.',
	})
	@ApiResponse({ status: 201, description: 'Stream of newline delimited room structure items' })
	@ApiResponse({ status: 400, type: ErrorResponse })
	@ApiResponse({ status: 403, type: ErrorResponse })
	@ApiResponse({ status: 500, type: ErrorResponse })
	@Post('ai-template')
	public async generateAiTemplate(
		@CurrentUser() currentUser: ICurrentUser,
		@Body() body: RoomAiTemplateBodyParams,
		@Res() response: Response
	): Promise<void> {
		const items = this.roomAiTemplateUc.generateTemplate(currentUser.userId, body);

		try {
			for await (const item of items) {
				if (!response.headersSent) {
					response.status(201);
					response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
					response.setHeader('Cache-Control', 'no-cache');
				}
				response.write(`${JSON.stringify(item)}\n`);
				// compression middleware buffers otherwise, and the client wants to see the items arrive
				(response as Response & { flush?: () => void }).flush?.();
			}
		} catch (error: unknown) {
			// nothing was sent yet, so the request can still fail like any other request
			if (!response.headersSent) throw error;

			response.write(`${JSON.stringify({ type: 'error' })}\n`);
		}

		response.end();
	}
}
