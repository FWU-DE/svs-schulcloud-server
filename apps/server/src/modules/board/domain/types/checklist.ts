export interface ChecklistItem {
	id: string;
	text: string;
	/**
	 * Shared, not per person: a checklist on a board is the group's progress through a task.
	 * A per-user version would need its own data model and its own privacy answer.
	 */
	checked: boolean;
	checkedAt?: Date;
}

export const MAX_CHECKLIST_ITEMS = 50;
