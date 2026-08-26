import type { EntityId, InputFormat } from '@shared/domain/types';
import type { Colors } from '../media-board';
import type { AnyBoardNode } from './any-board-node';
import type { BoardExternalReference } from './board-external-reference';
import type { BoardLayout } from './board-layout.enum';
import type { CardComment } from './card-comment';
import type { CardReaction, CardReactionType } from './card-reaction';
import type { ChecklistItem } from './checklist';
import type { ContentElementType } from './content-element-type.enum';
import type { RecordingMediaType } from './recording';
import type { PollOption, PollResultVisibility, PollVote } from './poll';

export interface BoardNodeProps {
	id: EntityId;
	path: string;
	level: number;
	position: number;
	children: AnyBoardNode[];
	createdAt: Date;
	updatedAt: Date;
}

export interface ColumnBoardProps extends BoardNodeProps {
	title: string;
	context: BoardExternalReference;
	isVisible: boolean;
	layout: BoardLayout;
	readersCanEdit: boolean;
	reactionType: CardReactionType;
	commentsEnabled: boolean;
}

export interface ColumnProps extends BoardNodeProps {
	title?: string;
}

export interface CardProps extends BoardNodeProps {
	title?: string;
	backgroundColor?: Colors;
	height: number;
	reactions: CardReaction[];
	comments: CardComment[];
	/**
	 * Per-card overrides of the board-wide settings. `undefined` means "whatever the board
	 * says" — a tri-state, because "off" and "not decided here" have to stay distinguishable.
	 */
	commentsEnabled?: boolean;
	readersCanEdit?: boolean;
}

export type CollaborativeTextEditorElementProps = BoardNodeProps;

export interface DrawingElementProps extends BoardNodeProps {
	description: string;
}

export interface ExternalToolElementProps extends BoardNodeProps {
	contextExternalToolId?: string;
}

export interface FileElementProps extends BoardNodeProps {
	alternativeText?: string;
	caption?: string;
}
export interface LinkElementProps extends BoardNodeProps {
	title: string;
	url: string;
	description?: string;
	originalImageUrl?: string;
	imageUrl?: string;
}

export interface RichTextElementProps extends BoardNodeProps {
	text: string;
	inputFormat: InputFormat;
}

export interface VideoConferenceElementProps extends BoardNodeProps {
	title: string;
}

export interface FileFolderElementProps extends BoardNodeProps {
	title: string;
}

export interface DeletedElementProps extends BoardNodeProps {
	title: string;
	deletedElementType: ContentElementType;
	description?: string;
}

export interface H5pElementProps extends BoardNodeProps {
	contentId?: string;
}

export interface PollElementProps extends BoardNodeProps {
	question: string;
	pollOptions: PollOption[];
	anonymous: boolean;
	multipleChoice: boolean;
	closed: boolean;
	showResults: PollResultVisibility;
	resultsReleased: boolean;
	votes: PollVote[];
	voterSalt: string;
}

export interface DeadlineElementProps extends BoardNodeProps {
	title: string;
	dueDate?: Date;
	/**
	 * Whether this deadline is listed in the calendar of everyone who can see the board. It is
	 * not written into the external calendar service; the board stays the one place the date
	 * lives, and the calendar view reads it from here.
	 */
	showInCalendar: boolean;
}

export interface CodeElementProps extends BoardNodeProps {
	code: string;
	language: string;
	showLineNumbers: boolean;
	syntaxHighlighting: boolean;
}

export interface FormulaElementProps extends BoardNodeProps {
	latex: string;
}

export interface ChecklistElementProps extends BoardNodeProps {
	title: string;
	items: ChecklistItem[];
}

export interface RecordingElementProps extends BoardNodeProps {
	mediaType: RecordingMediaType;
	caption: string;
}

export interface MediaBoardProps extends BoardNodeProps {
	context: BoardExternalReference;
	backgroundColor: Colors;
	collapsed: boolean;
	layout: BoardLayout;
}

// TODO use only one interface for media-external-tool and external-tool
export interface MediaExternalToolElementProps extends BoardNodeProps {
	contextExternalToolId: string;
}

export interface MediaLineProps extends BoardNodeProps {
	backgroundColor: Colors;
	collapsed: boolean;
	title: string;
}

type MediaBoardNodeProps = MediaBoardProps | MediaExternalToolElementProps | MediaLineProps;

export type AnyBoardNodeProps =
	| CardProps
	| CollaborativeTextEditorElementProps
	| ColumnBoardProps
	| ColumnProps
	| DrawingElementProps
	| ExternalToolElementProps
	| FileElementProps
	| FileFolderElementProps
	| LinkElementProps
	| RichTextElementProps
	| VideoConferenceElementProps
	| DeletedElementProps
	| H5pElementProps
	| PollElementProps
	| DeadlineElementProps
	| CodeElementProps
	| FormulaElementProps
	| ChecklistElementProps
	| RecordingElementProps
	| MediaBoardNodeProps;
