import { callScript, DOCX_BRIDGE_SCRIPT, DOCX_FIND_MAX, parseDocxMessage, scriptJson, type DocxCall } from '../docxBridge';

describe('parseDocxMessage', () => {
  it('reads each of the bridge\'s messages', () => {
    expect(parseDocxMessage('{"t":"ready"}')).toEqual({ type: 'ready' });
    expect(parseDocxMessage('{"t":"tap"}')).toEqual({ type: 'tap' });
    expect(parseDocxMessage('{"t":"scroll","y":120,"max":4000}')).toEqual({ type: 'scroll', y: 120, max: 4000 });
    expect(parseDocxMessage('{"t":"find","seq":3,"count":27,"index":2,"partial":false}')).toEqual({ type: 'find', seq: 3, count: 27, index: 2, partial: false });
    expect(parseDocxMessage('{"t":"find","seq":3,"count":0,"index":-1,"partial":false}')).toEqual({ type: 'find', seq: 3, count: 0, index: -1, partial: false });
    expect(parseDocxMessage('{"t":"link","href":"https://example.com/a"}')).toEqual({ type: 'link', href: 'https://example.com/a' });
  });

  it('rejects junk', () => {
    const junk: unknown[] = [
      undefined,
      null,
      1,
      { t: 'tap' },
      '',
      'tap',
      '"tap"',
      '[]',
      'null',
      '{',
      '{"t":"Tap"}',
      '{"t":"toString"}',
      '{"t":"__proto__"}',
      '{"type":"tap"}',
      // An extra or a missing field.
      '{"t":"tap","href":"https://example.com"}',
      '{"t":"scroll","y":1}',
      '{"t":"link"}',
      // Numbers out of range, or not numbers.
      '{"t":"scroll","y":-1,"max":10}',
      '{"t":"scroll","y":1.5,"max":10}',
      '{"t":"scroll","y":"1","max":10}',
      '{"t":"scroll","y":1,"max":1e12}',
      `{"t":"find","seq":1,"count":${DOCX_FIND_MAX + 1},"index":0,"partial":true}`,
      '{"t":"find","seq":1,"count":3,"index":3,"partial":false}',
      '{"t":"find","seq":1,"count":3,"index":-2,"partial":false}',
      '{"t":"find","seq":1,"count":3,"index":0,"partial":"no"}',
      '{"t":"link","href":""}',
      '{"t":"link","href":1}',
      `{"t":"link","href":"https://example.com/${'a'.repeat(2100)}"}`,
      `{"t":"tap"}${' '.repeat(5000)}`,
    ];
    for (const data of junk) expect(parseDocxMessage(data)).toBeNull();
  });

  it('hands a link on as text only: the scheme is checked by the caller', () => {
    expect(parseDocxMessage('{"t":"link","href":"javascript:alert(1)"}')).toEqual({ type: 'link', href: 'javascript:alert(1)' });
  });
});

describe('callScript', () => {
  it('calls one of the bridge\'s functions with JSON arguments', () => {
    expect(callScript('setNight', [true])).toBe('(function(){var b=window.__pdfscan;if(b)b.setNight.apply(null,[true]);})();true;');
    expect(callScript('setInsets', [88, 60, 0, 0])).toContain('b.setInsets.apply(null,[88,60,0,0])');
    expect(callScript('scrollToFraction', [Number.NaN])).toContain('apply(null,[0])');
  });

  it('refuses a name that is not on the list', () => {
    expect(() => callScript('constructor' as DocxCall, [])).toThrow();
    expect(() => callScript('find);alert(1);(' as DocxCall, [])).toThrow();
  });

  it('keeps a query from ending its string or the script', () => {
    const query = `"';</script><script>alert(1)</script>  \\`;
    const script = callScript('find', [query, 4]);
    expect(script).not.toContain('</script>');
    expect(script).not.toContain('<');
    expect(script).not.toContain(' ');
    expect(script).not.toContain(' ');
    // What the page receives is the query, character for character.
    const args = /apply\(null,(.*)\);\}\)\(\);true;$/.exec(script)![1];
    // eslint-disable-next-line no-eval
    expect((0, eval)(args)).toEqual([query, 4]);
  });

  it('escapes what JSON leaves alone', () => {
    expect(scriptJson('a<b>c')).toBe('"a\\u003cb\\u003ec"');
    expect(scriptJson(' ')).toBe('"\\u2028"');
    expect(scriptJson(' ')).toBe('"\\u2029"');
  });
});

