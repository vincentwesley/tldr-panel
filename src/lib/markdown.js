// Tiny, safe markdown renderer: paragraphs, "-"/"*" bullets, **bold**.
// Builds DOM nodes with textContent only. Never uses innerHTML.

function appendInline(parent, text, doc) {
  for (const part of text.split(/(\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      const b = doc.createElement('strong');
      b.textContent = m[1];
      parent.appendChild(b);
    } else {
      parent.appendChild(doc.createTextNode(part));
    }
  }
}

export function renderMarkdown(text, doc = document) {
  const frag = doc.createDocumentFragment();
  let list = null;
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = doc.createElement('p');
    appendInline(p, para.join(' '), doc);
    frag.appendChild(p);
    para = [];
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!list) {
        list = doc.createElement('ul');
        frag.appendChild(list);
      }
      const li = doc.createElement('li');
      appendInline(li, bullet[1], doc);
      list.appendChild(li);
    } else if (!line) {
      flushPara();
      list = null;
    } else {
      list = null;
      para.push(line);
    }
  }
  flushPara();
  return frag;
}
