const { useState, useEffect } = React;

function HTTPRepeater() {
  // --- STATE: HTTP REPEATER ---
  const [request, setRequest] = useState({
    method: 'GET',
    url: 'https://httpbin.org/get',
    headers: 'User-Agent: Mozilla/5.0\nAccept: application/json',
    body: ''
  });
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [capturedRequests, setCapturedRequests] = useState([]);

  // --- STATE: JS ANALYZER (REP+) ---
  const [scripts, setScripts] = useState([]);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' or 'analyzer'

  // --- LOGIC: JS ANALYZER ---
  const analyzeScripts = () => {
    if (!chrome.devtools || !chrome.devtools.inspectedWindow) return;

    chrome.devtools.inspectedWindow.getResources((resources) => {
      // Filter for scripts only
      const jsResources = resources.filter(res => res.type === 'script' || res.url.endsWith('.js'));
      
      const analysisPromises = jsResources.map(res => {
        return new Promise((resolve) => {
          res.getContent((content) => {
            if (!content) return resolve(null);
            
            const issues = [];
            // Security "Vibe Check" Patterns
            if (/eval\(|setTimeout\(.*['"].*['"]\)/.test(content)) issues.push("⚠️ Dangerous Execution (eval)");
            if (/(innerHTML|outerHTML|document\.write)/.test(content)) issues.push("⚠️ DOM XSS Sink Found");
            if (/(AIza[0-9A-Za-z-_]{35})/.test(content)) issues.push("🚨 Google API Key Leak");
            if (/(sk-[a-zA-Z0-9]{48})/.test(content)) issues.push("🚨 OpenAI Key Leak");
            if (/(?:aws_access_key_id|aws_secret_access_key)/i.test(content)) issues.push("🚨 AWS Credentials?");
            if (/firebaseio\.com/.test(content)) issues.push("ℹ️ Firebase URL Found");

            resolve({
              url: res.url.split('/').pop() || 'inline-script',
              fullUrl: res.url,
              issues: issues,
              vibe: issues.length === 0 ? 'Clean' : 'Sketchy'
            });
          });
        });
      });

      Promise.all(analysisPromises).then(results => {
        setScripts(results.filter(r => r !== null));
      });
    });
  };

  // --- EFFECTS ---
  useEffect(() => {
    // 1. Listen for network requests for the Repeater
    if (chrome.devtools && chrome.devtools.network) {
      chrome.devtools.network.onRequestFinished.addListener((req) => {
        const captured = {
          id: Date.now() + Math.random(),
          method: req.request.method,
          url: req.request.url,
          timestamp: new Date().toLocaleTimeString()
        };
        setCapturedRequests(prev => [captured, ...prev].slice(0, 50));
      });

      // 2. Re-run analyzer on page navigation
      chrome.devtools.network.onNavigated.addListener(() => {
        analyzeScripts();
      });
    }
    
    // Initial scan
    analyzeScripts();
  }, []);

  // --- HANDLERS ---
  const loadCapturedRequest = (capturedReq) => {
    setRequest({
      method: capturedReq.method,
      url: capturedReq.url,
      headers: 'User-Agent: Mozilla/5.0\nAccept: application/json',
      body: ''
    });
  };

  const sendRequest = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const headers = {};
      request.headers.split('\n').forEach(line => {
        const [key, ...values] = line.split(':');
        if (key && values.length) headers[key.trim()] = values.join(':').trim();
      });

      const options = { method: request.method, headers };
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        options.body = request.body;
      }

      const startTime = performance.now();
      const res = await fetch(request.url, options);
      const endTime = performance.now();
      
      const responseHeaders = {};
      res.headers.forEach((v, k) => responseHeaders[k] = v);

      let responseBody;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseBody = JSON.stringify(await res.json(), null, 2);
      } else {
        responseBody = await res.text();
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
        time: Math.round(endTime - startTime)
      });
    } catch (err) {
      setResponse({ status: 0, statusText: 'Error', headers: {}, body: err.message, time: 0 });
    }
    setLoading(false);
  };

  // --- UI COMPONENTS ---
  const renderSidebarContent = () => {
    if (activeTab === 'requests') {
      return React.createElement('div', { className: 'flex-1 overflow-auto' },
        capturedRequests.length === 0 
          ? React.createElement('div', { className: 'p-4 text-center text-gray-500 text-sm' }, 'Browse to capture requests')
          : capturedRequests.map(req =>
              React.createElement('div', {
                key: req.id,
                onClick: () => loadCapturedRequest(req),
                className: 'p-3 border-b border-gray-800 hover:bg-gray-800 cursor-pointer'
              },
                React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                  React.createElement('span', { className: `px-2 py-0.5 text-[10px] font-bold rounded ${req.method === 'GET' ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'}` }, req.method),
                  React.createElement('span', { className: 'text-[10px] text-gray-500' }, req.timestamp)
                ),
                React.createElement('div', { className: 'text-[11px] text-gray-300 truncate' }, new URL(req.url).pathname),
                React.createElement('div', { className: 'text-[10px] text-gray-500 truncate' }, new URL(req.url).hostname)
              )
            )
      );
    } else {
      return React.createElement('div', { className: 'flex-1 overflow-auto' },
        React.createElement('button', { 
          onClick: analyzeScripts,
          className: 'w-full p-2 bg-indigo-900 hover:bg-indigo-800 text-xs font-bold' 
        }, 'RE-SCAN SCRIPTS'),
        scripts.map((s, i) => React.createElement('div', { key: i, className: 'p-3 border-b border-gray-800' },
          React.createElement('div', { 
            className: 'text-[11px] font-bold truncate text-blue-400 cursor-help',
            title: s.fullUrl 
          }, s.url),
          s.issues.length > 0 
            ? s.issues.map((issue, idx) => React.createElement('div', { key: idx, className: 'text-[10px] text-red-400 mt-1' }, issue))
            : React.createElement('div', { className: 'text-[10px] text-green-500 mt-1' }, '✓ Clean Vibe')
        ))
      );
    }
  };

  return React.createElement('div', { className: 'h-screen flex bg-gray-900 text-gray-100 font-sans' },
    // Sidebar
    React.createElement('div', { className: 'w-64 border-r border-gray-700 flex flex-col bg-gray-900' },
      React.createElement('div', { className: 'flex border-b border-gray-700' },
        React.createElement('button', { 
          onClick: () => setActiveTab('requests'),
          className: `flex-1 p-3 text-[10px] font-bold tracking-wider ${activeTab === 'requests' ? 'bg-gray-800 border-b-2 border-orange-500' : 'text-gray-500'}`
        }, 'REQUESTS'),
        React.createElement('button', { 
          onClick: () => { setActiveTab('analyzer'); analyzeScripts(); },
          className: `flex-1 p-3 text-[10px] font-bold tracking-wider ${activeTab === 'analyzer' ? 'bg-gray-800 border-b-2 border-indigo-500' : 'text-gray-500'}`
        }, 'JS ANALYZER (REP+)')
      ),
      renderSidebarContent()
    ),
    
    // Main Panel (Repeater)
    React.createElement('div', { className: 'flex-1 flex flex-col' },
      React.createElement('div', { className: 'flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700' },
        React.createElement('h1', { className: 'text-lg font-bold text-orange-500' }, 'REP+ REPEATER'),
        React.createElement('button', { onClick: () => setResponse(null), className: 'text-xs text-gray-400 hover:text-white' }, 'Reset')
      ),
      
      React.createElement('div', { className: 'flex-1 flex overflow-hidden' },
        // Request Column
        React.createElement('div', { className: 'w-1/2 flex flex-col border-r border-gray-700' },
          React.createElement('div', { className: 'p-4 bg-gray-800/50' },
            React.createElement('div', { className: 'flex gap-2' },
              React.createElement('select', {
                value: request.method,
                onChange: (e) => setRequest({...request, method: e.target.value}),
                className: 'px-2 py-1 bg-gray-700 rounded text-xs'
              }, ['GET', 'POST', 'PUT', 'DELETE'].map(m => React.createElement('option', {key: m}, m))),
              React.createElement('input', {
                value: request.url,
                onChange: (e) => setRequest({...request, url: e.target.value}),
                className: 'flex-1 px-3 py-1 bg-gray-700 rounded text-xs border border-gray-600'
              }),
              React.createElement('button', {
                onClick: sendRequest,
                className: 'px-4 py-1 bg-orange-600 hover:bg-orange-700 rounded text-xs font-bold'
              }, 'SEND')
            )
          ),
          React.createElement('textarea', {
            value: request.headers,
            onChange: (e) => setRequest({...request, headers: e.target.value}),
            className: 'flex-1 p-4 bg-gray-900 font-mono text-xs resize-none border-b border-gray-700',
            placeholder: 'Headers...'
          }),
          ['POST', 'PUT'].includes(request.method) && React.createElement('textarea', {
            value: request.body,
            onChange: (e) => setRequest({...request, body: e.target.value}),
            className: 'h-1/3 p-4 bg-gray-900 font-mono text-xs resize-none',
            placeholder: 'Body...'
          })
        ),
        
        // Response Column
        React.createElement('div', { className: 'w-1/2 flex flex-col' },
          response ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'p-2 bg-gray-800 flex gap-4 text-[10px] font-bold' },
              React.createElement('span', { className: response.status < 400 ? 'text-green-400' : 'text-red-400' }, `STATUS: ${response.status}`),
              React.createElement('span', { className: 'text-gray-400' }, `TIME: ${response.time}ms`)
            ),
            React.createElement('pre', { className: 'flex-1 p-4 overflow-auto font-mono text-xs text-gray-300' }, response.body)
          ) : React.createElement('div', { className: 'flex-1 flex items-center justify-center text-gray-600 text-sm' }, loading ? 'Vibing with the server...' : 'No Response Yet')
        )
      )
    )
  );
}

ReactDOM.render(React.createElement(HTTPRepeater), document.getElementById('root'));