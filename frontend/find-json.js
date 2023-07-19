/* global window */

"use strict";

window.findJson = function (stringToTest) {
    function findNextOpeningIndex(str, start) {
        const brace = str.indexOf('{', start);
        const bracket = str.indexOf('[', start);

        if (brace === -1) {
            return bracket;
        }

        if (bracket === -1) {
            return brace;
        }

        return Math.min(brace, bracket);
    }

    function findEndOfString(str, pos) {
        let c = str.charAt(pos);

        while (c !== '"') {
            if (c === '') {
                return -1;
            }

            if (c === '\\') {
                pos += 2;
            } else {
                pos += 1;
            }

            c = str.charAt(pos);
        }

        return pos + 1;
    }

    function findEndOfJson(str, pos) {
        let depth = 0;
        let c = str.charAt(pos);

        while (c !== '') {
            if (c === '{' || c === '[') {
                depth += 1;
                pos += 1;
            } else if (c === '}' || c === ']') {
                depth -= 1;
                pos += 1;
            } else if (c === '"') {
                pos = findEndOfString(str, pos + 1);
            } else {
                pos += 1;
            }

            if (depth === 0) {
                return pos;
            }

            c = str.charAt(pos);
        }

        return -1;
    }

    function testForJson(str, start) {
        const end = findEndOfJson(str, start);

        if (end === -1) {
            return null;
        }

        const json = str.substring(start, end);

        try {
            const parsed = JSON.parse(json);

            return {
                start: start,
                end: end,
                parsed: parsed
            };
        } catch (ignore) {
            return null;
        }
    }

    let start = 0;
    let nextIndex = findNextOpeningIndex(stringToTest, start);
    const matches = [];

    while (nextIndex >= 0) {
        const result = testForJson(stringToTest, nextIndex);

        if (result) {
            matches.push(result);
            start = result.end + 1;
        } else {
            start = nextIndex + 1;
        }

        nextIndex = findNextOpeningIndex(stringToTest, start);
    }

    return matches.length ? matches : null;
};
