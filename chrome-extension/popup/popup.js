'use strict'

const DASHBOARD_URL = 'https://dashboard.cubehq.ai'
const EXTRACTOR_URL = 'https://REPLACE_WITH_RAILWAY_URL'

const ENDPOINTS = {
  seo:   '/api/tasks',
  email: '/api/email-tasks',
  paid:  '/api/paid-tasks',
}

let tasks                = []
let emails               = []
let members              = []
let selectedEmailIndices = new Set()

// ── DOM refs ────────────────────────────────────────────────────────────────
const clientSelect   = document.getElementById('client-select')
const tableSelect    = document.getElementById('table-select')
const analyzeBtn     = document.getElementById('analyze-btn')
const analyzeSpinner = document.getElementById('analyze-spinner')

const emailPickerSection = document.getElementById('email-picker-section')
const emailList          = document.getElementById('email-list')
const pickerBackBtn      = document.getElementById('picker-back-btn')
const pickerAnalyzeBtn   = document.getElementById('picker-analyze-btn')
const pickerSpinner      = document.getElementById('picker-spinner')

const previewModal    = document.getElementById('preview-modal')
const previewSender   = document.getElementById('preview-sender')
const previewDate     = document.getElementById('preview-date')
const previewBody     = document.getElementById('preview-body')
const previewCloseBtn = document.getElementById('preview-close-btn')

const tasksSection = document.getElementById('tasks-section')
const tasksList    = document.getElementById('tasks-list')
const addTaskBtn   = document.getElementById('add-task-btn')
const addBtn       = document.getElementById('add-btn')
const addSpinner   = document.getElementById('add-spinner')
const cancelBtn    = document.getElementById('cancel-btn')
const statusMsg    = document.getElementById('status-msg')

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadClients()
  loadTeamMembers()

  tableSelect.addEventListener('change', () => {
    if (tasks.length > 0) renderTasks()
  })
  analyzeBtn.addEventListener('click', handleGetEmailList)
  pickerBackBtn.addEventListener('click', closePicker)
  previewCloseBtn.addEventListener('click', closePreview)
  pickerAnalyzeBtn.addEventListener('click', handleAnalyzeSelected)
  addTaskBtn.addEventListener('click', addNewTask)
  addBtn.addEventListener('click', handleAddTasks)
  cancelBtn.addEventListener('click', reset)
})

// ── Step 0: Load clients ──────────────────────────────────────────────────
async function loadClients() {
  showStatus('Loading clients…', 'info')
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/clients?lite=1`, { credentials: 'include' })
    if (res.status === 401 || res.status === 403) throw new Error('Not logged in — open the dashboard and log in first.')
    if (!res.ok) throw new Error(`Dashboard returned ${res.status}. Is it running?`)

    const json    = await res.json()
    const clients = Array.isArray(json) ? json : (json.data ?? [])

    clientSelect.innerHTML = '<option value="">Select client…</option>'
    clients.forEach(c => {
      const opt       = document.createElement('option')
      opt.value       = c.id
      opt.textContent = c.name
      clientSelect.appendChild(opt)
    })
    clearStatus()
  } catch (err) {
    showStatus(err.message, 'error')
    analyzeBtn.disabled = true
  }
}

// ── Load team members ─────────────────────────────────────────────────────
async function loadTeamMembers() {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/team`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    members = Array.isArray(data) ? data : []
  } catch {
    members = []
  }
}

// ── Step 1: Get email list from thread ────────────────────────────────────
async function handleGetEmailList() {
  clearStatus()
  if (!clientSelect.value) return showStatus('Please select a client.', 'error')

  setAnalyzing(true)
  showStatus('Reading thread…', 'info')

  let response
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url?.startsWith('https://mail.google.com')) {
      throw new Error('Switch to a Gmail tab with a thread open.')
    }
    response = await chrome.tabs.sendMessage(tab.id, { action: 'getEmailList' })
  } catch (err) {
    setAnalyzing(false)
    showStatus(err.message || 'Could not reach Gmail tab. Try refreshing it.', 'error')
    return
  }

  setAnalyzing(false)

  if (response?.error) return showStatus(response.error, 'error')
  if (!response?.emails?.length) return showStatus('No emails found. Open a thread first.', 'error')

  emails               = response.emails
  selectedEmailIndices = new Set()
  pickerAnalyzeBtn.disabled = true

  renderEmailPicker()
  emailPickerSection.style.display = 'block'
  clearStatus()
}

