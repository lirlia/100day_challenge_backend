'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState, useEffect, useCallback } from 'react';

// --- ヘルパー関数 ---
const getDirectiveValuesFromString = (cspString: string, directiveKey: string): string[] => {
  if (!cspString) return [];
  const directives = cspString.split(';').map(d => d.trim().toLowerCase()); // 小文字で統一
  const targetDirective = directives.find(d => d.startsWith(directiveKey.toLowerCase() + ' '));
  if (targetDirective) {
    return targetDirective.substring(directiveKey.length + 1).trim().split(/\s+/);
  }
  // default-src のフォールバックも考慮
  if (directiveKey.toLowerCase() !== 'default-src') {
    const defaultSrc = directives.find(d => d.startsWith('default-src '));
    if (defaultSrc) {
      return defaultSrc.substring('default-src'.length + 1).trim().split(/\s+/);
    }
  }
  return [];
};

const checkCspSourcePermissionLogic = (
  cspString: string,
  directiveKey: 'script-src' | 'style-src' | 'img-src' | 'connect-src' | 'frame-src' | 'font-src' | 'object-src',
  sourceToTest: string // 'self', 'unsafe-inline', 'unsafe-eval', 'data:', 'blob:', or a URL
): { allowed: boolean; reason: string } => {
  if (!cspString) return { allowed: true, reason: "CSP未設定 (ブラウザデフォルト)" };

  const directiveKeyLower = directiveKey.toLowerCase();
  const sourceToTestLower = sourceToTest.toLowerCase(); // ソースも小文字で比較

  let values = getDirectiveValuesFromString(cspString, directiveKeyLower);
  let usedDefaultSrc = false;

  if (values.length === 0 && directiveKeyLower !== 'default-src') {
    values = getDirectiveValuesFromString(cspString, 'default-src');
    if (values.length > 0) {
      usedDefaultSrc = true;
    } else {
      // ディレクティブもdefault-srcも無い場合、通常は許可 (object-srcなどは除く)
      if (directiveKeyLower === 'object-src' || directiveKeyLower === 'plugin-types')
        return { allowed: false, reason: `${directiveKey} と default-src が未指定 (このタイプは通常'none'扱い)` };
      return { allowed: true, reason: `${directiveKey} と default-src が未指定 (通常許可)` };
    }
  }

  const directiveLabel = usedDefaultSrc ? `default-src (as ${directiveKey})` : directiveKey;

  if (values.includes("'none'")) return { allowed: false, reason: `${directiveLabel}で 'none' 指定のためブロック` };
  if (values.includes("*")) return { allowed: true, reason: `${directiveLabel}で '*' 指定のため許可` };

  // キーワードチェック (シングルクォート込みで比較)
  if (sourceToTestLower.startsWith("'") && sourceToTestLower.endsWith("'")) {
    if (values.includes(sourceToTestLower)) return { allowed: true, reason: `${directiveLabel}で ${sourceToTest} が許可` };
  }
  // スキームチェック (例: data:, blob:)
  else if (sourceToTestLower.endsWith(":")) {
    if (values.includes(sourceToTestLower)) return { allowed: true, reason: `${directiveLabel}で ${sourceToTest} スキームが許可` };
  }
  // URLチェック
  else if (sourceToTestLower.startsWith("http")) {
    const sourceUrl = new URL(sourceToTestLower);
    if (values.some(v => {
      if (v.startsWith("http")) {
        try {
          const allowedUrl = new URL(v);
          // ホスト名が一致し、パスが前方一致するか (または許可側がルートパス)
          return allowedUrl.protocol === sourceUrl.protocol &&
                 allowedUrl.hostname === sourceUrl.hostname &&
                 (sourceUrl.pathname.startsWith(allowedUrl.pathname) || allowedUrl.pathname === '/');
        } catch (e) { return false; }
      } else if (v.startsWith("*.")) { // *.example.com
         return sourceUrl.hostname.endsWith(v.substring(1));
      }
      return false;
    })) {
      return { allowed: true, reason: `${directiveLabel}の許可リストに ${sourceToTest} がマッチ` };
    }
  }

  // 'self' が指定されている場合、かつ他のどのルールにも一致しなかった場合 (主にURLの場合)
  if (values.includes("'self'") && sourceToTestLower.startsWith("http")){
      // ここでは 'self' は現在のオリジンのみを指すので、外部URLは'self'では許可されない扱いとする
      // (実際にはオリジンが一致すれば許可されるが、ここではsourceToTestが外部URLであることを前提とする)
  }
  // 'self' の明示的な許可があるか (valuesに'self'が含まれている場合は上で処理されるべき)
  // フォールバックとしての 'self' (特定ディレクティブに何も指定がなく、default-srcにも'self'がない場合など)
  // 非常に複雑なため、この簡易パーサーでは「明示的な許可がない限り不許可」とする。

  return { allowed: false, reason: `${directiveLabel}の許可リストに ${sourceToTest} がマッチせずブロック` };
};

