// Injected into every mail.google.com tab.
// Does nothing until popup.js sends a "getEmailList" message.

// Gmail's inline/table layout causes innerText to emit runs of spaces instead
// of newlines between sections. This collapses those runs while preserving
// intentional line breaks.
function normalizeBody(text) {
  return text
    .replace(/[^\S\n]+/g, ' ')   // collapse runs of spaces/tabs → single space
    .replace(/ *\n */g, '\n')     // strip spaces around newlines
    .replace(/\n{3,}/g, '\n\n')  // collapse 3+ blank lines → one blank line
    .trim()
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'getEmailList') return

  // .gs = one container per email message in a Gmail thread (collapsed or expanded)
  const containers = [...document.querySelectorAll('.gs')]

  if (!containers.length) {
    sendResponse({ error: 'No emails found. Make sure a thread is open.' })
    return true
  }

  const emails = containers.map((container, index) => {
    // Sender name + email
    const senderEl     = container.querySelector('.gD')
    const sender       = senderEl?.getAttribute('name') || senderEl?.innerText?.trim() || 'Unknown'
    const senderEmail  = senderEl?.getAttribute('email') || ''

    // Date — .g3 holds the timestamp; title attr has the full formatted date
    const dateEl = container.querySelector('.g3')
    const date   = dateEl?.getAttribute('title') || dateEl?.innerText?.trim() || ''

    // Body — only present when the email is expanded
    const bodyEl = container.querySelector('.a3s.aiL')
    let body    = null
    let preview = ''

    if (bodyEl) {
      const rect = bodyEl.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        // Strip quoted replies so we only get the new content
        const clone = bodyEl.cloneNode(true)
        clone.querySelectorAll('.gmail_quote, .gmail_attr').forEach(q => q.remove())
        const stripped = normalizeBody(clone.innerText)
        // Fall back to full body if stripping removed too much
        body    = stripped.length > 40 ? stripped : normalizeBody(bodyEl.innerText)
        preview = body.slice(0, 100)
      }
    }

    // Fallback preview from the snippet shown in collapsed headers
    if (!preview) {
      const snippetEl = container.querySelector('.y2')
      preview = snippetEl?.innerText?.trim()?.slice(0, 100) || ''
    }

    return {
      index,
      sender,
      senderEmail,
      date,
      preview,
      body,
      hasBody: body !== null && body.length > 0,
    }
  })

  // Filter out empty containers (Gmail sometimes has ghost .gs elements)
  const filtered = emails.filter(e => e.sender !== 'Unknown' || e.preview || e.hasBody)

  if (!filtered.length) {
    sendResponse({ error: 'No emails found. Make sure a thread is open.' })
    return true
  }

  sendResponse({ emails: filtered })
  return true
})
