/* ==========================================================================
   ShortsForge Premium Frontend Javascript
   ========================================================================== */

// --- Configuration ---
const USE_MOCK = true // Set to false to hit live SerpApi backend
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 Hours Cache

// State variables
let currentVideos = []

// --- DOM References ---
const queryInput = document.getElementById("query")
const countSelect = document.getElementById("count")
const searchBtn = document.getElementById("searchBtn")
const resultsGrid = document.getElementById("results")
const statusText = document.getElementById("status")
const downloadsList = document.getElementById("downloadsList")
const refreshDownloadsBtn = document.getElementById("refreshDownloadsBtn")
const filterChips = document.querySelectorAll(".chip")

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
    // Check if we are in Mock Mode to show user
    if (USE_MOCK) {
        showToast("Development Mode: Serving Mock Data", "info")
        updateStatus("Mock Mode Active — API Quota Protected")
    } else {
        updateStatus("Live Mode Active — Ready")
    }

    // Load downloaded library on startup
    loadDownloadsList()

    // Start cycling placeholder effect
    startPlaceholderCycle()

    // Bind event listeners
    searchBtn.addEventListener("click", handleSearchClick)
    refreshDownloadsBtn.addEventListener("click", loadDownloadsList)

    // Setup filter chips
    filterChips.forEach(chip => {
        chip.addEventListener("click", (e) => {
            // Remove active classes
            filterChips.forEach(c => c.classList.remove("active"))
            // Add active to clicked
            chip.classList.add("active")
            
            // Fill input and run search
            queryInput.value = chip.dataset.query
            executeSearch()
        })
    })

    // Perform initial search
    executeSearch()
})

// --- Search Handler & Debouncing ---
async function handleSearchClick() {
    // Basic debounce to avoid double clicks
    searchBtn.disabled = true
    searchBtn.textContent = "Loading..."
    
    await executeSearch()
    
    // Cool-down before re-enabling
    setTimeout(() => {
        searchBtn.disabled = false
        searchBtn.textContent = "Search"
    }, 1200)
}

// --- The Core Search Routine ---
async function executeSearch() {
    const q = queryInput.value.trim()
    const count = countSelect.value

    if (!q) {
        showToast("Please enter a search query", "error")
        return
    }

    // Render skeleton loaders instantly
    renderSkeletons(count)
    updateStatus(`Searching for "${q}"...`)

    // 1. Check Caching Layer (if not in mock mode)
    if (!USE_MOCK) {
        const cachedResults = getCachedSearch(q, count)
        if (cachedResults) {
            console.log(`[Cache Hit] Serving search for "${q}" from local storage.`)
            currentVideos = cachedResults
            renderVideos()
            updateStatus(`Found ${currentVideos.length} videos (Served from local cache)`)
            return
        }
    }

    // 2. Fetch Results
    try {
        if (USE_MOCK) {
            // Simulate network lag of 800ms for natural feel
            await new Promise(resolve => setTimeout(resolve, 800))
            
            // If the mockData script is loaded, filter it by keyword, else use default
            if (typeof MOCK_VIDEOS !== 'undefined') {
                // Return a subset matching count
                currentVideos = MOCK_VIDEOS.slice(0, parseInt(count))
            } else {
                currentVideos = []
            }
        } else {
            // Call live server search endpoint
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&count=${count}`)
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`)
            
            const data = await res.json()
            currentVideos = data.videos || []

            // Store in LocalStorage Cache
            if (currentVideos.length > 0) {
                setCachedSearch(q, count, currentVideos)
            }
        }

        if (currentVideos.length === 0) {
            resultsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; width: 100%;">
                    <h3>No short videos found</h3>
                    <p>Try refining your query terms.</p>
                </div>
            `
            updateStatus("No search results.")
            return
        }

        updateStatus(`Found ${currentVideos.length} video(s)`)
        renderVideos()

    } catch (err) {
        console.error("Search Error:", err)
        resultsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; width: 100%; border-color: var(--red);">
                <h3 style="color: var(--red);">Search failed</h3>
                <p>${err.message || "An unexpected error occurred."}</p>
            </div>
        `
        updateStatus("Error fetching results.")
        showToast("Failed to fetch videos from server", "error")
    }
}

