import { type EntityId } from '@shared/domain/types';
import { type CollaborativeTextEditorElement, isCollaborativeTextEditorElement } from '../collaborative-text-editor.do';
import { type DeletedElement, isDeletedElement } from '../deleted-element.do';
import { type DrawingElement, isDrawingElement } from '../drawing-element.do';
import { type ExternalToolElement, isExternalToolElement } from '../external-tool-element.do';
import { type FileElement, isFileElement } from '../file-element.do';
import { type FileFolderElement, isFileFolderElement } from '../file-folder-element.do';
import { type H5pElement, isH5pElement } from '../h5p-element.do';
import { isLinkElement, type LinkElement } from '../link-element.do';
import { type ChecklistElement, isChecklistElement } from '../checklist-element.do';
import { type CodeElement, isCodeElement } from '../code-element.do';
import { type DeadlineElement, isDeadlineElement } from '../deadline-element.do';
import { type FormulaElement, isFormulaElement } from '../formula-element.do';
import { isPollElement, type PollElement } from '../poll-element.do';
import { isRichTextElement, type RichTextElement } from '../rich-text-element.do';
import { isVideoConferenceElement, type VideoConferenceElement } from '../video-conference-element.do';
import { type AnyBoardNode } from './any-board-node';
import { type BoardViewContext } from './board-view-context';
import { type BoardExternalReferenceType } from './board-external-reference';

export type AnyContentElement =
	| CollaborativeTextEditorElement
	| DrawingElement
	| ExternalToolElement
	| FileElement
	| FileFolderElement
	| LinkElement
	| RichTextElement
	| DeletedElement
	| VideoConferenceElement
	| H5pElement
	| PollElement
	| DeadlineElement
	| CodeElement
	| FormulaElement
	| ChecklistElement;

export const isContentElement = (boardNode: AnyBoardNode): boardNode is AnyContentElement => {
	const result: boolean =
		isCollaborativeTextEditorElement(boardNode) ||
		isDrawingElement(boardNode) ||
		isExternalToolElement(boardNode) ||
		isFileElement(boardNode) ||
		isFileFolderElement(boardNode) ||
		isLinkElement(boardNode) ||
		isRichTextElement(boardNode) ||
		isDeletedElement(boardNode) ||
		isVideoConferenceElement(boardNode) ||
		isH5pElement(boardNode) ||
		isPollElement(boardNode) ||
		isDeadlineElement(boardNode) ||
		isCodeElement(boardNode) ||
		isFormulaElement(boardNode) ||
		isChecklistElement(boardNode);

	return result;
};

// @TODO check namings
export enum ElementReferenceType {
	BOARD = 'board',
}

export type ParentNodeType = BoardExternalReferenceType | ElementReferenceType;

export interface ParentNodeInfo {
	readonly id: EntityId;
	readonly type: ParentNodeType;
	readonly name: string;
	readonly child?: ParentNodeInfo;
}

export interface ContentElementWithParentHierarchy {
	readonly element: AnyContentElement;
	readonly parentHierarchy: ParentNodeInfo[];
	readonly viewContext: BoardViewContext;
}
