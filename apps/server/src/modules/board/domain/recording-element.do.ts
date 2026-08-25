import { BoardNode } from './board-node.do';
import type { RecordingElementProps, RecordingMediaType } from './types';

/**
 * Holds one audio or video recording. The recording itself is an ordinary file under this
 * element in the file storage, exactly like a file element's attachment — the element adds the
 * recorder and the player, not a second way of storing media.
 */
export class RecordingElement extends BoardNode<RecordingElementProps> {
	get mediaType(): RecordingMediaType {
		return this.props.mediaType;
	}

	set mediaType(value: RecordingMediaType) {
		this.props.mediaType = value;
	}

	get caption(): string {
		return this.props.caption;
	}

	set caption(value: string) {
		this.props.caption = value;
	}

	public canHaveChild(): boolean {
		return false;
	}
}

export const isRecordingElement = (reference: unknown): reference is RecordingElement =>
	reference instanceof RecordingElement;