// CSPディレクティブの型定義 (変更なし)
interface CspDirectiveOption {
  name: string; label: string; enabled: boolean;
}
interface CspDirective {
  key: string; label: string; options: CspDirectiveOption[]; customValue: string; isActive: boolean;
}
interface InitialDirectiveDataEntry {
  key: string; label: string; isActive: boolean; optionsData: Omit<CspDirectiveOption, 'enabled'>[]; customValue: string;
}

const initialDirectivesData: InitialDirectiveDataEntry[] = [
  { key: 'default-src', label: "Default Source (default-src)", isActive: true, optionsData: [ { name: "'self'", label: "'self'" }, { name: "'none'", label: "'none'" }, ], customValue: '' },
  { key: 'script-src', label: "Script Source (script-src)", isActive: true, optionsData: [ { name: "'self'", label: "'self'" }, { name: "'unsafe-inline'", label: "'unsafe-inline'" }, { name: "'unsafe-eval'", label: "'unsafe-eval'" }, ], customValue: 'https://cdnjs.cloudflare.com' },
  { key: 'style-src', label: "Style Source (style-src)", isActive: true, optionsData: [ { name: "'self'", label: "'self'" }, { name: "'unsafe-inline'", label: "'unsafe-inline'" }, ], customValue: 'https://fonts.googleapis.com' },
  { key: 'img-src', label: "Image Source (img-src)", isActive: true, optionsData: [ { name: "'self'", label: "'self'" }, { name: 'data:', label: 'data:' }, { name: 'blob:', label: 'blob:' }, ], customValue: 'https://picsum.photos' },
  { key: 'connect-src', label: "Connect Source (connect-src)", isActive: true, optionsData: [{ name: "'self'", label: "'self'" }], customValue: '' },
  { key: 'frame-src', label: "Frame Source (frame-src)", isActive: true, optionsData: [{ name: "'self'", label: "'self'" }], customValue: 'https://example.com' },
  { key: 'object-src', label: "Object Source (object-src)", isActive: true, optionsData: [{ name: "'none'", label: "'none'" }], customValue: '' },
  { key: 'frame-ancestors', label: "Frame Ancestors (frame-ancestors)", isActive: true, optionsData: [ { name: "'self'", label: "'self'" }, { name: "'none'", label: "'none'" } ], customValue: '' },
];

const initializeDirectives = (): CspDirective[] => initialDirectivesData.map(d => ({ ...d, options: d.optionsData.map(opt => ({ ...opt, enabled: false })) }));

