/* global window */

"use strict";

function determineTokenType(token) {
    if (token.quoted) {
        return token;
    }

    switch (token.term.toLowerCase()) {
        case "(":
            token.groupOpen = true;
            token.groupMatch = ")";
            break;

        case ")":
            token.groupClose = true;
            break;

        case "not":
            token.not = true;
            break;

        case "and":
            token.and = true;
            break;

        case "or":
            token.or = true;
            break;
    }

    return token;
}

function readString(query, pos) {
    const startPos = pos;
    let result = "";
    const match = query.charAt(pos);
    pos += 1;
    let c = query.charAt(pos);

    while (c !== match && c !== "") {
        result += c;

        if (c === "\\") {
            pos += 1;
            result += query.charAt(pos);
        }

        pos += 1;
        c = query.charAt(pos);
    }

    if (c !== match) {
        throw new Error(`Unclosed string at character ${startPos}`);
    }

    return {
        token: determineTokenType({
            term: result,
            quoted: true
        }),
        pos: pos + 1
    };
}

function readToken(query, pos) {
    let result = "";
    let c = query.charAt(pos);

    // Do not use hyphen here as a separator. Only allow it as an operator at
    // the beginning of a term
    while (c.length && " \n\r\t\f\v()".indexOf(c) === -1) {
        result += c;
        pos += 1;
        c = query.charAt(pos);
    }

    const token = determineTokenType({
        term: result,
        quoted: false
    });

    return {
        token: token,
        pos: pos
    };
}

function parseQueryToTokens(query) {
    const tokens = [];
    let pos = 0;

    while (pos < query.length) {
        const c = query.charAt(pos);
        let result;

        switch (c) {
            case " ":
            case "\n":
            case "\r":
            case "\t":
            case "\f":
            case "\v":
                // Whitespace
                pos += 1;
                break;

            case '"':
                result = readString(query, pos);
                tokens.push(result.token);
                pos = result.pos;
                break;

            case "(":
            case ")":
                tokens.push(
                    determineTokenType({
                        term: c,
                        quoted: false
                    })
                );
                pos += 1;
                break;

            default:
                result = readToken(query, pos);
                tokens.push(result.token);
                pos = result.pos;
                break;
        }
    }

    return tokens;
}

function getToken(tokens) {
    const token = tokens.shift();

    if (!token) {
        throw new Error("Ran out of tokens");
    }

    return token;
}

function applyNegated(node) {
    if (node.left) {
        applyNegated(node.left);

        if (node.right) {
            applyNegated(node.right);

            if (node.operation === "OR") {
                node.operation = "AND";
            } else {
                // both '<implicit>' and 'AND'
                node.operation = "OR";
            }
        }
    } else {
        node.negated = !node.negated;
    }

    return node;
}

// The next token is guaranteed to be a term or group
function buildNode(tokens) {
    const token = getToken(tokens);

    if (token.groupClose) {
        throw new Error("Unexpected closing of a group");
    }

    if (token.groupOpen) {
        const result = buildTreeNode(tokens);
        const closing = tokens.shift();

        if (token.groupMatch !== closing.term) {
            throw new Error("Invalid balancing of groups");
        }

        return result;
    }

    return token;
}

function buildNodeWithNegation(tokens) {
    if (tokens[0] && tokens[0].not) {
        tokens.shift();

        return applyNegated(buildNode(tokens));
    }

    return buildNode(tokens);
}

function buildTreeNode(tokens, left) {
    if (!left) {
        left = buildNodeWithNegation(tokens);
    }

    let operation = "<implicit>";

    if (!tokens.length) {
        return left;
    }

    if (tokens[0].and || tokens[0].or) {
        operation = tokens[0].and ? "AND" : "OR";
        tokens.shift();

        if (!tokens.length) {
            throw new Error("Encountered operator at end");
        }
    }

    let right = buildNodeWithNegation(tokens);

    if (tokens.length) {
        right = buildTreeNode(tokens, right);
    }

    return {
        left,
        operation,
        right
    };
}

function buildWildcardRegex(leaf) {
    let term = leaf.term;
    let startAnchor = "\\b";
    let endAnchor = "\\b";

    if (term.charAt(0) === "*") {
        term = term.substr(1);
        startAnchor = "";
    }

    if (term.charAt(term.length - 1) === "*") {
        term = term.substr(0, term.length - 1);
        endAnchor = "";
    }

    term = term
        .split(/\*/)
        .map((fragment) => {
            const wordBits = fragment.split(/[^\w']+/);

            while (wordBits[0] === "") {
                wordBits.shift();
            }

            while (wordBits[wordBits.length - 1] === "") {
                wordBits.pop();
            }

            return wordBits.join(`[^\\w']+`);
        })
        .join("[\\w_]*");

    return `${startAnchor}${term}${endAnchor}`;
}

function buildMatcherLeaf(leaf, flags) {
    let pattern;

    if (leaf.quoted) {
        pattern = leaf.term.replace(/\W/g, '\\$&');
    } else {
        pattern = buildWildcardRegex(leaf);
    }

    const regexFlags = flags.caseInsensitive ? "ig" : "g";
    const regex = new RegExp(pattern, regexFlags);

    if (leaf.negated) {
        if (flags.multi) {
            return (input) => {
                return input.every((item) => !regex.test(item));
            };
        }

        if (flags.returnPositions) {
            return (input) => {
                if (!regex.test(input)) {
                    return [];
                }

                return false;
            };
        }

        return (input) => !regex.test(input);
    }

    if (flags.multi) {
        return (input) => {
            return input.some((item) => regex.test(item));
        };
    }

    if (flags.returnPositions) {
        return (input) => {
            let result = regex.exec(input);
            const matches = [];

            while (result !== null) {
                if (regex.lastIndex === result.index) {
                    return [];
                }

                matches.push([result.index, regex.lastIndex]);
                result = regex.exec(input);
            }

            if (matches.length) {
                return matches;
            }

            return false;
        };
    }

    return (input) => regex.test(input);
}

function buildMatcher(tree, flags) {
    if (tree.operation) {
        const left = buildMatcher(tree.left, flags);
        const right = buildMatcher(tree.right, flags);

        if (tree.operator === "OR") {
            return (input) => left(input) || right(input);
        }

        if (flags.returnPositions) {
            return (input) => {
                const a = left(input);

                if (!a) {
                    return false;
                }

                const b = right(input);

                if (!b) {
                    return false;
                }

                return [].concat(a, b);
            };
        }

        return (input) => left(input) && right(input);
    }

    return buildMatcherLeaf(tree, flags);
}

/* The flags object is optional and may have these properties:
 *
 *  * caseInsensitive (boolean): Enable case insensitive searching.
 *  * multi (boolean): The generated matching function will accept an array of
 *    strings instead of a single string.
 *  * returnPositions (boolean): Instead of returning a boolean, the matching
 *    function returns an array of positions used to match. Incompatible with
 *    "multi". Example response is [[1, 3], [10, 14]] indicating
 *    input.substring(1, 3) and input.substring(10, 14) were both used.
 */
window.simpleQuery = (query, flags) => {
    const tokens = parseQueryToTokens(query);
    const tree = buildTreeNode(tokens);
    const matcher = buildMatcher(tree, flags || {});

    return matcher;
};
