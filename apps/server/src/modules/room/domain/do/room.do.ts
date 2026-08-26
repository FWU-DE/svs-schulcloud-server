import { type AuthorizableObject, DomainObject } from '@shared/domain/domain-object';
import { type EntityId } from '@shared/domain/types';
import { CardReactionType } from '../type';
import { type RoomColor, type RoomFeatures } from '../type';

export interface RoomProps extends AuthorizableObject {
	id: EntityId;
	name: string;
	color: RoomColor;
	startDate?: Date;
	endDate?: Date;
	schoolId: EntityId;
	features: RoomFeatures[];
	/**
	 * Defaults for the boards in this room. They are the top of the chain
	 * room → board → column → card, where every level below may overrule the one above.
	 * Off by default, so a room that was never configured leaves its boards as they were.
	 */
	commentsEnabled: boolean;
	reactionType: CardReactionType;
	createdAt: Date;
	updatedAt: Date;
}

export type RoomCreateProps = Pick<
	RoomProps,
	'name' | 'color' | 'startDate' | 'endDate' | 'schoolId' | 'features' | 'commentsEnabled' | 'reactionType'
>;
export type RoomUpdateProps = Omit<RoomCreateProps, 'schoolId'>;

export class Room extends DomainObject<RoomProps> {
	constructor(props: RoomProps) {
		super(props);
	}

	public getProps(): RoomProps {
		// We need to make sure that only properties of type T are returned
		// At runtime the props are a MikroORM entity that has additional non-persisted properties
		// see @Property({ persist: false })
		const copyProps = { ...this.props } as RoomProps & { domainObject?: unknown };
		delete copyProps.domainObject;

		return copyProps;
	}

	get name(): string {
		return this.props.name;
	}

	set name(value: string) {
		this.props.name = value;
	}

	get color(): RoomColor {
		return this.props.color;
	}

	set color(value: RoomColor) {
		this.props.color = value;
	}

	get schoolId(): EntityId {
		return this.props.schoolId;
	}

	get startDate(): Date | undefined {
		return this.props.startDate;
	}

	set startDate(value: Date | undefined) {
		this.props.startDate = value;
	}

	get endDate(): Date | undefined {
		return this.props.endDate;
	}

	set endDate(value: Date | undefined) {
		this.props.endDate = value;
	}

	get createdAt(): Date {
		return this.props.createdAt;
	}

	get updatedAt(): Date {
		return this.props.updatedAt;
	}

	get features(): RoomFeatures[] {
		return this.props.features;
	}

	set features(value: RoomFeatures[]) {
		this.props.features = value;
	}

	get commentsEnabled(): boolean {
		// Rooms created before the setting existed had no comments either.
		return this.props.commentsEnabled ?? false;
	}

	set commentsEnabled(value: boolean) {
		this.props.commentsEnabled = value;
	}

	get reactionType(): CardReactionType {
		return this.props.reactionType ?? CardReactionType.NONE;
	}

	set reactionType(value: CardReactionType) {
		this.props.reactionType = value;
	}

	public getRoomName(): string {
		return this.props.name;
	}
}
