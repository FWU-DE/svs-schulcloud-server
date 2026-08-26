import { FilterQuery, Utils } from '@mikro-orm/core';
import { EntityManager, ObjectId } from '@mikro-orm/mongodb';
import { Injectable } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';
import {
	AnyBoardNode,
	BOARD_PREVIEW_DEPTH,
	BoardCounts,
	BoardExternalReference,
	BoardNodeType,
	BoardPreviewNode,
	getBoardNodeType,
} from '../domain';
import { joinPath, pathOfChildren, ROOT_PATH } from '../domain/path-utils';
import { BoardNodeEntity } from './entity/board-node.entity';
import { TreeBuilder } from './tree-builder';

@Injectable()
export class BoardNodeRepo {
	constructor(private readonly em: EntityManager) {}

	public async findById(id: EntityId, depth?: number): Promise<AnyBoardNode> {
		const props = await this.em.findOneOrFail(BoardNodeEntity, { id });
		const descendants = await this.findDescendants(props, depth);

		const builder = new TreeBuilder(descendants);
		const boardNode = builder.build(props);

		return boardNode;
	}

	public async findByIds(ids: EntityId[], depth?: number): Promise<AnyBoardNode[]> {
		const entities = await this.em.find(BoardNodeEntity, { id: { $in: ids } });

		// TODO refactor descendants mapping, more DRY?
		const descendantsMap = await this.findDescendantsOfMany(entities, depth);

		const boardNodes = entities.map((props) => {
			const descentants = descendantsMap[pathOfChildren(props)];
			const builder = new TreeBuilder(descentants);
			const boardNode = builder.build(props);

			return boardNode;
		});

		return boardNodes;
	}

	public async findByExternalReference(reference: BoardExternalReference, depth?: number): Promise<AnyBoardNode[]> {
		const entities = await this.em.find(BoardNodeEntity, {
			context: {
				_contextId: new ObjectId(reference.id),
				_contextType: reference.type,
			} as FilterQuery<BoardExternalReference>,
		});

		// TODO refactor descendants mapping, more DRY?
		const descendantsMap = await this.findDescendantsOfMany(entities, depth);

		const boardNodes = entities.map((props) => {
			const children = descendantsMap[pathOfChildren(props)];
			const builder = new TreeBuilder(children);
			const boardNode = builder.build(props);

			return boardNode;
		});

		return boardNodes;
	}

	public async findByContextExternalToolIds(
		contextExternalToolIds: EntityId[],
		depth?: number
	): Promise<AnyBoardNode[]> {
		const entities = await this.em.find(BoardNodeEntity, {
			contextExternalToolId: { $in: contextExternalToolIds },
		});

		// TODO refactor descendants mapping, more DRY?
		const descendantsMap = await this.findDescendantsOfMany(entities, depth);

		const boardNodes = entities.map((props) => {
			const children = descendantsMap[pathOfChildren(props)];
			const builder = new TreeBuilder(children);
			const boardNode = builder.build(props);

			return boardNode;
		});

		return boardNodes;
	}

	/**
	 * The fields a board preview is drawn from, for every descendant of the given boards.
	 *
	 * Loaded as a projection instead of a board tree on purpose: a room list asks for the
	 * previews of all its boards at once, and the content of the elements — rich text, poll
	 * options, comments — is exactly what a preview does not show.
	 */
	public async findPreviewNodes(
		boardIds: EntityId[],
		depth: number = BOARD_PREVIEW_DEPTH
	): Promise<BoardPreviewNode[]> {
		if (boardIds.length === 0) {
			return [];
		}

		// Column boards are root nodes, so the path of their descendants is known from the id alone.
		const pathQueries = boardIds.map((boardId) => {
			return {
				path: { $re: `^${joinPath(ROOT_PATH, boardId)}` },
				level: { $gte: 1, $lte: depth },
			};
		});

		const entities = await this.em.find(
			BoardNodeEntity,
			{ $or: pathQueries },
			{ fields: ['path', 'level', 'position', 'type', 'title', 'backgroundColor'] }
		);

		const previewNodes = entities.map((entity) => {
			return {
				id: entity.id,
				path: entity.path,
				level: entity.level,
				position: entity.position,
				type: entity.type,
				title: entity.title,
				backgroundColor: entity.backgroundColor,
			};
		});

		return previewNodes;
	}