export default function CspDemoPage() {
  const [directives, setDirectives] = useState<CspDirective[]>(initializeDirectives());
  const [generatedCsp, setGeneratedCsp] = useState<string>('');
  const [currentAppliedCsp, setCurrentAppliedCsp] = useState<string>('');

  useEffect(() => {
    const cookieValue = document.cookie.split('; ').find(row => row.startsWith('security-settings='))?.split('=')[1];
    if (cookieValue) try { setCurrentAppliedCsp(JSON.parse(decodeURIComponent(cookieValue)).csp || ''); } catch (e) { console.error("Failed to parse CSP from cookie for display", e); setCurrentAppliedCsp('Cookie parse error'); }
    else { setCurrentAppliedCsp('CSP not set in cookie'); }
  }, []);

  const handleDirectiveToggle = (key: string) => setDirectives(p => p.map(d => d.key === key ? { ...d, isActive: !d.isActive } : d));
  const handleOptionToggle = (key: string, name: string) => setDirectives(p => p.map(d => d.key === key ? { ...d, options: d.options.map(o => o.name === name ? { ...o, enabled: !o.enabled } : o) } : d));
  const handleCustomValueChange = (key: string, val: string) => setDirectives(p => p.map(d => d.key === key ? { ...d, customValue: val } : d));

  const generateCspString = useCallback(() => directives.filter(d => d.isActive).map(d => {
    const sources = d.options.filter(o => o.enabled).map(o => o.name);
    if (d.customValue.trim()) sources.push(...d.customValue.trim().split(/\s+/).filter(s => s));
    return sources.length ? `${d.key} ${sources.join(' ')}` : '';
  }).filter(p => p).join('; '), [directives]);

  useEffect(() => { setGeneratedCsp(generateCspString()); }, [directives, generateCspString]);

  // Test bench states
  const [inlineScriptResult, setInlineScriptResult] = useState('未実行');
  const [inlineScriptTagResult, setInlineScriptTagResult] = useState('未実行');
  const [externalScriptStatus, setExternalScriptStatus] = useState('未試行');
  const [inlineStyleResult, setInlineStyleResult] = useState('未確認');
  const [externalCSSStatus, setExternalCSSStatus] = useState('未確認');
  const [fontStatus, setFontStatus] = useState('未確認');
  const [iframeStatus, setIframeStatus] = useState('未試行');
  const [imgExtStatus, setImgExtStatus] = useState(true);
  const [imgDataStatus, setImgDataStatus] = useState(true);
  const [imgSelfStatus, setImgSelfStatus] = useState(true);

  // Expected behavior states
  const initialExpected = { text: '判定中...', color: 'text-gray-400' };
  const [expectedInlineEval, setExpectedInlineEval] = useState(initialExpected);
  const [expectedInlineScriptTag, setExpectedInlineScriptTag] = useState(initialExpected);
  const [expectedExternalScript, setExpectedExternalScript] = useState(initialExpected);
  const [expectedExternalCss, setExpectedExternalCss] = useState(initialExpected);
  const [expectedInlineStyle, setExpectedInlineStyle] = useState(initialExpected);
  const [expectedFont, setExpectedFont] = useState(initialExpected);
  const [expectedImgExt, setExpectedImgExt] = useState(initialExpected);
  const [expectedImgSelf, setExpectedImgSelf] = useState(initialExpected);
  const [expectedImgData, setExpectedImgData] = useState(initialExpected);
  const [expectedIframe, setExpectedIframe] = useState(initialExpected);

  useEffect(() => {
    if (currentAppliedCsp && currentAppliedCsp !== 'Cookie parse error' && currentAppliedCsp !== 'CSP not set in cookie') {
      const updateExpected = (setter: Function, check: {allowed: boolean; reason: string}) => {
        setter({
          text: `${check.allowed ? '許可される見込み' : 'ブロックされる見込み'}: ${check.reason}`,
          color: check.allowed ? 'text-green-400' : 'text-red-400' // より明確な色に
        });
      };
      updateExpected(setExpectedInlineEval, checkCspSourcePermissionLogic(currentAppliedCsp, 'script-src', "'unsafe-eval'"));
      updateExpected(setExpectedInlineScriptTag, checkCspSourcePermissionLogic(currentAppliedCsp, 'script-src', "'unsafe-inline'"));
      updateExpected(setExpectedExternalScript, checkCspSourcePermissionLogic(currentAppliedCsp, 'script-src', 'https://cdnjs.cloudflare.com'));
      updateExpected(setExpectedExternalCss, checkCspSourcePermissionLogic(currentAppliedCsp, 'style-src', "'self'")); // /test-external.css
      updateExpected(setExpectedInlineStyle, checkCspSourcePermissionLogic(currentAppliedCsp, 'style-src', "'unsafe-inline'"));
      updateExpected(setExpectedFont, checkCspSourcePermissionLogic(currentAppliedCsp, 'font-src', 'https://fonts.gstatic.com'));
      updateExpected(setExpectedImgExt, checkCspSourcePermissionLogic(currentAppliedCsp, 'img-src', 'https://picsum.photos'));
      updateExpected(setExpectedImgSelf, checkCspSourcePermissionLogic(currentAppliedCsp, 'img-src', "'self'"));
      updateExpected(setExpectedImgData, checkCspSourcePermissionLogic(currentAppliedCsp, 'img-src', 'data:'));
      updateExpected(setExpectedIframe, checkCspSourcePermissionLogic(currentAppliedCsp, 'frame-src', 'https://example.com'));
    } else {
      const defaultText = currentAppliedCsp ? currentAppliedCsp : 'CSP未適用';
      [setExpectedInlineEval, setExpectedInlineScriptTag, setExpectedExternalScript, setExpectedExternalCss, setExpectedInlineStyle, setExpectedFont, setExpectedImgExt, setExpectedImgSelf, setExpectedImgData, setExpectedIframe].forEach(setter => setter({ text: defaultText, color: 'text-gray-500' }));
    }
  }, [currentAppliedCsp]);

  const attemptInlineScriptEval = () => {
    try {
      eval("document.getElementById('inline-script-eval-result-text').innerText='インラインeval実行成功!'; alert('インラインeval実行!')");
      setInlineScriptResult('実行成功');
    } catch(e){
      console.error(e);
      setInlineScriptResult('実行ブロック');
    }
  };

  useEffect(() => {
    const se = (id: string, ok: boolean) => { const el = document.getElementById(id); if (el) el.className = ok ? 'text-green-400' : 'text-red-400'; };
    (window as any).inlineScriptTagExecuted ? setInlineScriptTagResult('実行成功') : setInlineScriptTagResult('未実行/ブロック');
    const isl = document.getElementById('test-inline-style-attr'); if(isl) setInlineStyleResult(window.getComputedStyle(isl).backgroundColor === 'rgb(255, 165, 0)' ? '適用成功' : '適用失敗/ブロック');
    const ecss = document.getElementById('test-external-css'); if(ecss) setExternalCSSStatus(window.getComputedStyle(ecss).textDecorationLine === 'underline' ? '適用成功' : '適用失敗/ブロック'); se('external-css-status-text', externalCSSStatus.includes('成功'));
    const ft = document.getElementById('font-orbitron-csp-test-el'); if(ft) setFontStatus(window.getComputedStyle(ft).fontFamily.toLowerCase().includes('orbitron') ? '適用成功' : '適用失敗/ブロック'); se('font-status-text', fontStatus.includes('成功'));
  }, [currentAppliedCsp, inlineStyleResult, externalCSSStatus, fontStatus]);

  const cspDescriptionJsx = (
    <div className="text-sm text-gray-300 space-y-2">
      <p>
        Content Security Policy (CSP) は、XSS等の攻撃を検知・軽減するセキュリティレイヤーです。
      </p>

      <p><strong>誰が:</strong> Web開発者・管理者が設定。</p>
      <div>
        <p><strong>何のために:</strong></p>
        <ul className="list-disc list-inside pl-5 space-y-1 mt-1">
          <li>信頼できるコンテンツソースをホワイトリスト指定。</li>
          <li>危険なJS利用(インラインスクリプト、eval)を制限。</li>
          <li>フォーム送信先やiframe埋込等を制御。</li>
          <li>ポリシー違反をレポート。</li>
        </ul>
      </div>
      <div>
        <p><strong>どこで:</strong></p>
        <ul className="list-disc list-inside pl-5 space-y-1 mt-1">
          <li>主にHTTPレスポンスヘッダー(<code>Content-Security-Policy: ...</code>)で設定。推奨。</li>
          <li>HTML<code>&lt;meta&gt;</code>タグでも一部可(制限あり)。</li>
        </ul>
      </div>
      <p className="pt-2">このデモで各ディレクティブを設定し生成されたCSPを適用・リロード後、下部テストベンチで動作を確認できます。</p>
    </div>
  );

  const TestItem: React.FC<{title: string, expectation: {text: string, color: string}, actual: string, actualColor?: string, notes: string, children?: React.ReactNode}> =
    ({title, expectation, actual, actualColor, notes, children}) => (
    <div className="mb-3 p-2.5 border border-dashed border-gray-600/70 rounded-md bg-gray-800/60 shadow-sm">
      <h4 className="text-[0.9rem] font-medium mb-1 text-gray-200">{title}</h4>
      <p className={`text-[0.65rem] mb-1 ${expectation.color}`}><span className="font-semibold">CSP予測:</span> {expectation.text}</p>
      {children}
      <p className={`text-[0.7rem] mt-1 ${actualColor || (actual.includes('ブロック') || actual.includes('失敗') || actual.includes('未実行') ? 'text-red-400' : 'text-green-400')}`}>実行結果: {actual}</p>
      <p className="text-[0.6rem] text-gray-500 mt-0.5">{notes}</p>
    </div>
  );

  return (
    <div className="pb-12">
      <SecurityHeaderController featureKey="csp" title="CSP Builder & Test Bench" description={cspDescriptionJsx}
        currentPolicyDisplay={ <div className="text-xs"> <p className="font-semibold text-gray-400">現在適用中 (Cookie値):</p> <p className="text-sky-400 break-all text-[0.7rem]">{currentAppliedCsp || 'N/A'}</p> </div> }
        policyToApply={generatedCsp}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 mt-3.5">
          {directives.map(directive => (
            <div key={directive.key} className="p-2.5 border border-gray-700/80 rounded-lg bg-gray-800/50 shadow">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor={`toggle-${directive.key}`} className="flex items-center cursor-pointer w-full">
                  <input type="checkbox" id={`toggle-${directive.key}`} checked={directive.isActive} onChange={() => handleDirectiveToggle(directive.key)} className="form-checkbox h-4 w-4 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-offset-gray-800 focus:ring-sky-600"/>
                  <span className="ml-2 text-[0.8rem] font-semibold text-sky-300 hover:text-sky-200">{directive.label}</span>
                </label>
              </div>
              {directive.isActive && (
                <div className="space-y-1 pl-4 border-l-2 border-gray-700/40 ml-1.5 text-[0.75rem]">
                  {directive.options.map(option => (
                    <label key={option.name} htmlFor={`${directive.key}-${option.name}`} className="flex items-center text-gray-300 hover:text-sky-300">
                      <input type="checkbox" id={`${directive.key}-${option.name}`} checked={option.enabled} onChange={() => handleOptionToggle(directive.key, option.name)} className="form-checkbox h-3 w-3 text-sky-500 bg-gray-600/80 border-gray-500/80 rounded focus:ring-offset-gray-800 focus:ring-sky-600"/>
                      <span className="ml-1.5 text-[0.7rem]">{option.label}</span>
                    </label>
                  ))}
                  {(directive.options.length > 0 || directive.key.includes('report') || directive.key.includes('custom')) && (
                     <div className="mt-1">
                        <label htmlFor={`${directive.key}-custom`} className="block text-[0.65rem] font-medium text-gray-400 mb-0.5">{directive.key.includes('report') ? 'Endpoint/Group:' : 'Additional Sources (space separated):'}</label>
                        <input type="text" id={`${directive.key}-custom`} value={directive.customValue} onChange={e => handleCustomValueChange(directive.key, e.target.value)} placeholder={directive.key.includes('report') ? '/api/r' : "host data: 'self'"} className="w-full p-0.5 text-[0.7rem] rounded-sm bg-gray-700/70 border border-gray-600/80 text-gray-200 focus:ring-sky-500 focus:border-sky-500 shadow-inner"/>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="md:col-span-2 mt-1 p-3 bg-gray-900/60 rounded-lg shadow-lg">
            <h4 className="text-[0.85rem] font-semibold text-sky-300 mb-1">Generated CSP Header:</h4>
            <textarea readOnly rows={2} className="w-full p-1.5 rounded-md bg-gray-800/90 border border-gray-600/70 text-gray-300 font-mono text-[0.65rem] shadow-inner" value={generatedCsp} placeholder="CSP appears here."/>
          </div>
        </div>
      </SecurityHeaderController>

      <div className="mt-5 p-3.5 bg-gray-800/70 rounded-lg shadow-xl backdrop-blur-sm">
        <h3 className="text-base font-semibold mb-3 text-sky-300 border-b border-gray-700/80 pb-1.5">CSP Test Bench (Actual Results)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TestItem title="インラインスクリプト (eval)" expectation={expectedInlineEval} actual={inlineScriptResult} notes="script-src: 'unsafe-eval' が必要">
            <button onClick={attemptInlineScriptEval} className="px-2 py-0.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-[0.7rem] mr-1.5 shadow transition-colors">eval()実行</button>
          </TestItem>
          <TestItem title="インライン <script> タグ" expectation={expectedInlineScriptTag} actual={inlineScriptTagResult} notes="script-src: 'unsafe-inline' or nonce/hash">
            <script dangerouslySetInnerHTML={{ __html: `console.log("Inline <script> tag exec."); window.inlineScriptTagExecuted = true;` }} />
          </TestItem>
          <TestItem title="外部スクリプト (cdnjs dayjs)" expectation={expectedExternalScript} actual={externalScriptStatus} notes="script-src: https://cdnjs.cloudflare.com">
             <script id="external-script-loader" src="https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.11.10/dayjs.min.js" async
                onLoad={() => setExternalScriptStatus('ロード成功')} onError={() => setExternalScriptStatus('ロード失敗/ブロック')}/>
          </TestItem>
          <TestItem title="インライン style 属性" expectation={expectedInlineStyle} actual={inlineStyleResult} notes="style-src: 'unsafe-inline'">
            <div id="test-inline-style-attr" style={{ backgroundColor: 'orange', padding: '3px 5px', border: '1px dashed cyan', fontSize: '0.7rem' }}>Style属性テスト</div>
          </TestItem>
          <TestItem title="外部 CSS ファイル" expectation={expectedExternalCss} actual={externalCSSStatus} notes="style-src: 'self' (for /test-external.css)">
            <link rel="stylesheet" href="/test-external.css" />
            <p id="test-external-css" className="text-[0.7rem]">外部CSS適用テスト</p>
            <div id="external-css-status-text" className="text-[0.7rem]"></div>
          </TestItem>
          <TestItem title="外部フォント (Google Fonts)" expectation={expectedFont} actual={fontStatus} notes="font-src: https://fonts.gstatic.com, style-src: 'unsafe-inline' (for style tag) & https://fonts.googleapis.com (for @import)">
            <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron&display=swap'); #font-orbitron-csp-test-el { font-family: 'Orbitron', cursive !important; }`}</style>
            <p id="font-orbitron-csp-test-el" className="text-sm">Orbitronフォント?</p>
            <div id="font-status-text" className="text-[0.7rem]"></div>
          </TestItem>
          <TestItem title="画像: 外部 (picsum.photos)" expectation={expectedImgExt} actual={imgExtStatus ? '表示成功' : 'ブロック'} notes="img-src: https://picsum.photos">
            <img src="https://picsum.photos/id/20/100/50" alt="Ext Img" className="rounded shadow-sm h-10" onError={() => setImgExtStatus(false)} onLoad={() => setImgExtStatus(true)}/>
          </TestItem>
          <TestItem title="画像: ローカル (/next.svg)" expectation={expectedImgSelf} actual={imgSelfStatus ? '表示成功' : 'ブロック'} notes="img-src: 'self'">
            <img src="/next.svg" alt="Self Img" className="rounded shadow-sm bg-white p-0.5 h-10" onError={() => setImgSelfStatus(false)} onLoad={() => setImgSelfStatus(true)}/>
          </TestItem>
          <TestItem title="画像: Data URI" expectation={expectedImgData} actual={imgDataStatus ? '表示成功' : 'ブロック'} notes="img-src: data:">
            <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=" alt="Data URI" className="rounded border border-gray-500 h-10 w-16 object-cover" style={{imageRendering:'pixelated'}} onError={() => setImgDataStatus(false)} onLoad={() => setImgDataStatus(true)}/>
          </TestItem>
          <TestItem title="Iframe (example.com)" expectation={expectedIframe} actual={iframeStatus} notes="frame-src: https://example.com">
            <iframe src="https://example.com" className="w-full h-16 rounded border border-gray-500/80 shadow-sm" title="CSP Test Iframe"
              onLoad={() => setIframeStatus('ロード成功')} onError={() => setIframeStatus('ロード失敗/ブロック')}/>
          </TestItem>
        </div>
      </div>
    </div>
  );
}
