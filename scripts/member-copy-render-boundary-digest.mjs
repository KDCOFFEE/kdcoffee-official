import ts from "typescript";
import { createHash } from "node:crypto";

const jsxText = (value) => {
  const lines = value.split(/\r?\n/); let last = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) last = i;
  return lines.map((line, i) => { let text = line.replace(/\t/g, " "); if (i !== 0) text = text.trimStart(); if (i !== lines.length - 1) text = text.trimEnd(); return text ? text + (i < last ? " " : "") : ""; }).join("");
};

/** Removes only copy render boundaries, preserving all conditions, handlers, props and calculations. */
export function memberCopyRenderBoundaryDigest(source, file, inspect = false) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(tree, [(context) => {
    function visit(node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith("MemberCenterCopyProvider")) return undefined;
      if (ts.isJsxText(node)) { const value = jsxText(node.text); return value ? ts.factory.createJsxExpression(undefined, ts.factory.createStringLiteral(value)) : undefined; }
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "MemberCopyValue") {
        const value = node.attributes.properties.find((attr) => attr.name?.getText() === "value")?.initializer?.expression;
        return ts.factory.createJsxExpression(undefined, ts.visitNode(value, visit));
      }
      if ((ts.isJsxElement(node) && node.openingElement.tagName.getText() === "MemberCopyElement") || (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "MemberCopyElement")) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = ts.factory.createIdentifier(opening.attributes.properties.find((attr) => attr.name?.getText() === "as").initializer.text);
        const attributes = ts.factory.createJsxAttributes(opening.attributes.properties.filter((attr) => attr.name?.getText() !== "as").map((attr) => ts.visitNode(attr, visit)));
        return ts.isJsxElement(node) ? ts.factory.createJsxElement(ts.factory.createJsxOpeningElement(tag, undefined, attributes), ts.visitNodes(node.children, visit), ts.factory.createJsxClosingElement(tag)) : ts.factory.createJsxSelfClosingElement(tag, undefined, attributes);
      }
      return ts.visitEachChild(node, visit, context);
    }
    return (root) => ts.visitNode(root, visit);
  }]);
  function signature(node) {
    const children = [];
    ts.forEachChild(node, (child) => { children.push(signature(child)); });
    return [node.kind, ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? node.text : null, children];
  }
  const printed = JSON.stringify(signature(result.transformed[0]));
  result.dispose();
  if (inspect) return JSON.parse(printed);
  return createHash("sha256").update(printed).digest("hex");
}

/** For legacy source assertions: reconstruct only the default display boundaries.
 * All non-display code is left byte-for-byte intact; the separate AST digest
 * and SSR tests verify that this adapter cannot hide business/DOM changes.
 */
export function defaultMemberCopySource(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "MemberCopyValue") {
      const value = node.attributes.properties.find((attr) => attr.name?.getText() === "value")?.initializer?.expression;
      const replacement = ts.isStringLiteral(value) ? value.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : `{${value.getText()}}`;
      edits.push({ start: node.getStart(), end: node.end, replacement });
      return;
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === "MemberCopyElement") {
      const attribute = node.attributes.properties.find((attr) => attr.name?.getText() === "as");
      edits.push({ start: node.tagName.getStart(), end: attribute.end, replacement: attribute.initializer.text });
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "MemberCopyElement") {
      const tag = node.openingElement.attributes.properties.find((attr) => attr.name?.getText() === "as").initializer.text;
      edits.push({ start: node.closingElement.tagName.getStart(), end: node.closingElement.tagName.end, replacement: tag });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
  return source;
}