// ── Render email picker ───────────────────────────────────────────────────
function renderEmailPicker() {
  emailList.innerHTML = ''

  const ordered = [...emails].reverse()

  ordered.forEach(email => {
    const item         = document.createElement('div')
    item.className     = 'email-item' + (!email.hasBody ? ' no-body' : '')
    item.dataset.index = email.index

    const header     = document.createElement('div')
    header.className = 'email-item-header'

    const senderEl       = document.createElement('span')
    senderEl.className   = 'email-sender'
    senderEl.textContent = email.sender || 'Unknown'

    const dateEl       = document.createElement('span')
    dateEl.className   = 'email-date'
    dateEl.textContent = formatDate(email.date)

    header.appendChild(senderEl)
    header.appendChild(dateEl)

    if (email.hasBody) {
      const viewBtn       = document.createElement('button')
      viewBtn.className   = 'email-view-btn'
      viewBtn.textContent = 'View'
      viewBtn.addEventListener('click', e => {
        e.stopPropagation()
        showPreview(email)
      })
      header.appendChild(viewBtn)
    }

    const preview       = document.createElement('div')
    preview.className   = 'email-preview'
    preview.textContent = email.preview || '(no preview)'

    item.appendChild(header)
    item.appendChild(preview)

    if (!email.hasBody) {
      const warn       = document.createElement('div')
      warn.className   = 'email-no-body-warning'
      warn.textContent = '⚠ Expand this email in Gmail first'
      item.appendChild(warn)
    } else {
      item.addEventListener('click', () => toggleEmail(email.index))
    }

    emailList.appendChild(item)
  })
}

function toggleEmail(index) {
  if (selectedEmailIndices.has(index)) {
    selectedEmailIndices.delete(index)
  } else {
    selectedEmailIndices.add(index)
  }

  emailList.querySelectorAll('.email-item').forEach(el => {
    el.classList.toggle('selected', selectedEmailIndices.has(parseInt(el.dataset.index)))
  })

  pickerAnalyzeBtn.disabled = selectedEmailIndices.size === 0
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (!isNaN(d)) {
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    }
  } catch {}
  return dateStr.replace(/\s+(EDT|EST|PST|PDT|UTC)$/i, '').trim()
}

function showPreview(email) {
  previewSender.textContent  = email.sender || 'Unknown'
  previewDate.textContent    = formatDate(email.date)
  previewBody.textContent    = email.body || ''
  previewModal.style.display = 'flex'
}

function closePreview() {
  previewModal.style.display = 'none'
  previewBody.textContent    = ''
}

function closePicker() {
  emailPickerSection.style.display = 'none'
  emails               = []
  selectedEmailIndices = new Set()
  clearStatus()
}

