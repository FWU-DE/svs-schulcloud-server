import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { InputFormat } from '@shared/domain/types';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsDateString,
	IsBoolean,
	IsEnum,
	IsMongoId,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { ContentElementType, MAX_CHECKLIST_ITEMS, PollResultVisibility } from '../../../domain/types';

abstract class ElementContentBody {
	@IsEnum(ContentElementType)
	@ApiProperty({
		enum: ContentElementType,
		description: 'the type of the updated element',
		enumName: 'ContentElementType',
	})
	type!: ContentElementType;
}

export class FileContentBody {
	@IsString()
	@ApiProperty({})
	caption!: string;

	@IsString()
	@ApiProperty({})
	alternativeText!: string;
}

export class FileElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.FILE })
	type!: ContentElementType.FILE;

	@ValidateNested()
	@ApiProperty()
	content!: FileContentBody;
}

export class LinkContentBody {
	@IsString()
	@ApiProperty({})
	url!: string;

	@IsString()
	@IsOptional()
	@ApiProperty({})
	title?: string;

	@IsString()
	@IsOptional()
	@ApiProperty({})
	description?: string;

	@IsString()
	@IsOptional()
	@ApiProperty({})
	imageUrl?: string;

	@IsString()
	@IsOptional()
	@ApiProperty({})
	originalImageUrl?: string;
}

export class LinkElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.LINK })
	type!: ContentElementType.LINK;

	@ValidateNested()
	@ApiProperty({})
	content!: LinkContentBody;
}

export class DrawingContentBody {
	@IsString()
	@ApiProperty()
	description!: string;
}

export class DrawingElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.DRAWING })
	type!: ContentElementType.DRAWING;

	@ValidateNested()
	@ApiProperty()
	content!: DrawingContentBody;
}

export class RichTextContentBody {
	@IsString()
	@ApiProperty()
	text!: string;

	@IsEnum(InputFormat)
	@ApiProperty()
	inputFormat!: InputFormat;
}

export class RichTextElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.RICH_TEXT })
	type!: ContentElementType.RICH_TEXT;

	@ValidateNested()
	@ApiProperty()
	content!: RichTextContentBody;
}

export class ExternalToolContentBody {
	@IsMongoId()
	@IsOptional()
	@ApiPropertyOptional()
	contextExternalToolId?: string;
}

export class ExternalToolElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.EXTERNAL_TOOL })
	type!: ContentElementType.EXTERNAL_TOOL;

	@ValidateNested()
	@ApiProperty()
	content!: ExternalToolContentBody;
}

export class VideoConferenceContentBody {
	@IsString()
	@ApiProperty()
	title!: string;
}

export class VideoConferenceElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.VIDEO_CONFERENCE })
	type!: ContentElementType.VIDEO_CONFERENCE;

	@ValidateNested()
	@ApiProperty()
	content!: VideoConferenceContentBody;
}

export class FileFolderContentBody {
	@IsString()
	@ApiProperty()
	title!: string;
}

export class FileFolderElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.FILE_FOLDER })
	type!: ContentElementType.FILE_FOLDER;

	@ValidateNested()
	@ApiProperty()
	content!: FileFolderContentBody;
}

export class H5pContentBody {
	@IsMongoId()
	@IsOptional()
	@ApiPropertyOptional()
	contentId?: string;
}

export class H5pElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.H5P })
	type!: ContentElementType.H5P;

	@ValidateNested()
	@ApiProperty()
	content!: H5pContentBody;
}

export class PollOptionBody {
	@IsMongoId()
	@IsOptional()
	@ApiPropertyOptional({ description: 'Omit to add a new option. Keeping the id keeps the votes cast for it.' })
	id?: string;

	@IsString()
	@MaxLength(200)
	@ApiProperty()
	text!: string;
}

export class PollContentBody {
	@IsString()
	@MaxLength(500)
	@ApiProperty()
	question!: string;

	@IsArray()
	@ArrayMinSize(2)
	@ArrayMaxSize(20)
	@ValidateNested({ each: true })
	@Type(() => PollOptionBody)
	@ApiProperty({ type: [PollOptionBody] })
	options!: PollOptionBody[];

	@IsBoolean()
	@ApiProperty()
	anonymous!: boolean;

	@IsBoolean()
	@ApiProperty()
	multipleChoice!: boolean;

	@IsBoolean()
	@ApiProperty()
	closed!: boolean;

	@IsEnum(PollResultVisibility)
	@ApiProperty({ enum: PollResultVisibility, enumName: 'PollResultVisibility' })
	showResults!: PollResultVisibility;

	@IsBoolean()
	@ApiProperty({ description: 'Set by whoever may edit the poll to reveal the tally to participants.' })
	resultsReleased!: boolean;
}

export class PollElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.POLL })
	type!: ContentElementType.POLL;

	@ValidateNested()
	@ApiProperty()
	content!: PollContentBody;
}

export class DeadlineContentBody {
	@IsString()
	@MaxLength(200)
	@ApiProperty()
	title!: string;

