import { BoardPreview, BoardPreviewCard, BoardPreviewColumn, Colors, ContentElementType } from '@modules/board';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BoardPreviewCardResponse {
	@ApiProperty({ enum: Colors, enumName: 'Colors' })
	backgroundColor: Colors;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType', isArray: true })
	elementTypes: ContentElementType[];

	@ApiProperty({ description: 'The number of elements on the card, including the ones not listed.' })
	elementCount: number;

	constructor(card: BoardPreviewCard) {
		this.backgroundColor = card.backgroundColor;
		this.elementTypes = card.elementTypes;
		this.elementCount = card.elementCount;
	}
}

export class BoardPreviewColumnResponse {
	@ApiPropertyOptional()
	title?: string;

	@ApiProperty({ type: [BoardPreviewCardResponse] })
	cards: BoardPreviewCardResponse[];

	@ApiProperty({ description: 'The number of cards in the column, including the ones not listed.' })
	cardCount: number;

	constructor(column: BoardPreviewColumn) {
		this.title = column.title;
		this.cards = column.cards.map((card) => new BoardPreviewCardResponse(card));
		this.cardCount = column.cardCount;
	}
}

/**
 * The shape of a board without its content, for rendering a thumbnail in a list of boards.
 * Truncated: the counts tell how much is not listed.
 */
export class BoardPreviewResponse {
	@ApiProperty({ type: [BoardPreviewColumnResponse] })
	columns: BoardPreviewColumnResponse[];

	@ApiProperty({ description: 'The number of columns on the board, including the ones not listed.' })
	columnCount: number;

	constructor(preview: BoardPreview) {
		this.columns = preview.columns.map((column) => new BoardPreviewColumnResponse(column));
		this.columnCount = preview.columnCount;
	}
}
