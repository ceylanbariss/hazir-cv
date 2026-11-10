// CV aracı: ilan bağlantısından metin getirme ve ön yazı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../src/llm/mock.js';
import { coverLetter } from '../src/pipeline/assist.js';
import { createJobFetcher, parseJobPage, linkedinGuestUrl } from '../src/pipeline/jobfetch.js';

const ctx = () => ({ llm: createMockProvider(), trace: [] });
const html = (body, status = 200, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (k) => ({ 'content-type': 'text/html; charset=utf-8', ...headers })[k.toLowerCase()] },
  text: async () => body,
});
const LONG = 'React ve TypeScript ile arayüz geliştirme, REST servisleri ile çalışma, Git kullanımı. '.repeat(4);

test('linkedinGuestUrl reads the job id from view and search links', () => {
  assert.equal(linkedinGuestUrl('https://www.linkedin.com/jobs/view/frontend-developer-at-acme-4123456789/?trk=x'), 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4123456789');
  assert.equal(linkedinGuestUrl('https://tr.linkedin.com/jobs/search/?currentJobId=4123456789&keywords=react'), 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4123456789');
  assert.equal(linkedinGuestUrl('https://www.kariyer.net/is-ilani/acme-frontend-4123456'), null);
});

test('parseJobPage prefers JobPosting JSON-LD', () => {
  const page = `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'JobPosting', title: 'Frontend Developer', hiringOrganization: { name: 'Acme' }, description: `<p>${LONG}</p><ul><li>2 yıl deneyim</li></ul>` }] })}</script></head><body>menü menü</body></html>`;
  const job = parseJobPage(page);
  assert.equal(job.title, 'Frontend Developer');
  assert.equal(job.company, 'Acme');
  assert.match(job.text, /2 yıl deneyim/);
  assert.doesNotMatch(job.text, /menü/);
});

test('parseJobPage reads the LinkedIn guest card', () => {
  const page = `<h2 class="top-card-layout__title font-sans">İş Analisti</h2><a class="topcard__org-name-link x" href="#">Thoth AI</a>
  <div class="show-more-less-html__markup relative"><p>${LONG}</p></div>
  <h3 class="description__job-criteria-subheader">Kıdem düzeyi</h3><span class="description__job-criteria-text">Giriş düzeyi</span>`;
  const job = parseJobPage(page, { source: 'linkedin' });
  assert.equal(job.title, 'İş Analisti');
  assert.equal(job.company, 'Thoth AI');
  assert.match(job.text, /Kıdem düzeyi: Giriş düzeyi/);
});

test('job fetcher maps LinkedIn to the guest endpoint and blocks internal redirects', async () => {
  const calls = [];
  const fetchJob = createJobFetcher({
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes('jobs-guest')) return html(`<div class="show-more-less-html__markup">${LONG}</div>`);
      if (url.includes('yonlen.com')) return html('', 302, { location: 'http://127.0.0.1/admin' });
      return html('<p>kısa</p>');
    },
  });
  const li = await fetchJob('https://www.linkedin.com/jobs/view/4123456789/');
  assert.equal(li.ok, true);
  assert.equal(li.source, 'linkedin');
  assert.match(calls[0], /jobs-guest\/jobs\/api\/jobPosting\/4123456789$/);
  assert.equal((await fetchJob('https://yonlen.com/ilan')).reason, 'blocked_redirect');
  assert.equal((await fetchJob('http://localhost:3000/x')).reason, 'invalid_url');
  assert.equal((await fetchJob('https://firma.com/ilan')).reason, 'too_short');
  assert.equal(calls.some((u) => u.includes('127.0.0.1')), false);
});

test('cover letter applies preferred phrasing and flags numbers not in the CV', async () => {
  const cv = 'Ayşe Yılmaz\nayse@x.com\nFrontend Developer stajyeri, React ve TypeScript ile 3 proje.';
  const out = await coverLetter(ctx(), { cv, jobPosting: 'Frontend Developer\nReact, TypeScript ve Git bilen ekip arkadaşı arıyoruz.', lang: 'tr', tone: 'formal' });
  assert.match(out.subject, /Başvurusu – Ayşe Yılmaz/);
  assert.match(out.letter, /büyük bir ilgiyle inceledim/);
  assert.doesNotMatch(out.letter, /takip ediyorum/);
  assert.match(out.letter, /Saygılarımla,\nAyşe Yılmaz$/);
  assert.deepEqual(out.unsupported, []);
  assert.ok(out.usedRequirements.includes('React'));
});