describe('DOCX_BRIDGE_SCRIPT', () => {
  it('is fixed text that parses', () => {
    // Nothing is left to be filled in: the document and the query never become part of it.
    expect(DOCX_BRIDGE_SCRIPT).not.toContain('${');
    expect(() => new Function(DOCX_BRIDGE_SCRIPT)).not.toThrow();
  });

  it('defines the functions callScript calls, and posts the messages parseDocxMessage reads', () => {
    for (const name of ['find', 'findGo', 'setNight', 'setInsets', 'scrollToFraction']) expect(DOCX_BRIDGE_SCRIPT).toContain(`${name}: ${name}`);
    for (const kind of ['ready', 'tap', 'scroll', 'find', 'link']) expect(DOCX_BRIDGE_SCRIPT).toContain(`t: '${kind}'`);
    expect(DOCX_BRIDGE_SCRIPT).toContain(`var MAX = ${DOCX_FIND_MAX};`);
  });

  it('runs against a page: taps, links inside the document, the scroll position', () => {
    const posted: unknown[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    const body = { className: '', style: {} as Record<string, string> };
    const scrolled: number[] = [];
    const anchor = { getBoundingClientRect: () => ({ top: 500 }) };
    const fakeWindow = {
      ReactNativeWebView: { postMessage: (m: string) => posted.push(parseDocxMessage(m)) },
      innerHeight: 800,
      pageYOffset: 100,
      scrollTo: (_x: number, y: number) => scrolled.push(y),
      getSelection: () => '',
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        listeners[`window:${name}`] = fn;
      },
    } as Record<string, unknown>;
    const fakeDocument = {
      body,
      documentElement: { scrollHeight: 4800 },
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        listeners[name] = fn;
      },
      getElementById: (id: string) => (id === 'ch 2' ? anchor : null),
      getElementsByName: () => [],
    };
    new Function('window', 'document', 'setTimeout', DOCX_BRIDGE_SCRIPT)(fakeWindow, fakeDocument, (fn: () => void) => fn());
    expect(posted).toEqual([{ type: 'ready' }]);

    const bridge = fakeWindow.__pdfscan as Record<string, (...args: unknown[]) => void>;
    bridge.setNight(true);
    expect(body.className).toBe('night');
    bridge.setInsets(88, 60, 0, 24);
    expect(body.style).toEqual({ paddingTop: '108px', paddingBottom: '108px', paddingLeft: '18px', paddingRight: '42px' });
    bridge.scrollToFraction(0.5);
    expect(scrolled.pop()).toBe(2000);

    const click = (link: { getAttribute: () => string } | null) => {
      let prevented = false;
      listeners.click({ target: { closest: () => link }, preventDefault: () => (prevented = true) });
      return prevented;
    };
    click(null);
    expect(posted.pop()).toEqual({ type: 'tap' });
    // A link out is reported, never followed.
    expect(click({ getAttribute: () => 'https://example.com' })).toBe(true);
    expect(posted.pop()).toEqual({ type: 'link', href: 'https://example.com' });
    // A link inside the document scrolls there, clear of the top bar.
    expect(click({ getAttribute: () => '#ch%202' })).toBe(true);
    expect(scrolled.pop()).toBe(100 + 500 - 88 - 8);
    expect(posted).toHaveLength(1);

    listeners['window:scroll']({});
    expect(posted.pop()).toEqual({ type: 'scroll', y: 100, max: 4000 });
  });

  // The page's own Find, run in a real DOM (jsdom has no layout: every box is at 0, so only the
  // marking and the counting are checked here; where it scrolls to is a device check).
  describe('find', () => {
    function page(html: string) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { JSDOM } = require('jsdom') as { JSDOM: new (html: string, opts: object) => { window: Record<string, unknown> & { eval: (code: string) => void; document: Document } } };
      const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only' });
      const posted: ReturnType<typeof parseDocxMessage>[] = [];
      dom.window.ReactNativeWebView = { postMessage: (m: string) => posted.push(parseDocxMessage(m)) };
      dom.window.scrollTo = () => undefined;
      dom.window.eval(DOCX_BRIDGE_SCRIPT);
      const run = (name: DocxCall, args: (string | number | boolean)[]) => dom.window.eval(callScript(name, args));
      return { document: dom.window.document, posted, run };
    }

    it('marks every match in the text, whatever its case, and counts them', () => {
      const { document, posted, run } = page('<h1>The Cell</h1><p>the wall and <strong>THE</strong> membrane; other.</p>');
      run('find', ['the', 1]);
      const marks = [...document.querySelectorAll('mark.pdfscan-find')];
      expect(marks.map((m) => m.textContent)).toEqual(['The', 'the', 'THE', 'the']);
      expect(posted.pop()).toEqual({ type: 'find', seq: 1, count: 4, index: 0, partial: false });
      expect(marks[0].className).toBe('pdfscan-find pdfscan-current');
      // The text itself is unchanged.
      expect(document.body.textContent).toBe('The Cellthe wall and THE membrane; other.');
    });

    it('steps to a match without marking again', () => {
      const { document, posted, run } = page('<p>one two one two one</p>');
      run('find', ['one', 1]);
      run('findGo', [2, 1]);
      expect(posted.pop()).toEqual({ type: 'find', seq: 1, count: 3, index: 2, partial: false });
      const marks = [...document.querySelectorAll('mark')];
      expect(marks.map((m) => m.className)).toEqual(['pdfscan-find', 'pdfscan-find', 'pdfscan-find pdfscan-current']);
      // Past the end stays on the last one.
      run('findGo', [9, 1]);
      expect(posted.pop()).toMatchObject({ index: 2 });
    });

    it('takes the old marks out for a new query, and all of them for none', () => {
      const { document, posted, run } = page('<p>alpha beta alpha</p>');
      run('find', ['alpha', 1]);
      run('find', ['beta', 2]);
      expect([...document.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['beta']);
      expect(posted.pop()).toEqual({ type: 'find', seq: 2, count: 1, index: 0, partial: false });
      run('find', ['', 3]);
      expect(document.querySelectorAll('mark')).toHaveLength(0);
      expect(document.body.innerHTML).toBe('<p>alpha beta alpha</p>');
      expect(document.querySelector('p')!.childNodes).toHaveLength(1);
      expect(posted.pop()).toEqual({ type: 'find', seq: 3, count: 0, index: -1, partial: false });
    });

    it('treats the query as text, never as HTML or a pattern', () => {
      const { document, posted, run } = page('<p>a.c abc &lt;b&gt; x</p>');
      run('find', ['a.c', 1]);
      expect(posted.pop()).toMatchObject({ count: 1 });
      run('find', ['<b>', 2]);
      expect(posted.pop()).toMatchObject({ count: 1 });
      expect(document.querySelectorAll('b')).toHaveLength(0);
    });

    it('stops at the cap and says there are more', () => {
      const { document, posted, run } = page(`<p>${'x '.repeat(DOCX_FIND_MAX + 50)}</p><p>x</p>`);
      run('find', ['x', 1]);
      expect(document.querySelectorAll('mark')).toHaveLength(DOCX_FIND_MAX);
      expect(posted.pop()).toEqual({ type: 'find', seq: 1, count: DOCX_FIND_MAX, index: 0, partial: true });
    });
  });
});
