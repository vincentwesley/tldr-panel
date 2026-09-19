// Tiny, safe markdown renderer: paragraphs, "-"/"*" bullets, numbered lists, "#" headings (as bold
// paragraphs), wrapped list items and **bold**. Builds DOM nodes with textContent only. Never uses innerHTML.

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

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

export function renderMarkdown(text, doc = document) {
  const frag = doc.createDocumentFragment();
  let list = null; // { el, type, items: [{li, text}] }
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = doc.createElement('p');
    appendInline(p, para.join(' '), doc);
    frag.appendChild(p);
    para = [];
  };
  const rerender = (item) => {
    item.li.replaceChildren();
    appendInline(item.li, item.text, doc);
  };
  const addItem = (type, content, start) => {
    flushPara();
    if (!list || list.type !== type) {
      const el = doc.createElement(type);
      if (type === 'ol' && start > 1) el.setAttribute('start', String(start));
      frag.appendChild(el);
      list = { el, type, last: null };
    }
    const li = doc.createElement('li');
    list.el.appendChild(li);
    list.last = { li, text: content };
    rerender(list.last);
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if (!line) {
      flushPara();
      list = null;
    } else if ((m = HEADING.exec(line))) {
      flushPara();
      list = null;
      const p = doc.createElement('p');
      const b = doc.createElement('strong');
      appendInline(b, m[1].replace(/\*\*/g, ''), doc);
      p.appendChild(b);
      frag.appendChild(p);
    } else if ((m = BULLET.exec(line)) && !/^\*\*/.test(line)) {
      addItem('ul', m[1]);
    } else if ((m = NUMBERED.exec(line))) {
      addItem('ol', m[2], Number(m[1]));
    } else if (list && list.last && (/^\s/.test(raw) || !/[.!?:]$/.test(list.last.text))) {
      // Wrapped list item: an indented line, or a line following an item that has not ended its sentence.
      list.last.text += ' ' + line;
      rerender(list.last);
    } else {
      list = null;
      para.push(line);
    }
  }
  flushPara();
  return frag;
}

/** Plain-text version of model markdown for the clipboard: no ** markers, "- " becomes "• ", numbering kept. */
export function toPlainText(text) {
  return String(text)
    .split(/\r?\n/)
    .map((raw) => {
      let line = raw.trim();
      line = line.replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '');
      const b = /^[-*•]\s+(.*)$/.exec(line);
      return b ? `• ${b[1]}` : line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
