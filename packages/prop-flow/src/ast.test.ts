import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { bindingNameOfFn, defaultedBindingNames, findAttr, isExported, unwrapToFn } from './ast.js';
import type { ComponentFn } from './ast.js';

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile('fixture.tsx', code, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
}

function firstStatement(code: string): ts.Statement {
  const [statement] = parse(code).statements;
  if (!statement) {
    throw new Error(`nothing parsed from: ${code}`);
  }
  return statement;
}

/** First node in `code` matching `predicate`, depth-first. */
function findNode<T extends ts.Node>(code: string, predicate: (node: ts.Node) => node is T): T {
  let found: T | undefined;
  const visit = (node: ts.Node): void => {
    if (!found && predicate(node)) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(code));
  if (!found) {
    throw new Error(`no matching node in: ${code}`);
  }
  return found;
}

function initializerOf(code: string): ts.Expression {
  const { initializer } = findNode(code, ts.isVariableDeclaration);
  if (!initializer) {
    throw new Error(`no initializer in: ${code}`);
  }
  return initializer;
}

function firstParameter(code: string): ts.ParameterDeclaration {
  const fn = findNode(code, ts.isFunctionDeclaration);
  const [param] = fn.parameters;
  if (!param) {
    throw new Error(`no parameter in: ${code}`);
  }
  return param;
}

describe('isExported', () => {
  it('sees the export modifier, and copes with nodes that cannot carry one', () => {
    expect(isExported(ts, firstStatement('export function A(p: P) {}'))).toBe(true);
    expect(isExported(ts, firstStatement('function A(p: P) {}'))).toBe(false);
    expect(isExported(ts, parse('const a = 1;'))).toBe(false);
  });
});

describe('unwrapToFn', () => {
  it.each([
    ['const C = () => null;', ts.SyntaxKind.ArrowFunction],
    ['const C = memo(forwardRef(function Inner(p: P) {}));', ts.SyntaxKind.FunctionExpression],
  ])('peels wrappers in %s', (code, kind) => {
    expect(unwrapToFn(ts, initializerOf(code))?.kind).toBe(kind);
  });

  it.each([['const C = memo();'], ['const C = somethingElse;']])('gives up on %s', (code) => {
    expect(unwrapToFn(ts, initializerOf(code))).toBeNull();
  });
});

describe('defaultedBindingNames', () => {
  it('collects the props keys whose binding carries a default', () => {
    expect([...defaultedBindingNames(ts, firstParameter('function C({ a = 1, b, c: d = 2, e: f }: P) {}'))]).toEqual([
      'a',
      'c',
    ]);
  });

  it('has nothing to collect for a whole-object parameter', () => {
    expect([...defaultedBindingNames(ts, firstParameter('function C(props: P) {}'))]).toEqual([]);
  });
});

describe('findAttr', () => {
  /** What the lookup found for `title`, compacted: the value and the spreads. */
  function lookup(code: string): { spreads: number; value: string | null } {
    const { attr, spreadsAfter } = findAttr(ts, findNode(code, ts.isJsxSelfClosingElement), 'title');
    const init = attr?.initializer;
    return { spreads: spreadsAfter.length, value: init && ts.isStringLiteral(init) ? init.text : null };
  }

  it.each([
    ['const a = <C title="x" />;', { spreads: 0, value: 'x' }],
    ['const a = <C other="x" />;', { spreads: 0, value: null }],
    ['const a = <C {...p} />;', { spreads: 1, value: null }],
    ['const a = <C title="x" {...p} />;', { spreads: 1, value: 'x' }],
    ['const a = <C {...p} {...q} />;', { spreads: 2, value: null }],
    // A spread BEFORE the attribute cannot win under JSX last-wins — dropped.
    ['const a = <C {...p} title="x" />;', { spreads: 0, value: 'x' }],
    // Duplicates resolve to the last one, exactly as JSX itself does.
    ['const a = <C title="x" title="y" />;', { spreads: 0, value: 'y' }],
  ])('%s', (code, expected) => {
    expect(lookup(code)).toEqual(expected);
  });
});

describe('bindingNameOfFn', () => {
  it.each([
    ['function C(p: P) {}', 'C'],
    ['const C = (p: P) => null;', 'C'],
    ['const C = memo((p: P) => null);', 'C'],
  ])('names the component in %s', (code, expected) => {
    const fn = findNode(code, (node): node is ComponentFn => {
      return ts.isFunctionDeclaration(node) || ts.isArrowFunction(node);
    });

    expect(bindingNameOfFn(ts, fn)?.text).toBe(expected);
  });

  it('returns null for a function that is never bound to a name', () => {
    const fn = findNode('render((p: P) => null);', ts.isArrowFunction);

    expect(bindingNameOfFn(ts, fn)).toBeNull();
  });
});
