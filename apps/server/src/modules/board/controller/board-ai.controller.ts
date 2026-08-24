import { ErrorResponse } from '@core/error/dto';
import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequestTimeout } from '@shared/common/decorators';
import { Response } from 'express';
import { BOARD_INCOMING_REQUEST_TIMEOUT_AI_CARDS_KEY } from '../timeout.config';
import { BoardAiUc } from '../uc/board-ai.uc';
import { BoardAiCard } from '../service/board-ai-cards.service';
import { BoardAiCardsBodyParams } from './dto/board-ai-cards.body.params';

@ApiTags('Board')
@JwtAuthentication()
@Controller()
export class BoardAiController {
	constructor(private readonly boardAiUc: BoardAiUc) {}

	@ApiOperation({
		summary: 'Suggest cards for an existing card',
		description:
			'Streams the suggestion as newline delimited json, one card per line, so that the client can show the cards while they are written. Nothing is changed on the board - the client inserts the cards the teacher accepts.',
	})
	@ApiResponse({ status: 201, description: 'Stream of newline delimited cards' })
	@ApiResponse({ status: 400, type: ErrorResponse })
	@ApiResponse({ status: 403, type: ErrorResponse })
	@RequestTimeout(BOARD_INCOMING_REQUEST_TIMEOUT_AI_CARDS_KEY)
	@Post('cards/:cardId/ai-cards')
	public async suggestCardsForCard(
		@CurrentUser() currentUser: ICurrentUser,
		@Param('cardId') cardId: string,
		@Body() body: BoardAiCardsBodyParams,
		@Res() response: Response
	): Promise<void> {
		const cards = this.boardAiUc.suggestCardsForCard(currentUser.userId, cardId, body.preset, body.prompt);

		await this.streamCards(cards, response);
	}

	@ApiOperation({
		summary: 'Suggest cards for a whole column',
		description: 'Like the card variant, but the ai reads every card of the column as its material.',
	})
	@ApiResponse({ status: 201, description: 'Stream of newline delimited cards' })
	@ApiResponse({ status: 400, type: ErrorResponse })
	@ApiResponse({ status: 403, type: ErrorResponse })
	@RequestTimeout(BOARD_INCOMING_REQUEST_TIMEOUT_AI_CARDS_KEY)
	@Post('columns/:columnId/ai-cards')
	public async suggestCardsForColumn(
		@CurrentUser() currentUser: ICurrentUser,
		@Param('columnId') columnId: string,
		@Body() body: BoardAiCardsBodyParams,
		@Res() response: Response
	): Promise<void> {
		const cards = this.boardAiUc.suggestCardsForColumn(currentUser.userId, columnId, body.preset, body.prompt);

		await this.streamCards(cards, response);
	}

	private async streamCards(cards: AsyncGenerator<BoardAiCard>, response: Response): Promise<void> {
		try {
			for await (const card of cards) {
				if (!response.headersSent) {
					response.status(201);
					response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
					response.setHeader('Cache-Control', 'no-cache');
				}
				response.write(`${JSON.stringify(card)}\n`);
				// compression middleware buffers otherwise, and the client wants to see the cards arrive
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
