import assert from 'node:assert/strict';
import { test } from 'node:test';

import { documentHtml, noteHtml, noteText } from '../src/lib/export/note-html.ts';

const darkPalette = {
  accent: '#d99a52',
  accentSoft: 'x',
  background: '#0b0a09',
  danger: 'x',
  line: 'x',
  onAccent: '#1a120a',
  reviewed: 'x',
  surface: '#161310',
  surfaceRaised: 'x',
  text: '#f3efe8',
  textDim: '#8b8378',
  transparent: 'transparent',
};
const body = {
  content: [
    { content: [{ marks: [{ type: 'bold' }], text: 'Big <day>', type: 'text' }], type: 'paragraph' },
    {
      content: [
        {
          attrs: { checked: true },
          content: [{ content: [{ text: 'Buy milk', type: 'text' }], type: 'paragraph' }],
          type: 'taskItem',
        },
        {
          attrs: { checked: false },
          content: [{ content: [{ text: 'Call home', type: 'text' }], type: 'paragraph' }],
          type: 'taskItem',
        },
      ],
      type: 'taskList',
    },
  ],
  type: 'doc',
};
const entry = {
  attachments: [],
  body,
  coverUri: null,
  createdAt: '2026-09-28T09:00:00.000Z',
  description: '',
  favorite: false,
  id: 'n1',
  latitude: null,
  locationLabel: 'Prishtina',
  longitude: null,
  mood: 'Calm',
  plainText: 'Big <day>\nBuy milk\nCall home',
  reviewed: false,
  sectionId: 'home',
  title: 'Sunday',
  todoItems: [],
  updatedAt: '2026-09-28T09:00:00.000Z',
};

test('a note document keeps its formatting and checklist, with text escaped', () => {
  const html = documentHtml(body);
  assert.match(html, /<strong>Big &lt;day&gt;<\/strong>/);
  assert.match(html, /<li class="done"><span class="box">✓<\/span><div><p>Buy milk<\/p><\/div><\/li>/);
  assert.match(html, /<li class=""><span class="box"><\/span><div><p>Call home<\/p><\/div><\/li>/);
});

test('the shared page uses the app colors and shows the title, folder, and details', () => {
  const html = noteHtml(entry, {
    folderName: 'Notes',
    images: { cover: 'data:image/jpeg;base64,AAA', photos: [] },
    palette: darkPalette,
  });
  assert.ok(html.includes(`background: ${darkPalette.background}`));
  assert.match(html, /<h1>Sunday<\/h1>/);
  assert.match(html, /class="folder">Notes</);
  assert.match(html, /<span>Calm<\/span><span>Prishtina<\/span>/);
  assert.match(html, /<img class="cover" src="data:image\/jpeg;base64,AAA">/);
});

test('only web links are kept as links', () => {
  const linked = {
    content: [
      {
        content: [
          { marks: [{ attrs: { href: 'javascript:alert(1)' }, type: 'link' }], text: 'bad', type: 'text' },
          { marks: [{ attrs: { href: 'https://example.com' }, type: 'link' }], text: 'good', type: 'text' },
        ],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
  const html = documentHtml(linked);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /<a href="https:\/\/example.com">good<\/a>/);
});

test('the text version marks checklist lines', () => {
  assert.equal(noteText(entry), 'Sunday\n\nBig <day>\n☑ Buy milk\n☐ Call home');
});

test('the note color fills the whole page, not only the written part', () => {
  const html = noteHtml(entry, { images: { photos: [] }, palette: darkPalette });
  assert.match(html, /\.page-bg \{ background: #0b0a09;[^}]*position: fixed;/);
  assert.match(html, /<body>\n<div class="page-bg"><\/div>/);
});

test('photos are small tiles in a grid below the note, and the cover is a banner', () => {
  const html = noteHtml(entry, {
    images: { cover: 'data:image/jpeg;base64,C', photos: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'] },
    palette: darkPalette,
  });
  assert.match(
    html,
    /<div class="photos"><img src="data:image\/jpeg;base64,A"><img src="data:image\/jpeg;base64,B"><\/div>/,
  );
  assert.match(html, /\.photos \{ display: grid;[^}]*grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(html, /\.cover \{ display: block; height: 220px;/);
});
