/**
 * File: packages/eslint-config/rules/file-header.js
 * Purpose: Local ESLint rules that enforce CLAUDE.md Rule 1: every source file opens with one header
 * comment (file path, purpose, functions list) that matches the code, and holds no other comments.
 *
 * Functions:
 * - findRepoRoot(startPath): walks up from a file to the folder holding pnpm-workspace.yaml; returns it or null.
 * - getHeaderComment(sourceCode): returns the block comment that opens the file, or null.
 * - readListedFunctions(headerText): returns the names listed under "Functions:" in a header.
 * - collectDeclaredFunctions(program): returns name and node for every top-level function, function-valued const, method of a top-level object literal and class method.
 * - resolveRootDir(context): returns the repo root from the rule options or by searching upward.
 * - requireFileHeader.create(context): reports a missing header, a wrong "File:" path, or a missing Purpose/Functions section.
 * - noCommentsOutsideHeader.create(context): reports every comment other than the file header.
 * - headerListsFunctions.create(context): reports functions missing from the header and header entries with no matching function.
 */
import fs from "node:fs";
import path from "node:path";

const rootCache = new Map();

function findRepoRoot(startPath) {
  let dir = path.dirname(startPath);
  if (rootCache.has(dir)) return rootCache.get(dir);
  const visited = [];
  let found = null;
  while (true) {
    visited.push(dir);
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      found = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const v of visited) rootCache.set(v, found);
  return found;
}

function getHeaderComment(sourceCode) {
  const first = sourceCode.ast.comments[0];
  if (!first || first.type !== "Block") return null;
  const firstToken = sourceCode.ast.tokens[0];
  if (firstToken && firstToken.range[0] < first.range[0]) return null;
  return first;
}

function readListedFunctions(headerText) {
  const lines = headerText.split("\n");
  const start = lines.findIndex((line) => /^\s*\*?\s*Functions:/.test(line));
  if (start === -1) return [];
  const names = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s*\*?\s*-\s*([A-Za-z_$][\w$.]*)\s*\(/.exec(line);
    if (match) names.push(match[1].split(".").pop());
  }
  return names;
}

function collectDeclaredFunctions(program) {
  const declared = [];
  const unwrap = (node) =>
    node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
      ? node.declaration
      : node;
  for (const statement of program.body) {
    const node = unwrap(statement);
    if (!node) continue;
    if (node.type === "FunctionDeclaration" && node.id) {
      declared.push({ name: node.id.name, node });
    } else if (node.type === "VariableDeclaration") {
      for (const declarator of node.declarations) {
        const init = declarator.init;
        if (
          declarator.id.type === "Identifier" &&
          init &&
          (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")
        ) {
          declared.push({ name: declarator.id.name, node: declarator });
        } else if (init && init.type === "ObjectExpression") {
          for (const property of init.properties) {
            if (
              property.type === "Property" &&
              property.key.type === "Identifier" &&
              (property.method ||
                property.value.type === "ArrowFunctionExpression" ||
                property.value.type === "FunctionExpression")
            ) {
              declared.push({ name: property.key.name, node: property });
            }
          }
        }
      }
    } else if (node.type === "ClassDeclaration") {
      for (const member of node.body.body) {
        if (
          member.type === "MethodDefinition" &&
          member.kind !== "constructor" &&
          member.key.type === "Identifier"
        ) {
          declared.push({ name: member.key.name, node: member });
        }
      }
    }
  }
  return declared;
}

function resolveRootDir(context) {
  const option = context.options[0];
  if (option && option.rootDir) return option.rootDir;
  return findRepoRoot(context.filename);
}

const rootDirSchema = [
  {
    type: "object",
    properties: { rootDir: { type: "string" } },
    additionalProperties: false,
  },
];

export const requireFileHeader = {
  meta: {
    type: "problem",
    docs: { description: "Require the CLAUDE.md file header comment" },
    schema: rootDirSchema,
    messages: {
      missing:
        "File must start with a header comment: File path, Purpose and a Functions list (CLAUDE.md Rule 1).",
      wrongPath: 'Header says "File: {{found}}" but this file is {{expected}}.',
      missingSection: 'Header is missing the "{{section}}" section.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const header = getHeaderComment(context.sourceCode);
        if (!header) {
          context.report({ node, loc: { line: 1, column: 0 }, messageId: "missing" });
          return;
        }
        const text = header.value;
        for (const section of ["File:", "Purpose:", "Functions:"]) {
          if (!text.includes(section)) {
            context.report({ loc: header.loc, messageId: "missingSection", data: { section } });
          }
        }
        const fileMatch = /File:\s*(\S+)/.exec(text);
        const rootDir = resolveRootDir(context);
        if (fileMatch && rootDir) {
          const expected = path.relative(rootDir, context.filename).split(path.sep).join("/");
          if (fileMatch[1] !== expected) {
            context.report({
              loc: header.loc,
              messageId: "wrongPath",
              data: { found: fileMatch[1], expected },
            });
          }
        }
      },
    };
  },
};

export const noCommentsOutsideHeader = {
  meta: {
    type: "problem",
    docs: { description: "Disallow every comment except the file header" },
    schema: [],
    messages: {
      inline:
        "Inline comments are not allowed (CLAUDE.md Rule 1). Rename or extract a function and describe it in the file header.",
    },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode;
        const header = getHeaderComment(sourceCode);
        for (const comment of sourceCode.ast.comments) {
          if (comment === header) continue;
          context.report({ loc: comment.loc, messageId: "inline" });
        }
      },
    };
  },
};

export const headerListsFunctions = {
  meta: {
    type: "problem",
    docs: { description: "Keep the header Functions list in sync with the code" },
    schema: [],
    messages: {
      unlisted: '"{{name}}" is not listed under "Functions:" in the file header.',
      stale: 'The file header lists "{{name}}" but this file does not define it.',
    },
  },
  create(context) {
    return {
      Program(program) {
        const header = getHeaderComment(context.sourceCode);
        if (!header || !header.value.includes("Functions:")) return;
        const listed = readListedFunctions(header.value);
        const declared = collectDeclaredFunctions(program);
        const declaredNames = new Set(declared.map((d) => d.name));
        const listedNames = new Set(listed);
        for (const { name, node } of declared) {
          if (!listedNames.has(name)) {
            context.report({ node, messageId: "unlisted", data: { name } });
          }
        }
        for (const name of listedNames) {
          if (!declaredNames.has(name)) {
            context.report({ loc: header.loc, messageId: "stale", data: { name } });
          }
        }
      },
    };
  },
};
