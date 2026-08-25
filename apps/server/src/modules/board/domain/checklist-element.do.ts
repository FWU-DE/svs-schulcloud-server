import { NotFoundException } from '@nestjs/common';
import { BoardNode } from './board-node.do';
import type { ChecklistElementProps, ChecklistItem } from './types';

export class ChecklistElement extends BoardNode<ChecklistElementProps> {
	get title(): string {
		return this.props.title;
	}

	set title(value: string) {
		this.props.title = value;
	}

	get items(): ChecklistItem[] {
		return this.props.items;
	}

	/**
	 * Replaces the list while keeping the state of the items that survive: editing a typo in one
	 * line must not tick or untick anything.
	 */
	public setItems(items: { id?: string; text: string }[], mintId: () => string): void {
		const byId = new Map(this.props.items.map((item) => [item.id, item]));

		this.props.items = items.map((item) => {
			const existing = item.id ? byId.get(item.id) : undefined;

			return {
				id: existing?.id ?? mintId(),
				text: item.text,
				checked: existing?.checked ?? false,
				checkedAt: existing?.checkedAt,
			};
		});
	}

	public setChecked(itemId: string, checked: boolean): ChecklistItem {
		const item = this.props.items.find((i) => i.id === itemId);
		if (!item) {
			throw new NotFoundException(`Checklist item '${itemId}' does not exist on this element`);
		}

		item.checked = checked;
		item.checkedAt = checked ? new Date() : undefined;
		this.props.items = [...this.props.items];

		return item;
	}

	public canHaveChild(): boolean {
		return false;
	}
}

export const isChecklistElement = (reference: unknown): reference is ChecklistElement =>
	reference instanceof ChecklistElement;
