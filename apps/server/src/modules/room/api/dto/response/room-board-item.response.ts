import { ApiProperty } from '@nestjs/swagger';
import { BoardLayout } from '@modules/board';
import { BoardOperation, BoardOperationValues } from '@modules/board/authorisation/board-node.rule';
import { BoardPreviewResponse } from './board-preview.response';

export class RoomBoardItemResponse {
	@ApiProperty()
	id: string;

	@ApiProperty()
	title: string;

	@ApiProperty({ enum: BoardLayout, enumName: 'BoardLayout' })
	layout: BoardLayout;

	@ApiProperty({ type: Boolean })
	isVisible: boolean;

	@ApiProperty({ type: Date })
	createdAt: Date;

	@ApiProperty({ type: Date })
	updatedAt: Date;

	@ApiProperty({
		type: 'object',
		properties: BoardOperationValues.reduce((acc, op) => {
			acc[op] = { type: 'boolean' };
			return acc;
		}, {}),
		additionalProperties: false,
	})
	allowedOperations: Partial<Record<BoardOperation, boolean>>;

	@ApiProperty({ type: BoardPreviewResponse })
	preview: BoardPreviewResponse;

	constructor(item: RoomBoardItemResponse) {
		this.id = item.id;
		this.title = item.title;
		this.layout = item.layout;
		this.isVisible = item.isVisible;
		this.createdAt = item.createdAt;
		this.updatedAt = item.updatedAt;
		this.allowedOperations = item.allowedOperations;
		this.preview = item.preview;
	}
}
