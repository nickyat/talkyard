/*
 * Copyright (C) 2015, 2020 Kaj Magnus Lindberg
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// NEXT seems ok simple to create an IntLnRndr for internal link titles?
// And [[wiki style]] links and later #[tags]?  Check out TiddlyWiki?


// Relevant docs:
// - How Markdown-it works
//   https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md
// - How to replace part of text token with link?
//   https://github.com/markdown-it/markdown-it/blob/master/docs/development.md#how-to-replace-part-of-text-token-with-link
// - A simple way to replace link text: Example 2
//   https://github.com/markdown-it/markdown-it-for-inline
// - Replacing link attributes (but we replace the whole link / link text instead)
//   https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md#renderer,
//   see e.g. the "how to add target="_blank" to all links:" example.

interface Token {  // why won't tsconfig types: "markdown-it" work?
  type: St;
  // attrs[ix][0 = AtrNameIx] is the name of attr nr ix, and attrs[ix][1 = AtrValIx]
  // is its value.
  attrs: [St, St][] | Nl;
  attrIndex: (atrName: St) => Nr;
  attrPush: (atrNameAndValue: [St, St]) => U;
  content;
  markup?: St;
  tag?: St;
  map;
  nesting: Nr;
  level: Nr;
  children;
  info?: St;
  meta;
  block: Bo;
  hidden: Bo;
}


interface BlockLinkPreviewToken extends Token {
  link: St;
  level: Nr;
}


const AtrNameIx = 0;
const AtrValIx = 1;

let origLinkOpenRenderFn: (tokens: Token[], idx: Nr, options, env, self) => St;

function renderLinkOpen(tokens: Token[], idx: Nr, options, env, self): St {
  console.debug('TOKENS: ' + JSON.stringify(tokens, undefined, 4));
  // See https://github.com/markdown-it/markdown-it-for-inline#use
  // example 2 — which replaces the text in a link.
  const linkOpenToken = tokens[idx];
  const linkHrefAtrIx: Nr = linkOpenToken.attrIndex('href');
  const linkUrl = linkHrefAtrIx >= 0 && linkOpenToken.attrs[linkHrefAtrIx][AtrValIx];

  const textToken = tokens[idx + 1];
  const linkCloseToken = tokens[idx + 2];

  // Only linkify links like  "https://site/some/thing"
  // but not links with an explicitly choosen title, like "[link title](https://url")
  // or "<a href=...>link title</a>".
  // Apparently Markdown-it sets a markup field to 'linkify', for such
  // auto-detected links (the Markdown-it plugin Linkify-it does this I suppose).
  const isAutoLink = linkOpenToken.markup === 'linkify';

  if (isAutoLink && linkUrl && textToken?.type === 'text' &&
        linkCloseToken?.type === 'link_close') {
    const serverRenderer = debiki.internal.serverSideLinkPreviewRenderer;
    if (serverRenderer) {
      // We're server side. In case the string is a Nashorn ConsString,
      // which won't work now when calling back out to Scala/Java code:
      const linkJavaSt = String(linkUrl);
      const inlineJavaBo = Boolean(true);
      const pageTitle = serverRenderer.renderAndSanitizeLinkPreview( // [js_scala_interop]
              linkJavaSt, inlineJavaBo);
      textToken.content = pageTitle; // ` (${textToken.content})`;
    }
    else {
      const randomClass = 'c_LnPv-' + Math.random().toString(36).slice(2);  // [js_rand_val]

      const classAtrIx = linkOpenToken.attrIndex('class');
      if (classAtrIx >= 0) {
        const classAtrVal = linkOpenToken.attrs[classAtrIx][AtrValIx];
        linkOpenToken.attrs[classAtrIx][AtrValIx] =
              `${classAtrVal} icon icon-loading ${randomClass}`;
      } else {
        linkOpenToken.attrPush(['class', randomClass]);
      }

      console.log('3 tokens: ' +
            JSON.stringify([linkOpenToken, textToken, linkCloseToken], undefined, 3));

      console.log(`Fetching page title for: ${linkUrl}`)

      debiki2.Server.fetchLinkPreview(linkUrl, true /*inline*/, function(safeHtml) {
        const Bliss: Ay = window['Bliss'];

        // Dupl code! Break out fn. (897895245)
        function makeReplacement() {
          let repl;
          if (safeHtml) {
            repl = debiki2.$h.parseHtml(safeHtml)[0];
          }
          else {
            // No link preview available; show a plain <a href=...> link instead.
            // (rel=nofollow gets added here: [rel_nofollow] for no-preview-attempted
            // links.)
            // Sync w server side code [0PVLN].
            repl = Bliss.create('a', {
              href: linkUrl,
              // target: _blank — don't add! without also adding noopener on the next line:
              rel: 'nofollow',   // + ' noopener' — for [reverse_tabnabbing].
              text: linkUrl,
            });
          }
          return repl;
        }

        var placeholders = debiki2.$all('.' + randomClass);
        // The placeholders might have disappeared, if the editor was closed or the
        // text deleted, for example.
        _.each(placeholders, function(ph) {
          Bliss.after(makeReplacement(), ph);
          ph.remove();
        });
      });
    }
  }

  return origLinkOpenRenderFn(tokens, idx, options, env, self);
};

