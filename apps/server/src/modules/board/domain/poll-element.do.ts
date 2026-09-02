import { UnprocessableEntityException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { type EntityId } from '@shared/domain/types';
import { BoardNode } from './board-node.do';
import type { PollElementProps, PollOption, PollResult, PollResultVisibility, PollVote } from './types';

export class PollElement extends BoardNode<PollElementProps> {
	get question(): string {
		return this.props.question;
	}

	set question(value: string) {
		this.props.question = value;
	}

	get pollOptions(): PollOption[] {
		return this.props.pollOptions;
	}

	get anonymous(): boolean {
		return this.props.anonymous;
	}

	get multipleChoice(): boolean {
		return this.props.multipleChoice;
	}

	get closed(): boolean {
		return this.props.closed;
	}

	set closed(value: boolean) {
		this.props.closed = value;
	}

	get showResults(): PollResultVisibility {
		return this.props.showResults;
	}

	set showResults(value: PollResultVisibility) {
		this.props.showResults = value;
	}

	get resultsReleased(): boolean {
		return this.props.resultsReleased;
	}

	set resultsReleased(value: boolean) {
		this.props.resultsReleased = value;
	}

	get votes(): PollVote[] {
		return this.props.votes;
	}

	public canHaveChild(): boolean {
		return false;
	}

	/**
	 * Options and the anonymity mode define what the stored ballots mean, so changing either
	 * invalidates them. Rather than silently keeping ballots that now point at removed options
	 * or at the wrong voter key, the poll drops them and starts over.
	 */
	public configure(props: {
		question: string;
		pollOptions: PollOption[];
		anonymous: boolean;
		multipleChoice: boolean;
		showResults: PollResultVisibility;
		resultsReleased: boolean;
		closed: boolean;
	}): void {
		const optionsChanged = !this.hasSameOptions(props.pollOptions);
		const anonymityChanged = props.anonymous !== this.props.anonymous;

		this.props.question = props.question;
		this.props.pollOptions = props.pollOptions;
		this.props.anonymous = props.anonymous;
		this.props.multipleChoice = props.multipleChoice;
		this.props.showResults = props.showResults;
		this.props.resultsReleased = props.resultsReleased;
		this.props.closed = props.closed;

		if (optionsChanged || anonymityChanged) {
			this.props.votes = [];
			this.props.voterSalt = randomBytes(16).toString('hex');
		}
	}

	public vote(userId: EntityId, optionIds: string[]): void {
		if (this.props.closed) {
			throw new UnprocessableEntityException('Poll is closed');
		}

		const unknownOption = optionIds.find((optionId) => !this.props.pollOptions.some((o) => o.id === optionId));
		if (unknownOption) {
			throw new UnprocessableEntityException(`Unknown poll option '${unknownOption}'`);
		}

		if (!this.props.multipleChoice && optionIds.length > 1) {
			throw new UnprocessableEntityException('Poll allows only a single option');
		}

		this.withdrawVote(userId);

		if (optionIds.length === 0) {
			return;
		}

		const vote: PollVote = this.props.anonymous
			? { optionIds, voterHash: this.voterKey(userId), createdAt: new Date() }
			: { optionIds, userId, createdAt: new Date() };

		this.props.votes.push(vote);
	}

	public withdrawVote(userId: EntityId): void {
		const key = this.voterKey(userId);
		this.props.votes = this.props.votes.filter((vote) => this.keyOf(vote) !== key);
	}

	public getVoteOf(userId: EntityId): string[] {
		const key = this.voterKey(userId);
		const vote = this.props.votes.find((v) => this.keyOf(v) === key);

		return vote ? [...vote.optionIds] : [];
	}

	public getResults(): PollResult[] {
		const results = this.props.pollOptions.map((option) => {
			return {
				optionId: option.id,
				count: this.props.votes.filter((vote) => vote.optionIds.includes(option.id)).length,
			};
		});

		return results;
	}

	get voterCount(): number {
		return this.props.votes.length;
	}

	/**
	 * Who voted for what — only meaningful for an open poll. An anonymous poll has no user ids
	 * to return, and must not gain any.
	 */
	public getVotersByOption(): Record<string, EntityId[]> {
		if (this.props.anonymous) {
			return {};
		}

		const votersByOption: Record<string, EntityId[]> = {};
		for (const option of this.props.pollOptions) {
			votersByOption[option.id] = this.props.votes
				.filter((vote) => vote.optionIds.includes(option.id))
				.map((vote) => vote.userId)
				.filter((userId): userId is EntityId => userId !== undefined);
		}

		return votersByOption;
	}

	private voterKey(userId: EntityId): string {
		if (!this.props.anonymous) {
			return userId;
		}

		return createHmac('sha256', this.props.voterSalt).update(userId).digest('hex');
	}

	private keyOf(vote: PollVote): string | undefined {
		return this.props.anonymous ? vote.voterHash : vote.userId;
	}

	/**
	 * Compares option identities, not their labels: fixing a typo in an option must not cost
	 * the poll its ballots, adding or removing an option must.
	 */
	private hasSameOptions(pollOptions: PollOption[]): boolean {
		if (pollOptions.length !== this.props.pollOptions.length) {
			return false;
		}

		const currentIds = new Set(this.props.pollOptions.map((option) => option.id));

		return pollOptions.every((option) => currentIds.has(option.id));
	}
}

export const isPollElement = (reference: unknown): reference is PollElement => reference instanceof PollElement;
