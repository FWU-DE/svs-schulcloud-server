import { BoardNode } from './board-node.do';
import type { FormulaElementProps } from './types';

export class FormulaElement extends BoardNode<FormulaElementProps> {
	get latex(): string {
		return this.props.latex;
	}

	set latex(value: string) {
		this.props.latex = value;
	}

	public canHaveChild(): boolean {
		return false;
	}
}

export const isFormulaElement = (reference: unknown): reference is FormulaElement =>
	reference instanceof FormulaElement;