	/**
	 * How many boards each context (a room, say) holds, split by whether they are published.
	 * Drafts are counted separately because only members who may edit them are allowed to know.
	 */
	public async countBoardsByContexts(references: BoardExternalReference[]): Promise<Map<EntityId, BoardCounts>> {
		const countsByContextId = new Map<EntityId, BoardCounts>();
		if (references.length === 0) {
			return countsByContextId;
		}

		const entities = await this.em.find(BoardNodeEntity, {
			type: BoardNodeType.COLUMN_BOARD,
			$or: references.map((reference) => {
				return {
					context: {
						_contextId: new ObjectId(reference.id),
						_contextType: reference.type,
					} as FilterQuery<BoardExternalReference>,
				};
			}),
		});

		for (const entity of entities) {
			const contextId = entity.context?.id;
			if (!contextId) {
				continue;
			}

			const counts = countsByContextId.get(contextId) ?? { total: 0, visible: 0 };
			counts.total += 1;
			if (entity.isVisible) {
				counts.visible += 1;
			}
			countsByContextId.set(contextId, counts);
		}

		return countsByContextId;
	}

	public async save(boardNode: AnyBoardNode | AnyBoardNode[]): Promise<void> {
		await this.persist(boardNode).flush();
	}

	public async delete(boardNode: AnyBoardNode | AnyBoardNode[]): Promise<void> {
		await this.remove(boardNode).flush();
	}

	private async findDescendants(props: BoardNodeEntity, depth?: number): Promise<BoardNodeEntity[]> {
		const levelQuery = depth !== undefined ? { $gt: props.level, $lte: props.level + depth } : { $gt: props.level };

		const descendants = await this.em.find(BoardNodeEntity, {
			path: { $re: `^${pathOfChildren(props)}` },
			level: levelQuery,
		});

		return descendants;
	}

	private async findDescendantsOfMany(
		entities: BoardNodeEntity[],
		depth?: number
	): Promise<Record<string, BoardNodeEntity[]>> {
		const pathQueries = entities.map((props) => {
			const levelQuery = depth !== undefined ? { $gt: props.level, $lte: props.level + depth } : { $gt: props.level };

			return { path: { $re: `^${pathOfChildren(props)}` }, level: levelQuery };
		});

		const map: Record<string, BoardNodeEntity[]> = {};
		if (pathQueries.length === 0) {
			return map;
		}

		const descendants = await this.em.find(BoardNodeEntity, {
			$or: pathQueries,
		});

		// this is for finding the ancestors of a descendant
		// we use this to group the descendants by ancestor
		// TODO we probably need a more efficient way to do the grouping
		const matchAncestors = (descendant: BoardNodeEntity): BoardNodeEntity[] => {
			const result = entities.filter((props) => descendant.path.match(`^${pathOfChildren(props)}`));
			return result;
		};

		for (const desc of descendants) {
			const ancestors = matchAncestors(desc);
			ancestors.forEach((props) => {
				map[pathOfChildren(props)] ||= [];
				map[pathOfChildren(props)].push(desc);
			});
		}
		return map;
	}

	private persist(boardNode: AnyBoardNode | AnyBoardNode[]): BoardNodeRepo {
		const boardNodes = Utils.asArray(boardNode);

		boardNodes.forEach((bn) => {
			bn.children.forEach((child) => this.persist(child));

			const props = this.getProps(bn);

			if (!(props instanceof BoardNodeEntity)) {
				const entity = this.em.create(BoardNodeEntity, props);
				entity.type = getBoardNodeType(bn);
				this.setProps(bn, entity);
				this.em.persist(entity);
			} else {
				// for the unlikely case that the props are not managed yet
				this.em.persist(props);
			}
		});

		return this;
	}

	private remove(boardNode: AnyBoardNode | AnyBoardNode[]): BoardNodeRepo {
		const boardNodes = Utils.asArray(boardNode);

		boardNodes.forEach((bn) => {
			this.em.remove(this.getProps(bn));
			bn.children.forEach((child) => this.remove(child));
		});

		return this;
	}

	private async flush(): Promise<void> {
		await this.em.flush();
	}

	private getProps(boardNode: AnyBoardNode): BoardNodeEntity {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		const { props } = boardNode;
		return props as BoardNodeEntity;
	}

	private setProps(boardNode: AnyBoardNode, props: BoardNodeEntity): void {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		boardNode.props = props;
	}
}
