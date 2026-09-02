import { InternalServerErrorException } from '@nestjs/common';
import { type BoardOperation } from '../../authorisation/board-node.rule';
import { type BoardFeature, type CardReactionType, Column, type ColumnBoard } from '../../domain';
import { BoardResponse, TimestampsResponse } from '../dto';
import { ColumnResponseMapper } from './column-response.mapper';

export class BoardResponseMapper {
	public static mapToResponse(
		board: ColumnBoard,
		features: BoardFeature[],
		allowedOperations: Record<BoardOperation, boolean>,
		roomDefaults: { commentsEnabled: boolean; reactionType: CardReactionType }
	): BoardResponse {
		const result = new BoardResponse({
			id: board.id,
			title: board.title,
			columns: board.children.map((column) => {
				/* istanbul ignore next */
				if (!(column instanceof Column)) {
					throw new InternalServerErrorException(`unsupported child type: ${column.constructor.name}`);
				}
				return ColumnResponseMapper.mapToResponse(column);
			}),
			timestamps: new TimestampsResponse({ lastUpdatedAt: board.updatedAt, createdAt: board.createdAt }),
			isVisible: board.isVisible,
			readersCanEdit: board.readersCanEdit,
			reactionType: board.reactionType ?? null,
			commentsEnabled: board.commentsEnabled ?? null,
			roomReactionType: roomDefaults.reactionType,
			roomCommentsEnabled: roomDefaults.commentsEnabled,
			layout: board.layout,
			features,
			allowedOperations,
		});
		return result;
	}
}
