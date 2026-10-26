Math Renderer typesets block and inline LaTeX formulas in completed assistant replies as images. Block formulas have Show LaTeX and Copy LaTeX actions; tapping an inline formula shows its source. It is an experimental beta and requires Paseo 0.13.0 or newer on both the app and the daemon.

Rendering happens on the daemon host with MathJax and a bundled resvg WASM module, with no external rendering service. Replies stay native while streaming and formulas appear once the reply is complete. Parts of a reply without a formula, such as tables, images and code, keep Paseo's own Markdown rendering.

**Limits:**

- Paragraphs, lists and quotes that contain a formula are drawn by the plugin's own simple Markdown renderer, so code highlighting, workspace file links and native text selection are not reproduced there. Do not combine it with other plugins that replace assistant messages.
- An image, table or HTML inside a paragraph or list that also contains a formula keeps the whole reply native, as do very large replies.
- Chat Find finds text in rendered replies but not formula source. A Command Center action switches back to native replies for that.
- It was tested on a Paseo 0.13.2 daemon in the 0.13.2 web client. The desktop app and native iOS and Android are not accepted as tested.
