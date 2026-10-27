// CV'deki profil bağlantıları (GitHub vb.) ve LinkedIn adresinin metinden doğru çıkarılması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProfileLinks, extractContacts } from '../src/pipeline/text.js';
import { groundContacts } from '../src/pipeline/grounding.js';

const CV = `Barış Ceylan
Eskişehir | bcey2603@gmail.com | LinkedIn | GitHub
Deneyim ...
https://www.linkedin.com/in/bar%C4%B1%C5%9F-ceylan-177296256/
https://github.com/ceylanbariss
https://github.com/ceylanbariss/is-basvuru-botu
mailto:someone@github.com`;

test('profile links come from the CV text, LinkedIn excluded, deduplicated', () => {
  assert.deepEqual(extractProfileLinks(CV), [
    { label: 'GitHub', url: 'github.com/ceylanbariss' },
    { label: 'GitHub', url: 'github.com/ceylanbariss/is-basvuru-botu' },
  ]);
  assert.deepEqual(extractProfileLinks('github.com tek başına profil değildir'), []);
  assert.deepEqual(extractProfileLinks('Portfolyo: behance.net/ayse.tasarim.'), [{ label: 'Behance', url: 'behance.net/ayse.tasarim' }]);
});

test('linkedin from link annotations and links are attached by groundContacts', () => {
  assert.match(extractContacts(CV).linkedin, /^linkedin\.com\/in\//);
  const out = groundContacts(CV, { email: 'bcey2603@gmail.com', phone: '', linkedin: 'linkedin.com/in/uydurma' });
  assert.match(out.linkedin, /177296256/);
  assert.equal(out.links[0].url, 'github.com/ceylanbariss');
});