// ── Step 2: Analyze the selected emails ──────────────────────────────────
async function handleAnalyzeSelected() {
  if (selectedEmailIndices.size === 0) return

  const selectedEmails = emails.filter(e => selectedEmailIndices.has(e.index))
  const missingBody    = selectedEmails.find(e => !e.body)
  if (missingBody) {
    showStatus('One or more selected emails need to be expanded in Gmail first.', 'error')
    return
  }

  const combinedBody = selectedEmails
    .map((e, i) => `--- Email ${i + 1} (From: ${e.sender}) ---\n${e.body}`)
    .join('\n\n')

  const table = tableSelect.value
  const count = selectedEmails.length

  setPickerAnalyzing(true)
  showStatus(`Analyzing ${count} email${count !== 1 ? 's' : ''}…`, 'info')

  try {
    const res = await fetch(`${EXTRACTOR_URL}/extract-tasks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email_body: combinedBody, table }),
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      throw new Error(errJson?.data?.message ?? `Extractor returned ${res.status}`)
    }

    const result   = await res.json()
    const rawTasks = result?.data?.tasks ?? []

    if (rawTasks.length === 0) {
      showStatus('No actionable tasks found in this email.', 'info')
      return
    }

    tasks = rawTasks.map(t => ({ id: crypto.randomUUID(), title: t.title, status: '', priority: '', eta_end: '', assigned_to: '' }))
    renderTasks()
    emailPickerSection.style.display = 'none'
    tasksSection.style.display       = 'block'
    clearStatus()
  } catch (err) {
    showStatus(`AI error: ${err.message}`, 'error')
  } finally {
    setPickerAnalyzing(false)
  }
}

// ── Render task list ──────────────────────────────────────────────────────
function renderTasks() {
  tasksList.innerHTML = ''
  const isSeo = tableSelect.value === 'seo'

  tasks.forEach(task => {
    const item      = document.createElement('div')
    item.className  = 'task-item'
    item.dataset.id = task.id

    // Title row: editable input + remove button
    const titleRow     = document.createElement('div')
    titleRow.className = 'task-title-row'

    const titleInput       = document.createElement('input')
    titleInput.type        = 'text'
    titleInput.className   = 'task-title-input'
    titleInput.value       = task.title
    titleInput.placeholder = 'Task title…'
    titleInput.addEventListener('input', e => { task.title = e.target.value })

    const removeBtn       = document.createElement('button')
    removeBtn.className   = 'task-remove'
    removeBtn.title       = 'Remove'
    removeBtn.textContent = '✕'
    removeBtn.addEventListener('click', () => removeTask(task.id))

    titleRow.appendChild(titleInput)
    titleRow.appendChild(removeBtn)

    // Row 1: Status + Assign (always shown)
    const fieldsRow1     = document.createElement('div')
    fieldsRow1.className = 'task-fields-row'

    fieldsRow1.appendChild(makeSelect([
      ['', 'No status'],
      ['To Be Started', 'To Be Started'],
      ['In Progress', 'In Progress'],
      ['Pending Review', 'Pending Review'],
      ['Completed', 'Completed'],
      ['Implemented', 'Implemented'],
      ['Blocked', 'Blocked'],
    ], task.status, v => { task.status = v }))

    const assignOptions = [['', 'Unassigned'], ...members.map(m => [m.id, m.name])]
    fieldsRow1.appendChild(makeSelect(assignOptions, task.assigned_to, v => {
      task.assigned_to = v
    }))

    item.appendChild(titleRow)
    item.appendChild(fieldsRow1)

    // Row 2: Priority + ETA (SEO only)
    if (isSeo) {
      const fieldsRow2     = document.createElement('div')
      fieldsRow2.className = 'task-fields-row'

      fieldsRow2.appendChild(makeSelect([
        ['', 'Priority'],
        ['P0', 'P0 — Critical'],
        ['P1', 'P1 — High'],
        ['P2', 'P2 — Medium'],
        ['P3', 'P3 — Low'],
      ], task.priority, v => { task.priority = v }))

      const etaIn         = document.createElement('input')
      etaIn.type          = 'date'
      etaIn.className     = 'task-field-date'
      etaIn.value         = task.eta_end
      etaIn.addEventListener('change', e => { task.eta_end = e.target.value })
      fieldsRow2.appendChild(etaIn)

      item.appendChild(fieldsRow2)
    }
    tasksList.appendChild(item)
  })
}

function makeSelect(options, currentValue, onChange) {
  const sel     = document.createElement('select')
  sel.className = 'task-field-select'
  options.forEach(([value, label]) => {
    const opt       = document.createElement('option')
    opt.value       = value
    opt.textContent = label
    sel.appendChild(opt)
  })
  sel.value = currentValue
  sel.addEventListener('change', e => onChange(e.target.value))
  return sel
}

// ── Add / remove tasks ────────────────────────────────────────────────────
function addNewTask() {
  tasks.push({ id: crypto.randomUUID(), title: '', status: '', priority: '', eta_end: '', assigned_to: '' })
  renderTasks()
  const inputs = tasksList.querySelectorAll('.task-title-input')
  inputs[inputs.length - 1]?.focus()
}

function removeTask(id) {
  tasks = tasks.filter(t => t.id !== id)
  tasksList.querySelector(`.task-item[data-id="${id}"]`)?.remove()
  if (tasks.length === 0) {
    tasksSection.style.display = 'none'
    clearStatus()
  }
}

// ── Step 3: Post tasks to dashboard ──────────────────────────────────────
async function handleAddTasks() {
  const validTasks = tasks.filter(t => t.title.trim())
  if (validTasks.length === 0) return showStatus('No tasks to add.', 'error')

  const clientId = clientSelect.value
  const table    = tableSelect.value
  const endpoint = `${DASHBOARD_URL}${ENDPOINTS[table]}`

  setAdding(true)
  clearStatus()

  let success = 0
  let failed  = 0

  for (const task of validTasks) {
    const body = { title: task.title.trim(), client_id: clientId }
    if (task.status)      body.status      = task.status
    if (task.assigned_to) body.assigned_to = task.assigned_to
    if (table === 'seo') {
      if (task.priority) body.priority = task.priority
      if (task.eta_end)  body.eta_end  = task.eta_end
    }

    try {
      const res = await fetch(endpoint, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify(body),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        console.error(`Task failed [${res.status}]:`, errJson, body)
        failed++
      } else {
        success++
      }
    } catch (err) {
      console.error('Network error posting task:', err)
      failed++
    }
  }

  setAdding(false)

  if (failed === 0) {
    tasks = []
    tasksSection.style.display = 'none'
    showStatus(`${success} task${success !== 1 ? 's' : ''} added successfully ✓`, 'success')
  } else {
    showStatus(`${success} added, ${failed} failed — check the browser console for details.`, 'error')
  }
}

// ── Full reset ────────────────────────────────────────────────────────────
function reset() {
  tasks                = []
  emails               = []
  selectedEmailIndices = new Set()
  tasksList.innerHTML              = ''
  emailList.innerHTML              = ''
  tasksSection.style.display       = 'none'
  emailPickerSection.style.display = 'none'
  clearStatus()
}

// ── Loading helpers ───────────────────────────────────────────────────────
function setAnalyzing(on) {
  analyzeBtn.disabled          = on
  analyzeSpinner.style.display = on ? 'inline-block' : 'none'
}

function setPickerAnalyzing(on) {
  pickerAnalyzeBtn.disabled   = on
  pickerSpinner.style.display = on ? 'inline-block' : 'none'
}

function setAdding(on) {
  addBtn.disabled          = on
  addSpinner.style.display = on ? 'inline-block' : 'none'
}

// ── Status helpers ────────────────────────────────────────────────────────
function showStatus(msg, type) {
  statusMsg.textContent   = msg
  statusMsg.className     = `status-msg ${type}`
  statusMsg.style.display = 'block'
}

function clearStatus() {
  statusMsg.style.display = 'none'
  statusMsg.textContent   = ''
}
