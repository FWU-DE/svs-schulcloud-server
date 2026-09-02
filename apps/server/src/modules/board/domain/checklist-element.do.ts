import { NotFoundException } from '@nestjs/common';
import { type EntityId } from '@shared/domain/types';
import { BoardNode } from './board-node.do';
import type { ChecklistCheck, ChecklistElementProps, ChecklistItem } from './types';
import { ChecklistProgressMode } from './types';

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

	get progressMode(): ChecklistProgressMode {
		// Checklists created before the personal mode existed are shared ones.
		return this.props.progressMode ?? ChecklistProgressMode.SHARED;
	}

	get checks(): ChecklistCheck[] {
		return this.props.checks ?? [];
	}

	get isPerUser(): boolean {
		return this.progressMode === ChecklistProgressMode.PER_USER;
	}

	/**
	 * Replaces the list while keeping the state of the items that survive: editing a typo in one
	 * line must not tick or untick anything. Personal ticks on items that disappear go with them.
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

		const survivingIds = new Set(this.props.items.map((item) => item.id));
		this.props.checks = this.checks.filter((check) => survivingIds.has(check.itemId));
	}

	/**
	 * A shared tick and a personal tick are not the same statement, so switching the mode starts
	 * the progress over rather than reinterpreting what is already there.
	 */
	public setProgressMode(mode: ChecklistProgressMode): void {
		if (mode === this.progressMode) {
			return;
		}

		this.props.progressMode = mode;
		this.props.checks = [];
		this.props.items = this.props.items.map((item) => {
			return { ...item, checked: false, checkedAt: undefined };
		});
	}

	public setChecked(itemId: string, userId: EntityId, checked: boolean): ChecklistItem {
		const item = this.findItem(itemId);

		if (this.isPerUser) {
			this.props.checks = this.checks.filter((check) => !(check.itemId === itemId && check.userId === userId));
			if (checked) {
				this.props.checks = [...this.props.checks, { itemId, userId, createdAt: new Date() }];
			}

			return item;
		}

		item.checked = checked;
		item.checkedAt = checked ? new Date() : undefined;
		this.props.items = [...this.props.items];

		return item;
	}

	/** Whether this particular person sees the item as done. */
	public isCheckedFor(itemId: string, userId?: EntityId): boolean {
		if (!this.isPerUser) {
			return this.findItem(itemId).checked;
		}

		if (!userId) {
			return false;
		}

		return this.checks.some((check) => check.itemId === itemId && check.userId === userId);
	}

	/**
	 * How many people ticked an item. A count, never a list of names: a personal checklist is
	 * there to help someone keep track, not to report on them.
	 */
	public checkedCount(itemId: string): number {
		if (!this.isPerUser) {
			return this.findItem(itemId).checked ? 1 : 0;
		}

		return this.checks.filter((check) => check.itemId === itemId).length;
	}

	/** How many distinct people ticked at least one item. */
	get participantCount(): number {
		return new Set(this.checks.map((check) => check.userId)).size;
	}

	public completedCountFor(userId?: EntityId): number {
		return this.props.items.filter((item) => this.isCheckedFor(item.id, userId)).length;
	}

	public canHaveChild(): boolean {
		return false;
	}

	private findItem(itemId: string): ChecklistItem {
		const item = this.props.items.find((i) => i.id === itemId);
		if (!item) {
			throw new NotFoundException(`Checklist item '${itemId}' does not exist on this element`);
		}

		return item;
	}
}

export const isChecklistElement = (reference: unknown): reference is ChecklistElement =>
	reference instanceof ChecklistElement;
