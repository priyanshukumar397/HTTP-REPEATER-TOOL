const { useState, useEffect } = React;

function HTTPRepeater() {
  const [request, setRequest] = useState({
    method: 'GET',
    url: 'https://httpbin.org/get',
    headers: 'User-Agent: Mozilla/5.0\nAccept: application/json',
    body: ''
  });
  
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [capturedRequests, setCapturedRequests] = useState([]);

  useEffect(() => {
    // Listen for network requests
    if (chrome.devtools && chrome.devtools.network) {
      chrome.devtools.network.onRequestFinished.addListener((req) => {
        // Store captured request
        const captured = {
          id: Date.now() + Math.random(),
          method: req.request.method,
          url: req.request.url,
          timestamp: new Date().toLocaleTimeString()
        };
        
        setCapturedRequests(prev => [captured, ...prev].slice(0, 50)); // Keep last 50
      });
    }
  }, []);

  const loadCapturedRequest = async (capturedReq) => {
    // Get full request details
    chrome.devtools.network.onRequestFinished.addListener(async (req) => {
      if (req.request.url === capturedReq.url) {
        const headers = req.request.headers
          .map(h => `${h.name}: ${h.value}`)
          .join('\n');
        
        let body = '';
        if (req.request.postData) {
          body = req.request.postData.text || '';
        }
        
        setRequest({
          method: req.request.method,
          url: req.request.url,
          headers: headers,
          body: body
        });
      }
    });
    
    // Fallback: basic population
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
        if (key && values.length) {
          headers[key.trim()] = values.join(':').trim();
        }
      });

      const options = {
        method: request.method,
        headers
      };

      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        options.body = request.body;
      }

      const startTime = performance.now();
      const res = await fetch(request.url, options);
      const endTime = performance.now();
      
      const responseHeaders = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

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
      setResponse({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: err.message,
        time: 0
      });
    }
    
    setLoading(false);
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response.body);
    }
  };

  const clearAll = () => {
    setResponse(null);
    setRequest({
      method: 'GET',
      url: '',
      headers: '',
      body: ''
    });
  };

  return React.createElement('div', { className: 'h-screen flex bg-gray-900 text-gray-100' },
    // Sidebar for captured requests
    React.createElement('div', { className: 'w-64 border-r border-gray-700 flex flex-col' },
      React.createElement('div', { className: 'p-3 bg-gray-800 border-b border-gray-700 font-semibold text-sm' }, 
        'Captured Requests'
      ),
      React.createElement('div', { className: 'flex-1 overflow-auto' },
        capturedRequests.length === 0 
          ? React.createElement('div', { className: 'p-4 text-center text-gray-500 text-sm' },
              'Browse websites to capture requests'
            )
          : capturedRequests.map(req =>
              React.createElement('div', {
                key: req.id,
                onClick: () => loadCapturedRequest(req),
                className: 'p-3 border-b border-gray-800 hover:bg-gray-800 cursor-pointer'
              },
                React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                  React.createElement('span', { 
                    className: `px-2 py-0.5 text-xs font-semibold rounded ${
                      req.method === 'GET' ? 'bg-blue-900 text-blue-200' :
                      req.method === 'POST' ? 'bg-green-900 text-green-200' :
                      'bg-yellow-900 text-yellow-200'
                    }`
                  }, req.method),
                  React.createElement('span', { className: 'text-xs text-gray-500' }, req.timestamp)
                ),
                React.createElement('div', { className: 'text-xs text-gray-300 truncate' }, 
                  new URL(req.url).pathname || '/'
                ),
                React.createElement('div', { className: 'text-xs text-gray-500 truncate' }, 
                  new URL(req.url).hostname
                )
              )
            )
      )
    ),
    
    // Main content
    React.createElement('div', { className: 'flex-1 flex flex-col' },
      React.createElement('div', { className: 'flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700' },
        React.createElement('h1', { className: 'text-xl font-bold' }, 'HTTP Repeater'),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', {
            onClick: () => setCapturedRequests([]),
            className: 'px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm'
          }, 'Clear History'),
          React.createElement('button', {
            onClick: clearAll,
            className: 'px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-2'
          }, '🗑 Clear')
        )
      ),

      React.createElement('div', { className: 'flex-1 flex overflow-hidden' },
        React.createElement('div', { className: 'w-1/2 flex flex-col border-r border-gray-700' },
          React.createElement('div', { className: 'p-4 bg-gray-800 border-b border-gray-700' },
            React.createElement('div', { className: 'flex gap-2 mb-3' },
              React.createElement('select', {
                value: request.method,
                onChange: (e) => setRequest({...request, method: e.target.value}),
                className: 'px-3 py-2 bg-gray-700 rounded border border-gray-600'
              },
                React.createElement('option', null, 'GET'),
                React.createElement('option', null, 'POST'),
                React.createElement('option', null, 'PUT'),
                React.createElement('option', null, 'DELETE'),
                React.createElement('option', null, 'PATCH'),
                React.createElement('option', null, 'OPTIONS'),
                React.createElement('option', null, 'HEAD')
              ),
              React.createElement('input', {
                type: 'text',
                value: request.url,
                onChange: (e) => setRequest({...request, url: e.target.value}),
                placeholder: 'https://example.com/api',
                className: 'flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600'
              }),
              React.createElement('button', {
                onClick: sendRequest,
                disabled: loading || !request.url,
                className: 'px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 rounded flex items-center gap-2'
              }, '→ Send')
            )
          ),
          React.createElement('div', { className: 'flex-1 flex flex-col overflow-hidden' },
            React.createElement('div', { className: 'px-4 py-2 bg-gray-800 text-sm font-semibold' }, 'Headers'),
            React.createElement('textarea', {
              value: request.headers,
              onChange: (e) => setRequest({...request, headers: e.target.value}),
              className: 'flex-1 p-4 bg-gray-900 border-b border-gray-700 font-mono text-sm resize-none',
              placeholder: 'Header-Name: value'
            }),
            ['POST', 'PUT', 'PATCH'].includes(request.method) && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'px-4 py-2 bg-gray-800 text-sm font-semibold' }, 'Body'),
              React.createElement('textarea', {
                value: request.body,
                onChange: (e) => setRequest({...request, body: e.target.value}),
                className: 'flex-1 p-4 bg-gray-900 font-mono text-sm resize-none',
                placeholder: '{"key": "value"}'
              })
            )
          )
        ),
        React.createElement('div', { className: 'w-1/2 flex flex-col bg-gray-900' },
          response ? React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between' },
              React.createElement('div', { className: 'flex items-center gap-4' },
                React.createElement('span', {
                  className: `px-2 py-1 rounded text-sm font-semibold ${
                    response.status >= 200 && response.status < 300 ? 'bg-green-900 text-green-200' :
                    response.status >= 400 ? 'bg-red-900 text-red-200' :
                    'bg-yellow-900 text-yellow-200'
                  }`
                }, `${response.status} ${response.statusText}`),
                React.createElement('span', { className: 'text-sm text-gray-400' }, `${response.time}ms`)
              ),
              React.createElement('button', {
                onClick: copyResponse,
                className: 'px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-2'
              }, '⎘ Copy')
            ),
            React.createElement('div', { className: 'px-4 py-2 bg-gray-800 text-sm font-semibold' }, 'Response Headers'),
            React.createElement('div', { className: 'p-4 bg-gray-900 border-b border-gray-700 font-mono text-sm' },
              Object.entries(response.headers).map(([key, value]) =>
                React.createElement('div', { key: key, className: 'text-gray-300' },
                  React.createElement('span', { className: 'text-blue-400' }, key), ': ', value
                )
              )
            ),
            React.createElement('div', { className: 'px-4 py-2 bg-gray-800 text-sm font-semibold' }, 'Response Body'),
            React.createElement('pre', { className: 'flex-1 p-4 overflow-auto font-mono text-sm text-gray-300' },
              response.body
            )
          ) : React.createElement('div', { className: 'flex-1 flex items-center justify-center text-gray-500' },
            loading ? 'Sending request...' : 'Send a request to see the response'
          )
        )
      )
    )
  );
}

ReactDOM.render(
  React.createElement(HTTPRepeater),
  document.getElementById('root')
);