// --- Waterfall Render Cards ---
function renderVideos() {
    resultsGrid.innerHTML = currentVideos.map((v, i) => `
        <div class="card" style="--index: ${i}">
            <div class="card-media-wrapper">
                <div class="badge-group">
                    <span class="badge badge-source">${v.source || "Short Video"}</span>
                    ${v.duration ? `<span class="badge badge-duration">${v.duration}</span>` : ""}
                </div>
                <img src="${v.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400'}"
                     alt="${v.title || 'Video'}"
                     onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400'"/>
            </div>
            <div class="card-body">
                <h3>${v.title || 'Untitled Short Video'}</h3>
                <div class="download-btn-wrapper">
                    <button id="download-btn-${i}" class="card-download-btn" onclick="downloadVideo(${i})">
                        <span>⚡</span> Download
                    </button>
                </div>
            </div>
        </div>
    `).join('')
}

// --- Render Skeleton Shimmers ---
function renderSkeletons(count) {
    let skeletonsHtml = ''
    for (let i = 0; i < count; i++) {
        skeletonsHtml += `
            <div class="skeleton-card">
                <div class="skeleton-media"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-btn"></div>
                </div>
            </div>
        `
    }
    resultsGrid.innerHTML = skeletonsHtml
}

// --- Download Module ---
async function downloadVideo(index) {
    const video = currentVideos[index]
    const btn = document.getElementById(`download-btn-${index}`)

    if (!video || !btn) return

    // Disable button and set state
    btn.disabled = true
    btn.classList.add("downloading")
    btn.style.setProperty('--progress', '0%')
    btn.textContent = "Downloading... 0%"
    showToast(`Downloading: "${video.title.substring(0, 30)}..."`, "info")

    if (USE_MOCK) {
        // Simulate SSE progress client-side
        let percent = 0
        const interval = setInterval(() => {
            percent += Math.floor(Math.random() * 15) + 5
            if (percent >= 100) {
                percent = 100
                clearInterval(interval)
                
                btn.textContent = "Done ✅"
                btn.classList.remove("downloading")
                btn.classList.add("done")
                showToast("Successfully downloaded video!", "success")
                
                saveMockDownload(video.title)
                loadDownloadsList()
            } else {
                btn.textContent = `Downloading... ${percent}%`
                btn.style.setProperty('--progress', `${percent}%`)
            }
        }, 300)
        return
    }

    // Setup EventSource for SSE download stream
    const url = `/api/download-stream?url=${encodeURIComponent(video.link)}&title=${encodeURIComponent(video.title)}`
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            if (data.status === 'progress') {
                const percent = data.percent
                btn.textContent = `Downloading... ${percent}%`
                btn.style.setProperty('--progress', `${percent}%`)
            } else if (data.status === 'complete') {
                btn.textContent = "Done ✅"
                btn.classList.remove("downloading")
                btn.classList.add("done")
                showToast("Successfully downloaded video!", "success")
                eventSource.close()
                loadDownloadsList()
            } else if (data.status === 'error') {
                throw new Error(data.message || "Failed to download.")
            }
        } catch (err) {
            handleDownloadError(btn, err, video.link, eventSource)
        }
    }

    eventSource.onerror = (err) => {
        handleDownloadError(btn, new Error("Server connection lost mid-download"), video.link, eventSource)
    }
}

function handleDownloadError(btn, err, videoLink, eventSource) {
    console.error("Download Stream Error:", err)
    if (eventSource) eventSource.close()

    btn.textContent = "Failed ❌"
    btn.classList.remove("downloading")
    btn.classList.add("error")

    // Custom warning for TikTok downloads
    const isTikTok = videoLink.includes("tiktok.com") || videoLink.includes("vt.tiktok.com")
    const displayError = (isTikTok || err.message.includes("blocked"))
        ? "This platform blocked the download, try another video."
        : (err.message || "Failed to download video")

    showToast(displayError, "error")

    // Reset button state after cooldown
    setTimeout(() => {
        btn.disabled = false
        btn.textContent = "Download"
        btn.classList.remove("error")
        btn.style.removeProperty('--progress')
    }, 3500)
}

