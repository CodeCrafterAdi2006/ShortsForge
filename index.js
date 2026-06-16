require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const { execFile, spawn } = require("child_process")
const { getJson } = require("serpapi")

const app = express()
const PORT = process.env.PORT || 3000
const API_KEY = process.env.SERPAPI_KEY
const DOWNLOADS_DIR = path.join(__dirname, "downloads")

if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR)
}

app.use(express.json())
app.use(express.static(path.join(__dirname, "PUBLIC")))
app.use("/downloads", express.static(DOWNLOADS_DIR))

// In-Memory Search Cache
const searchCache = new Map()

app.get("/api/search", (req, res) => {
    const { q, count = 5 } = req.query

    if (!q) {
        return res.status(400).json({ error: "Query parameter 'q' is required" })
    }

    if (!API_KEY) {
        return res.status(500).json({ error: "SerpApi Key is not configured on the server." })
    }

    const cacheKey = `${q.trim().toLowerCase()}_${count}`
    if (searchCache.has(cacheKey)) {
        console.log(`[Cache Hit] Serving from memory: ${cacheKey}`)
        return res.json({ videos: searchCache.get(cacheKey) })
    }

    getJson({
        engine: "google_short_videos",
        q,
        api_key: API_KEY
    }, (json) => {
        const videos = (json.short_video_results || []).slice(0, parseInt(count))
        searchCache.set(cacheKey, videos)
        res.json({ videos })
    })
})

// GET /api/downloads: Lists all downloaded files in downloads directory
app.get("/api/downloads", (req, res) => {
    fs.readdir(DOWNLOADS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read downloads directory" })
        }
        // Exclude system files and subfolders
        const videoFiles = files.filter(file => {
            try {
                const stat = fs.statSync(path.join(DOWNLOADS_DIR, file))
                return stat.isFile() && !file.startsWith('.')
            } catch (e) {
                return false
            }
        })
        res.json({ files: videoFiles })
    })
})

// GET /api/download-stream: Server-Sent Events (SSE) route streaming yt-dlp download progress
app.get("/api/download-stream", (req, res) => {
    const { url, title } = req.query

    if (!url) {
        return res.status(400).json({ error: "URL query parameter is required" })
    }

    console.log(`[Download Stream Request] Starting download for: ${title || url}`)

    // Configure Headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const pythonPath = path.join(__dirname, ".venv", "Scripts", "python.exe")
    const outputPath = path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s")

    // Spawn yt-dlp in the python venv (we spawn it to get live output stream chunks)
    const child = spawn(pythonPath, ["-m", "yt_dlp", "-o", outputPath, url])

    // Parse stdout chunk-by-chunk
    child.stdout.on('data', (data) => {
        const text = data.toString()
        // Parse progress percentage (e.g. "[download]  12.5% of 10.00MiB...")
        const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (match) {
            const percent = match[1]
            res.write(`data: ${JSON.stringify({ status: 'progress', percent })}\n\n`)
        }
    })

    // Listen for stderr logs to log them on the server
    child.stderr.on('data', (data) => {
        const errText = data.toString()
        console.error(`[yt-dlp stderr] ${errText.trim()}`)
    })

    // Clean up: Kill yt-dlp child process if client disconnects mid-download
    req.on('close', () => {
        if (child && !child.killed) {
            console.log(`[SSE Connection Closed] Killing active download process for: ${title || url}`)
            child.kill()
        }
    })

    // Finished
    child.on('close', (code) => {
        console.log(`[Download Process Closed] Exit code: ${code}`)
        if (code === 0) {
            // Find downloaded file in folder to return actual name if possible, or fallback to title
            res.write(`data: ${JSON.stringify({ status: 'complete', title })}\n\n`)
        } else {
            const isTikTok = url.includes("tiktok.com") || url.includes("vt.tiktok.com")
            const errorMsg = isTikTok 
                ? "This platform blocked the download, try another video." 
                : `Download failed. (Exit code: ${code})`
            res.write(`data: ${JSON.stringify({ status: 'error', message: errorMsg })}\n\n`)
        }
        res.end()
    })
})

// POST /api/download (Legacy static fallback)
app.post("/api/download", (req, res) => {
    const { url, title } = req.body

    if (!url) {
        return res.status(400).json({ error: "URL is required" })
    }

    const pythonPath = path.join(__dirname, ".venv", "Scripts", "python.exe")
    const outputPath = path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s")

    execFile(pythonPath, ["-m", "yt_dlp", "-o", outputPath, url], (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ success: false, error: error.message || stderr })
        }
        res.json({ success: true })
    })
})

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
})