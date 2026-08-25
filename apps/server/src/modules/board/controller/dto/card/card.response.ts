import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { DecodeHtmlEntities } from '@shared/controller/transformer';
import {
	AnyContentElementResponse,
	CollaborativeTextEditorElementResponse,
	DeletedElementResponse,
	DrawingElementResponse,
	ExternalToolElementResponse,
	FileElementResponse,
	FileFolderElementResponse,
	H5pElementResponse,
	LinkElementResponse,
	ChecklistElementResponse,
	CodeElementResponse,
	DeadlineElementResponse,
	FormulaElementResponse,
	PollElementResponse,
	RichTextElementResponse,
	VideoConferenceElementResponse,
} from '../element';
import { TimestampsResponse } from '../timestamps.response';
import { CardCommentResponse } from './card-comment.response';
import { CardReactionsResponse } from './card-reactions.response';
import { VisibilitySettingsResponse } from './visibility-settings.response';
import { Colors } from '../../../domain';

@ApiExtraModels(
	ExternalToolElementResponse,
	FileElementResponse,
	LinkElementResponse,
	RichTextElementResponse,
	DrawingElementResponse,
	CollaborativeTextEditorElementResponse,
	DeletedElementResponse,
	VideoConferenceElementResponse,
	FileFolderElementResponse,
	H5pElementResponse,
	PollElementResponse,
	DeadlineElementResponse,
	CodeElementResponse,
	FormulaElementResponse,
	ChecklistElementResponse
)
export class CardResponse {
	constructor({
		id,
		title,
		backgroundColor,
		height,
		elements,
		visibilitySettings,
		timestamps,
		reactions,
		comments,
	}: CardResponse) {
		this.id = id;
		this.title = title;
		this.backgroundColor = backgroundColor;
		this.height = height;
		this.elements = elements;
		this.visibilitySettings = visibilitySettings;
		this.timestamps = timestamps;
		this.reactions = reactions;
		this.comments = comments;
	}

	@ApiProperty({
		pattern: bsonStringPattern,
	})
	id: string;

	@ApiPropertyOptional()
	@DecodeHtmlEntities()
	title?: string;

	@ApiProperty({ enum: Colors, enumName: 'Colors' })
	backgroundColor: Colors;

	@ApiProperty()
	height: number;

	@ApiProperty({
		type: 'array',
		items: {
			oneOf: [
				{ $ref: getSchemaPath(ExternalToolElementResponse) },
				{ $ref: getSchemaPath(FileElementResponse) },
				{ $ref: getSchemaPath(LinkElementResponse) },
				{ $ref: getSchemaPath(RichTextElementResponse) },
				{ $ref: getSchemaPath(DrawingElementResponse) },
				{ $ref: getSchemaPath(CollaborativeTextEditorElementResponse) },
				{ $ref: getSchemaPath(DeletedElementResponse) },
				{ $ref: getSchemaPath(VideoConferenceElementResponse) },
				{ $ref: getSchemaPath(FileFolderElementResponse) },
				{ $ref: getSchemaPath(H5pElementResponse) },
				{ $ref: getSchemaPath(PollElementResponse) },
				{ $ref: getSchemaPath(DeadlineElementResponse) },
				{ $ref: getSchemaPath(CodeElementResponse) },
				{ $ref: getSchemaPath(FormulaElementResponse) },
				{ $ref: getSchemaPath(ChecklistElementResponse) },
			],
		},
	})
	elements: AnyContentElementResponse[];

	@ApiProperty()
	visibilitySettings: VisibilitySettingsResponse;

	@ApiProperty()
	timestamps: TimestampsResponse;

	@ApiPropertyOptional({
		type: CardReactionsResponse,
		description: 'Absent while the board has reactions turned off.',
	})
	reactions?: CardReactionsResponse;

	@ApiPropertyOptional({
		type: [CardCommentResponse],
		description: 'Absent while the board has comments turned off.',
	})
	comments?: CardCommentResponse[];
}
