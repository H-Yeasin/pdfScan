import { findScrollScript, markDocxMatches } from '../docxFind';
import { docxPageHtml } from '../docxService';

describe('Find in a DOCX (§12 D11)', () => {
  it('marks every match in the text, case-insensitively, numbering them in order', () => {
    const { html, count } = markDocxMatches('<p>Cell walls.</p><p>The <strong>cell</strong> membrane, cells</p>', ' CELL ');
    expect(count).toBe(3);
    expect(html).toBe(
      '<p><mark id="pdfscan-find-0" class="pdfscan-find pdfscan-current">Cell</mark> walls.</p>' +
        '<p>The <strong><mark id="pdfscan-find-1" class="pdfscan-find">cell</mark></strong> membrane, ' +
        '<mark id="pdfscan-find-2" class="pdfscan-find">cell</mark>s</p>'
    );
  });

  it('never touches tags or attributes', () => {
    const body = '<p><a href="https://cell.example">link</a><img alt="cell" src="data:image/png;base64,cell" /></p>';
    expect(markDocxMatches(body, 'cell')).toEqual({ html: body, count: 0 });
  });

  it('matches the decoded text and keeps entities whole', () => {
    const { html, count } = markDocxMatches('<p>R&amp;D &lt;3</p>', 'r&d');
    expect(count).toBe(1);
    expect(html).toBe('<p><mark id="pdfscan-find-0" class="pdfscan-find pdfscan-current">R&amp;D</mark> &lt;3</p>');
    // "amp" is not in the text the student sees.
    expect(markDocxMatches('<p>R&amp;D</p>', 'amp').count).toBe(0);
  });

  it('leaves the page alone without a query', () => {
    expect(markDocxMatches('<p>Text</p>', '   ')).toEqual({ html: '<p>Text</p>', count: 0 });
  });

  it('marks text written as a query would break out of (escaped by mammoth)', () => {
    const { html } = markDocxMatches('<p>&lt;script&gt;x&lt;/script&gt;</p>', 'script');
    expect(html).not.toContain('<script');
  });

  it('scrolls by a number only', () => {
    expect(findScrollScript(2)).toContain("getElementById('pdfscan-find-2')");
    expect(findScrollScript(-1.5)).toContain("'pdfscan-find-0'");
  });

  it('styles the marks only when asked, and keeps scripts out by CSP', () => {
    const plain = docxPageHtml('<p>x</p>', { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#0a0' });
    expect(plain).not.toContain('mark.pdfscan-find');
    expect(plain).toContain("default-src 'none'");
    const find = docxPageHtml('<p>x</p>', { bg: '#fff', ink: '#000', muted: '#666', edge: '#ccc', accent: '#0a0' }, { find: { fill: '#efe', current: '#0a0', onCurrent: '#fff' } });
    expect(find).toContain('mark.pdfscan-current { background: #0a0; color: #fff; }');
  });
});
