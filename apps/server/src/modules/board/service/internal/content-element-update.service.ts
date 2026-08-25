import { ObjectId } from '@mikro-orm/mongodb';
import { Injectable } from '@nestjs/common';
import { sanitizeRichText } from '@shared/controller/transformer';
import { InputFormat } from '@shared/domain/types';
import {
	type AnyElementContentBody,
	DrawingContentBody,
	ExternalToolContentBody,
	FileContentBody,
	FileFolderContentBody,
	H5pContentBody,
	LinkContentBody,
	PollContentBody,
	RichTextContentBody,
	VideoConferenceContentBody,
} from '../../controller/dto';
import type {
	AnyContentElement,
	PollElement,
	DrawingElement,
	ExternalToolElement,
	FileElement,
	FileFolderElement,
	LinkElement,
	RichTextElement,
	VideoConferenceElement,
} from '../../domain';
import {
	H5pElement,
	isDrawingElement,
	isExternalToolElement,
	isFileElement,
	isFileFolderElement,
	isH5pElement,
	isLinkElement,
	isPollElement,
	isRichTextElement,
	isVideoConferenceElement,
} from '../../domain';
import { BoardNodeRepo } from '../../repo';

@Injectable()
export class ContentElementUpdateService {
	constructor(private readonly boardNodeRepo: BoardNodeRepo) {}

	public async updateContent(element: AnyContentElement, content: AnyElementContentBody): Promise<void> {
		// TODO refactor if ... else to e.g. discriminated union or non-exhaustive check
		if (isFileElement(element) && content instanceof FileContentBody) {
			this.updateFileElement(element, content);
		} else if (isLinkElement(element) && content instanceof LinkContentBody) {
			this.updateLinkElement(element, content);
		} else if (isRichTextElement(element) && content instanceof RichTextContentBody) {
			this.updateRichTextElement(element, content);
		} else if (isDrawingElement(element) && content instanceof DrawingContentBody) {
			this.updateDrawingElement(element, content);
		} else if (isExternalToolElement(element) && content instanceof ExternalToolContentBody) {
			this.updateExternalToolElement(element, content);
		} else if (isVideoConferenceElement(element) && content instanceof VideoConferenceContentBody) {
			this.updateVideoConferenceElement(element, content);
		} else if (isFileFolderElement(element) && content instanceof FileFolderContentBody) {
			this.updateFileFolderElement(element, content);
		} else if (isH5pElement(element) && content instanceof H5pContentBody) {
			this.updateH5pElement(element, content);
		} else if (isPollElement(element) && content instanceof PollContentBody) {
			this.updatePollElement(element, content);
		} else {
			throw new Error(`Cannot update element of type: '${element.constructor.name}'`);
		}

		await this.boardNodeRepo.save(element);
	}

	public updateFileElement(element: FileElement, content: FileContentBody): void {
		element.caption = sanitizeRichText(content.caption, InputFormat.PLAIN_TEXT);
		element.alternativeText = sanitizeRichText(content.alternativeText, InputFormat.PLAIN_TEXT);
	}

	public updateLinkElement(element: LinkElement, content: LinkContentBody): void {
		element.url = new URL(content.url).toString();
		element.title = content.title ?? '';
		element.description = content.description ?? '';
		if (content.imageUrl) {
			const isRelativeUrl = (url: string): boolean => {
				const fallbackHostname = 'https://www.fallback-url-if-url-is-relative.org';
				const imageUrlObject = new URL(url, fallbackHostname);
				return imageUrlObject.origin === fallbackHostname;
			};

			if (isRelativeUrl(content.imageUrl)) {
				element.imageUrl = content.imageUrl;
			}
		} else {
			element.imageUrl = '';
		}
	}

	public updateRichTextElement(element: RichTextElement, content: RichTextContentBody): void {
		element.text = sanitizeRichText(content.text, content.inputFormat);
		element.inputFormat = content.inputFormat;
	}

	public updateDrawingElement(element: DrawingElement, content: DrawingContentBody): void {
		element.description = content.description;
	}

	public updateExternalToolElement(element: ExternalToolElement, content: ExternalToolContentBody): void {
		if (content.contextExternalToolId !== undefined && element.contextExternalToolId === undefined) {
			// Updates should not remove an existing reference to a tool, to prevent orphan tool instances
			element.contextExternalToolId = content.contextExternalToolId;
		}
	}

	public updateVideoConferenceElement(element: VideoConferenceElement, content: VideoConferenceContentBody): void {
		element.title = content.title;
	}

	public updateFileFolderElement(element: FileFolderElement, content: FileFolderContentBody): void {
		element.title = content.title;
	}

	public updatePollElement(element: PollElement, content: PollContentBody): void {
		const pollOptions = content.options.map((option) => ({
			id: option.id ?? new ObjectId().toHexString(),
			text: sanitizeRichText(option.text, InputFormat.PLAIN_TEXT),
		}));

		element.configure({
			question: sanitizeRichText(content.question, InputFormat.PLAIN_TEXT),
			pollOptions,
			anonymous: content.anonymous,
			multipleChoice: content.multipleChoice,
			showResults: content.showResults,
			resultsReleased: content.resultsReleased,
			closed: content.closed,
		});
	}

	public updateH5pElement(element: H5pElement, content: H5pContentBody): void {
		if (content.contentId !== undefined && element.contentId === undefined) {
			element.contentId = content.contentId;
		}
	}
}
