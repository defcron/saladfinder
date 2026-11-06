import { parse } from "@babel/parser";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const attributes = new Set([
  "aria-label",
  "placeholder",
  "title",
  "label",
  "alt",
]);
export function transformCopy(source) {
  const tree = parse(source, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
  const edits = [],
    catalog = {};
  function replace(node, value, kind) {
    if (!/[A-Za-z]/.test(value) || value === "SaladFinder") return;
    const key = createHash("sha256").update(value).digest("hex").slice(0, 16);
    catalog[key] = value;
    const call =
      "sfMessage(" + JSON.stringify(key) + "," + JSON.stringify(value) + ")";
    edits.push([
      node.start,
      node.end,
      kind === "expression" ? call : "{" + call + "}",
    ]);
  }
  function branch(node) {
    if (node?.type === "StringLiteral") replace(node, node.value, "expression");
    else if (node?.type === "ConditionalExpression") {
      branch(node.consequent);
      branch(node.alternate);
    }
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXText") {
      // Match JSX whitespace normalization: trim indentation, keeping inline spaces.
      const lines = node.value.replaceAll("\t", " ").split(/\r?\n/);
      const value = lines
        .map((s, i) => (i === 0 ? s : s.trimStart()))
        .map((s, i) => (i === lines.length - 1 ? s : s.trimEnd()))
        .filter(Boolean)
        .join(" ");
      replace(node, value, "jsx");
      return;
    }
    if (node.type === "JSXAttribute") {
      if (attributes.has(node.name.name)) {
        if (node.value?.type === "StringLiteral")
          replace(node.value, node.value.value, "jsx");
        else branch(node.value?.expression);
      }
      return;
    }
    if (node.type === "JSXExpressionContainer") branch(node.expression);
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(visit);
      else if (child?.type) visit(child);
  }
  visit(tree.program);
  let code = source;
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, start) + value + code.slice(end);
  return { code, catalog };
}
export function collect(dir) {
  const result = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, collect(path));
    else if (entry.name.endsWith(".tsx"))
      Object.assign(result, transformCopy(readFileSync(path, "utf8")).catalog);
  }
  return result;
}

// Include fixed validation and provider-status messages, never arbitrary API data.
export function errorCopy(dir) {
  const result = {};
  function add(text) {
    if (typeof text === "string" && /[A-Za-z]/.test(text))
      result[createHash("sha256").update(text).digest("hex").slice(0, 16)] =
        text;
  }
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (
      n.type === "ObjectProperty" &&
      ["message", "error", "title", "body"].includes(n.key?.name)
    )
      literal(n.value);
    if (n.type === "CallExpression" && n.callee.name === "fail")
      literal(n.arguments[1]);
    if (n.type === "CallExpression" && n.callee.property?.name === "setError")
      literal(n.arguments[0]);
    if (
      n.type === "NewExpression" &&
      ["Error", "ApiError"].includes(n.callee.name)
    )
      literal(n.arguments[0]);
    for (const c of Object.values(n))
      if (Array.isArray(c)) c.forEach(visit);
      else if (c?.type) visit(c);
  }
  function literal(n) {
    if (n?.type === "StringLiteral") add(n.value);
    if (n?.type === "ConditionalExpression") {
      literal(n.consequent);
      literal(n.alternate);
    }
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) Object.assign(result, errorCopy(path));
    else if (/\.tsx?$/.test(e.name))
      visit(
        parse(readFileSync(path, "utf8"), {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
        }).program,
      );
  }
  return result;
}