function saveMockDownload(title) {
    try {
        const mockDownloads = JSON.parse(localStorage.getItem("mock_downloads") || "[]")
        const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`
        if (!mockDownloads.includes(fileName)) {
            mockDownloads.push(fileName)
            localStorage.setItem("mock_downloads", JSON.stringify(mockDownloads))
        }
    } catch (e) {
        console.error(e)
    }
}

// --- Local Downloads Library Sidebar ---
async function loadDownloadsList() {
    downloadsList.innerHTML = `<li style="justify-content: center; font-size: 0.8rem;">Loading library...</li>`
    
    if (USE_MOCK) {
        try {
            let files = JSON.parse(localStorage.getItem("mock_downloads") || "[]")
            if (files.length === 0) {
                files = ["stoic_mindset_motivation.mp4", "gaming_apex_clutch.mp4"]
                localStorage.setItem("mock_downloads", JSON.stringify(files))
            }
            renderDownloads(files)
        } catch (e) {
            downloadsList.innerHTML = `<li class="empty-state">No downloads yet. Get clipping!</li>`
        }
        return
    }

    try {
        const res = await fetch('/api/downloads')
        if (!res.ok) throw new Error("Failed to fetch downloads list")
        
        const data = await res.json()
        const files = data.files || []
        renderDownloads(files)
    } catch (err) {
        console.error("Library Read Error:", err)
        downloadsList.innerHTML = `<li class="empty-state" style="color: var(--red);">Failed to load library</li>`
    }
}

function renderDownloads(files) {
    if (files.length === 0) {
        downloadsList.innerHTML = `<li class="empty-state">No downloads yet. Get clipping!</li>`
        return
    }

    downloadsList.innerHTML = files.map(file => {
        const displayName = file.length > 28 ? file.substring(0, 25) + "..." : file
        const downloadUrl = USE_MOCK ? "#" : `/downloads/${encodeURIComponent(file)}`
        return `
            <li>
                <div class="file-info">
                    <div class="file-name" title="${file}">${displayName}</div>
                    <div class="file-status">${USE_MOCK ? "Simulated Video" : "Local Audio/Video"}</div>
                </div>
                <a href="${downloadUrl}" ${USE_MOCK ? "" : 'target="_blank"'} class="file-link" title="Open file" onclick="${USE_MOCK ? "showToast('Mock File Open: This is a static demo!', 'info'); return false;" : ""}">
                    📥
                </a>
            </li>
        `
    }).join('')
}


// --- LocalStorage Caching Strategy ---
function getCachedSearch(query, count) {
    const key = `search_${query.toLowerCase()}_${count}`
    try {
        const itemStr = localStorage.getItem(key)
        if (!itemStr) return null

        const item = JSON.parse(itemStr)
        const now = new Date()

        // Check if cache has expired
        if (now.getTime() - item.timestamp > CACHE_EXPIRY_MS) {
            localStorage.removeItem(key)
            return null
        }
        return item.value
    } catch (e) {
        return null
    }
}

function setCachedSearch(query, count, results) {
    const key = `search_${query.toLowerCase()}_${count}`
    try {
        const data = {
            value: results,
            timestamp: new Date().getTime()
        }
        localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
        console.warn("LocalStorage caching error:", e)
    }
}

// --- Typewriter Cycling Placeholders ---
function startPlaceholderCycle() {
    const placeholders = [
        "Search stoicism clips...",
        "Search gaming highlights...",
        "Search anime cuts...",
        "Search psychology insights..."
    ]
    let index = 0
    
    setInterval(() => {
        index = (index + 1) % placeholders.length
        const nextPlaceholder = placeholders[index]
        
        // Simple smooth placeholder swap
        queryInput.style.opacity = 0
        setTimeout(() => {
            queryInput.placeholder = nextPlaceholder
            queryInput.style.opacity = 1
        }, 150)
        
    }, 3500)
}

// --- Custom Toast Notification ---
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer")
    if (!container) return

    const toast = document.createElement("div")
    toast.className = `toast toast-${type}`
    
    // Type specific symbols
    let symbol = "ℹ️"
    if (type === "success") symbol = "✅"
    if (type === "error") symbol = "⚠️"
    
    toast.innerHTML = `<span>${symbol}</span><span>${message}</span>`
    container.appendChild(toast)

    // Start removal trigger after 3.5 seconds
    setTimeout(() => {
        toast.classList.add("removing")
        // Remove from DOM once transition completes
        toast.addEventListener("transitionend", () => {
            toast.remove()
        })
    }, 3500)
}

// --- Status Dashboard Logger ---
function updateStatus(msg) {
    statusText.textContent = msg
}