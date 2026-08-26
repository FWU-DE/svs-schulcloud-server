/**
 * Whose progress a checklist records.
 *
 * `SHARED` is the group's progress through a task: one set of ticks that everyone sees and
 * everyone can change. `PER_USER` is a personal list — a learning path or a self-check — where
 * each person keeps their own ticks and nobody reads anybody else's.
 */
export enum ChecklistProgressMode {
	SHARED = 'shared',
	PER_USER = 'perUser',
}

export interface ChecklistItem {
	id: string;
	text: string;
	/** Only meaningful in `SHARED` mode; a personal list keeps its ticks in `checks`. */
	checked: boolean;
	checkedAt?: Date;
}

/**
 * One person's tick on one item, used in `PER_USER` mode. Stored with the user id because a
 * personal list has to be shown back to its owner — but the API only ever reports the
 * requesting user's own ticks plus anonymous totals, never who ticked what.
 */
export interface ChecklistCheck {
	itemId: string;
	userId: string;
	createdAt: Date;
}

export const MAX_CHECKLIST_ITEMS = 50;