	@IsDateString()
	@IsOptional()
	@ApiPropertyOptional({ type: String, format: 'date-time', description: 'Omit to clear the date.' })
	dueDate?: string;
}

export class DeadlineElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.DEADLINE })
	type!: ContentElementType.DEADLINE;

	@ValidateNested()
	@ApiProperty()
	content!: DeadlineContentBody;
}

export class CodeContentBody {
	@IsString()
	@MaxLength(20000)
	@ApiProperty()
	code!: string;

	@IsString()
	@MaxLength(40)
	@ApiProperty()
	language!: string;
}

export class CodeElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.CODE })
	type!: ContentElementType.CODE;

	@ValidateNested()
	@ApiProperty()
	content!: CodeContentBody;
}

export class FormulaContentBody {
	@IsString()
	@MaxLength(5000)
	@ApiProperty()
	latex!: string;
}

export class FormulaElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.FORMULA })
	type!: ContentElementType.FORMULA;

	@ValidateNested()
	@ApiProperty()
	content!: FormulaContentBody;
}

export class ChecklistItemBody {
	@IsMongoId()
	@IsOptional()
	@ApiPropertyOptional({ description: 'Omit to add a new item. Keeping the id keeps its checked state.' })
	id?: string;

	@IsString()
	@MaxLength(500)
	@ApiProperty()
	text!: string;
}

export class ChecklistContentBody {
	@IsString()
	@MaxLength(200)
	@ApiProperty()
	title!: string;

	@IsArray()
	@ArrayMaxSize(MAX_CHECKLIST_ITEMS)
	@ValidateNested({ each: true })
	@Type(() => ChecklistItemBody)
	@ApiProperty({ type: [ChecklistItemBody] })
	items!: ChecklistItemBody[];
}

export class ChecklistElementContentBody extends ElementContentBody {
	@ApiProperty({ type: () => ContentElementType.CHECKLIST })
	type!: ContentElementType.CHECKLIST;

	@ValidateNested()
	@ApiProperty()
	content!: ChecklistContentBody;
}

export type AnyElementContentBody =
	| FileContentBody
	| DrawingContentBody
	| LinkContentBody
	| RichTextContentBody
	| ExternalToolContentBody
	| VideoConferenceContentBody
	| FileFolderContentBody
	| H5pContentBody
	| PollContentBody
	| DeadlineContentBody
	| CodeContentBody
	| FormulaContentBody
	| ChecklistContentBody;

export class UpdateElementContentBodyParams {
	@ValidateNested()
	@Type(() => ElementContentBody, {
		discriminator: {
			property: 'type',
			subTypes: [
				{ value: FileElementContentBody, name: ContentElementType.FILE },
				{ value: LinkElementContentBody, name: ContentElementType.LINK },
				{ value: RichTextElementContentBody, name: ContentElementType.RICH_TEXT },
				{ value: ExternalToolElementContentBody, name: ContentElementType.EXTERNAL_TOOL },
				{ value: DrawingElementContentBody, name: ContentElementType.DRAWING },
				{ value: VideoConferenceElementContentBody, name: ContentElementType.VIDEO_CONFERENCE },
				{ value: FileFolderElementContentBody, name: ContentElementType.FILE_FOLDER },
				{ value: H5pElementContentBody, name: ContentElementType.H5P },
				{ value: PollElementContentBody, name: ContentElementType.POLL },
				{ value: DeadlineElementContentBody, name: ContentElementType.DEADLINE },
				{ value: CodeElementContentBody, name: ContentElementType.CODE },
				{ value: FormulaElementContentBody, name: ContentElementType.FORMULA },
				{ value: ChecklistElementContentBody, name: ContentElementType.CHECKLIST },
			],
		},
		keepDiscriminatorProperty: true,
	})
	@ApiProperty({
		oneOf: [
			{ $ref: getSchemaPath(FileElementContentBody) },
			{ $ref: getSchemaPath(LinkElementContentBody) },
			{ $ref: getSchemaPath(RichTextElementContentBody) },
			{ $ref: getSchemaPath(ExternalToolElementContentBody) },
			{ $ref: getSchemaPath(DrawingElementContentBody) },
			{ $ref: getSchemaPath(VideoConferenceElementContentBody) },
			{ $ref: getSchemaPath(FileFolderElementContentBody) },
			{ $ref: getSchemaPath(H5pElementContentBody) },
			{ $ref: getSchemaPath(PollElementContentBody) },
			{ $ref: getSchemaPath(DeadlineElementContentBody) },
			{ $ref: getSchemaPath(CodeElementContentBody) },
			{ $ref: getSchemaPath(FormulaElementContentBody) },
			{ $ref: getSchemaPath(ChecklistElementContentBody) },
		],
	})
	data!:
		| FileElementContentBody
		| LinkElementContentBody
		| RichTextElementContentBody
		| ExternalToolElementContentBody
		| DrawingElementContentBody
		| VideoConferenceElementContentBody
		| FileFolderElementContentBody
		| H5pElementContentBody
		| PollElementContentBody
		| DeadlineElementContentBody
		| CodeElementContentBody
		| FormulaElementContentBody
		| ChecklistElementContentBody;
}