const pluginId = 'LnPvRndr';  // means LinkPreviewRenderer


/**
 * Converts a paragraph consisting of an unindented link to e.g. a YouTube snippet
 * or a Wikipedia article excerpt, depending on the link.
 * Differs from Discourse's onebox in that links have to be in separate paragraphs.
 */
debiki.internal.LinkPreviewMarkdownItPlugin = function(md) {
  md.block.ruler.before('paragraph', pluginId, tryParseLink);
  md.renderer.rules[pluginId] = renderLinkPreviewBlock;


  origLinkOpenRenderFn = md.renderer.rules.link_open ||
        function(tokens: Token[], idx: Nr, options, env, self): St {
          return self.renderToken(tokens, idx, options);
        }
  md.renderer.rules.link_open = renderLinkOpen;
};


function tryParseLink(state, startLineIndex, endLineIndex, whatIsThis) {
  var startLine = state.getLines(startLineIndex, startLineIndex + 1, state.blkIndent, false);

  // Ooops! cancels if 1st line not the link.
  if (startLine[0] !== 'h' || startLine[1] !== 't' || startLine[2] !== 't')
    return false;

  // Ooops! cancels if >= 2 lines in para.
  var nextLine = state.getLines(startLineIndex + 1, startLineIndex + 2, state.blkIndent, false);
  if (nextLine)
    return false;

  // SHOULD require only its own line, not its own paragraph! (Otherwise,
  // people don't "discover" the link preview functionality).
  if (state.parentType !== 'root' &&     // works with markdown-it 7
      state.parentType !== 'paragraph')  // works with markdown-it 8
    return false; // not a top level block

  var match = startLine.match(/^https?:\/\/[^\s]+\s*$/);
  if (!match)
    return false;

  if (whatIsThis) {
    console.warn('whatIsThis is not false, it is: ' + whatIsThis);
  }

  var link = match[0];
  state.line += 1;

  var token = state.push(pluginId, '') as BlockLinkPreviewToken;
  token.link = link;
  token.level = state.level;
  return true;
}


function renderLinkPreviewBlock(tokens: BlockLinkPreviewToken[], index: Nr,
        options, env, renderer_unused) {
  var token = tokens[index];
  var previewHtml;
  var serverRenderer = debiki.internal.serverSideLinkPreviewRenderer;
  if (serverRenderer) {
    // We're server side. In case the string is a Nashorn ConsString,
    // which won't work now when calling back out to Scala/Java code:
    const linkJavaSt = String(token.link);
    const inlineJavaBo = Boolean(false);
    previewHtml = serverRenderer.renderAndSanitizeLinkPreview( // [js_scala_interop]
          linkJavaSt, inlineJavaBo);
  }
  else {
    var randomClass = 'c_LnPv-' + Math.random().toString(36).slice(2);  // [js_rand_val]
    debiki2.Server.fetchLinkPreview(token.link, false /*inline*/, function(safeHtml) {
      const Bliss: Ay = window['Bliss'];

      // Dupl code! Break out fn. (897895245)
      function makeReplacement() {
        let repl;
        if (safeHtml) {
          repl = debiki2.$h.parseHtml(safeHtml)[0];
        }
        else {
          // No link preview available; show a plain <a href=...> link instead.
          // (rel=nofollow gets added here: [rel_nofollow] for no-preview-attempted
          // links.)
          // Sync w server side code [0PVLN].
          const link = Bliss.create('a', {
            href: token.link,
            // target: _blank — don't add! without also adding noopener on the next line:
            rel: 'nofollow',   // + ' noopener' — for [reverse_tabnabbing].
            text: token.link,
          });
          repl = Bliss.create('p', { around: link });
        }
        return repl;
      }

      var placeholders = debiki2.$all('.' + randomClass);
      // The placeholders might have disappeared, if the editor was closed or the
      // text deleted, for example.
      _.each(placeholders, function(ph) {
        Bliss.after(makeReplacement(), ph);
        ph.remove();
      });
    });
    var safeLink = debiki2.editor.sanitizeHtml(token.link);
    // The sanitizer must allow the id and class, see [6Q8KEF2] in
    // client/third-party/html-css-sanitizer-bundle.js.
    previewHtml =
          `<p class="${randomClass}"><a class="icon icon-loading">${safeLink}</a></p>`;
  }
  return previewHtml;
}


// vim: fdm=marker et ts=2 sw=2 tw=0 fo=tcqwn list
