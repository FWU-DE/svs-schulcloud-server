import { BoardNode } from './board-node.do';
import type { CodeElementProps } from './types';

export class CodeElement extends BoardNode<CodeElementProps> {
	get code(): string {
		return this.props.code;
	}

	set code(value: string) {
		this.props.code = value;
	}

	get language(): string {
		return this.props.language;
	}

	set language(value: string) {
		this.props.language = value;
	}

	get showLineNumbers(): boolean {
		// Code blocks created before these options existed have neither field.
		return this.props.showLineNumbers ?? false;
	}

	set showLineNumbers(value: boolean) {
		this.props.showLineNumbers = value;
	}

	get syntaxHighlighting(): boolean {
		return this.props.syntaxHighlighting ?? true;
	}

	set syntaxHighlighting(value: boolean) {
		this.props.syntaxHighlighting = value;
	}

	public canHaveChild(): boolean {
		return false;
	}
}

export const isCodeElement = (reference: unknown): reference is CodeElement => reference instanceof CodeElement;
