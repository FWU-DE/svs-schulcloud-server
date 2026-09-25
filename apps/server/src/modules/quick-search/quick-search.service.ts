import { CourseService } from '@modules/course';
import { RoomService } from '@modules/room';
import { RoomMembershipService } from '@modules/room-membership';
import { UserDo, UserService } from '@modules/user';
import { Injectable } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';

export enum QuickSearchResultType {
	ROOM = 'room',
	COURSE = 'course',
	PERSON = 'person',
}

export interface QuickSearchResult {
	id: EntityId;
	type: QuickSearchResultType;
	title: string;
	subtitle: string;
	url: string;
}

/**
 * How many rooms, courses and people are looked at before the query is applied. The search runs
 * over what the user is a member of anyway, so this is a ceiling for pathological accounts, not a
 * page size.
 */
const SCAN_LIMIT = 200;

/**
 * "Ökosystem" and "Okosystem" should find each other, and a teacher typing "muller" should find
 * Müller. Comparing the decomposed form with the combining marks stripped gets both.
 */
const fold = (value: string): string =>
	value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

/**
 * Nothing (0) when the query does not occur at all, otherwise how good the hit is: a title
 * beginning with the query beats a word beginning with it, which beats an occurrence in the middle.
 * The caller sorts on this, so "See" puts the room "Seeufer" above "Ökosystem See".
 */
const score = (title: string, query: string): number => {
	const haystack = fold(title);
	const needle = fold(query);
	const at = haystack.indexOf(needle);

	if (at < 0) {
		return 0;
	}
	if (at === 0) {
		return 3;
	}
	if (/[\s\-_/(]/.test(haystack.charAt(at - 1))) {
		return 2;
	}

	return 1;
};

@Injectable()
export class QuickSearchService {
	constructor(
		private readonly roomMembershipService: RoomMembershipService,
		private readonly roomService: RoomService,
		private readonly courseService: CourseService,
		private readonly userService: UserService
	) {}

	/**
	 * Searches the rooms, courses and people the user already has access to. It deliberately does
	 * not reach beyond that: people are only found when they share a room with the searcher, so the
	 * palette never turns into a school-wide directory.
	 */
	public async search(
		userId: EntityId,
		schoolId: EntityId,
		query: string,
		limit: number
	): Promise<QuickSearchResult[]> {
		const roomAuthorizables = await this.roomMembershipService.getRoomAuthorizablesByUserId(userId);

		const [rooms, courses, people] = await Promise.all([
			this.searchRooms(
				roomAuthorizables.map((authorizable) => authorizable.roomId),
				query
			),
			this.searchCourses(userId, schoolId, query),
			this.searchPeople(roomAuthorizables, userId, query),
		]);

		return this.merge([rooms, courses, people], limit);
	}

	private async searchRooms(roomIds: EntityId[], query: string): Promise<[number, QuickSearchResult][]> {
		const rooms = await this.roomService.getRoomsByIds(roomIds.slice(0, SCAN_LIMIT));

		return rooms
			.map((room): [number, QuickSearchResult] => [
				score(room.name, query),
				{
					id: room.id,
					type: QuickSearchResultType.ROOM,
					title: room.name,
					subtitle: '',
					url: `/rooms/${room.id}`,
				},
			])
			.filter(([hit]) => hit > 0);
	}

	private async searchCourses(
		userId: EntityId,
		schoolId: EntityId,
		query: string
	): Promise<[number, QuickSearchResult][]> {
		const [courses] = await this.courseService.findAllByUserId(userId, schoolId, undefined, {
			pagination: { limit: SCAN_LIMIT },
		});

		return courses
			.map((course): [number, QuickSearchResult] => [
				score(course.name, query),
				{
					id: course.id,
					type: QuickSearchResultType.COURSE,
					title: course.name,
					subtitle: '',
					url: `/rooms/${course.id}`,
				},
			])
			.filter(([hit]) => hit > 0);
	}

	private async searchPeople(
		roomAuthorizables: { roomId: EntityId; members: { userId: EntityId }[] }[],
		userId: EntityId,
		query: string
	): Promise<[number, QuickSearchResult][]> {
		/** which room a person is found through, so the hit can link somewhere meaningful */
		const roomOfUser = new Map<EntityId, EntityId>();
		for (const authorizable of roomAuthorizables) {
			for (const member of authorizable.members) {
				if (member.userId !== userId && !roomOfUser.has(member.userId)) {
					roomOfUser.set(member.userId, authorizable.roomId);
				}
			}
		}

		const memberIds = [...roomOfUser.keys()].slice(0, SCAN_LIMIT);
		if (memberIds.length === 0) {
			return [];
		}

		const users = await this.userService.findByIds(memberIds, false);

		return users
			.map((user): [number, QuickSearchResult] => {
				const name = this.nameOf(user);
				const roomId = roomOfUser.get(user.id as EntityId) ?? '';

				return [
					score(name, query),
					{
						id: user.id as EntityId,
						type: QuickSearchResultType.PERSON,
						title: name,
						subtitle: '',
						url: `/rooms/${roomId}/members`,
					},
				];
			})
			.filter(([hit]) => hit > 0);
	}

	private nameOf(user: UserDo): string {
		return `${user.firstName} ${user.lastName}`.trim();
	}

	/**
	 * Interleaves the three kinds so a single strong group cannot fill the whole palette: the best
	 * hit of every kind comes first, then the second best of every kind, and so on.
	 */
	private merge(groups: [number, QuickSearchResult][][], limit: number): QuickSearchResult[] {
		const ranked = groups.map((group) => group.sort(([a], [b]) => b - a).map(([, result]) => result));
		const merged: QuickSearchResult[] = [];

		for (let rank = 0; merged.length < limit; rank += 1) {
			const nextOfEachKind = ranked
				.map((group) => group[rank])
				.filter((result): result is QuickSearchResult => !!result);
			if (nextOfEachKind.length === 0) {
				break;
			}
			merged.push(...nextOfEachKind);
		}

		return merged.slice(0, limit);
	}
}
