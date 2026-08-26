import { BoardNode } from './board-node.do';
import type { DeadlineElementProps } from './types';

export class DeadlineElement extends BoardNode<DeadlineElementProps> {
	get title(): string {
		return this.props.title;
	}

	set title(value: string) {
		this.props.title = value;
	}

	get dueDate(): Date | undefined {
		return this.props.dueDate;
	}

	set dueDate(value: Date | undefined) {
		this.props.dueDate = value;
	}

	get showInCalendar(): boolean {
		// Deadlines created before the calendar option existed have no such field.
		return this.props.showInCalendar ?? false;
	}

	set showInCalendar(value: boolean) {
		this.props.showInCalendar = value;
	}

	public canHaveChild(): boolean {
		return false;
	}
}

export const isDeadlineElement = (reference: unknown): reference is DeadlineElement =>
	reference instanceof DeadlineElement;
